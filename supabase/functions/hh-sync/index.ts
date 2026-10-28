/**
 * hh-sync — отклики с hh приходят в нашу воронку.
 *
 * Без этого рекрутер ведёт две системы: здесь Телеграм и база, там hh.
 * Люди переносятся копированием, часть теряется, сроки ответа считаются
 * по одной системе, а отвечают в другой.
 *
 * Что делает:
 *   1. Забирает отклики по нашим опубликованным вакансиям.
 *   2. Заводит кандидата, если такого ещё нет.
 *   3. Создаёт отклик на нужную вакансию — дальше он живёт как любой другой:
 *      те же этапы, тот же SLA, те же критерии.
 *
 * Запускается по расписанию и кнопкой «Синхронизировать» из интерфейса.
 *
 * Чего не делает: не тащит резюме файлом. hh отдаёт его структурой, но
 * хранить чужие персональные данные без нужды — плохая идея. Забираем
 * минимум для связи и ссылку, по которой рекрутер откроет полное резюме
 * на hh, если оно понадобится.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // Функцию дёргает и человек кнопкой, и планировщик по расписанию.
  // Планировщик ходит со служебным ключом, человек — со своим.
  const auth = req.headers.get("Authorization") ?? "";
  const isService = auth.includes(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

  if (!isService) {
    const { data: userData } = await admin.auth.getUser(auth.replace("Bearer ", ""));
    const userId = userData.user?.id;
    if (!userId) return json({ error: "не авторизован" }, 401);
    // Забирать отклики может тот же круг, что и публиковать: HR и руководитель.
    const roles = await Promise.all(
      ["hr_manager", "director", "superuser"].map((r) =>
        admin.rpc("has_role", { _user_id: userId, _role: r }).then((x) => Boolean(x.data))
      ),
    );
    if (!roles.some(Boolean)) return json({ error: "нужны права HR-менеджера или руководителя" }, 403);
  }

  let action = "sync";
  try {
    const body = await req.json();
    if (body?.action) action = String(body.action);
  } catch {
    /* тело пустое — обычная синхронизация */
  }

  try {
    if (action === "import") {
      // Перенос идёт порциями. Первая попытка сделать всё за один вызов
      // упёрлась в потолок времени функции: 290 вакансий съели 150 секунд,
      // и до откликов дело не дошло. Теперь функция работает ~110 секунд,
      // запоминает, где остановилась, и отвечает «готово: нет» — интерфейс
      // зовёт её снова, пока не закончит.
      const deadline = Date.now() + 110_000;
      const imported = await importVacancies(deadline);
      const synced = imported.done
        ? await sync({ allCollections: true, includeArchived: true, onlyUnsynced: true, deadline })
        : { ok: true, новых: 0, просмотрено: 0, осталось: -1 };
      const left = (synced as any).осталось ?? 0;
      return json({
        ...synced,
        готово: imported.done && left === 0,
        проблемы: [
          ...(((synced as any).проблемы ?? []) as string[]),
          ...(managersProblem ? [managersProblem] : []),
        ],
        вакансий_перенесено: imported.created,
        из_них_архивных: imported.archived,
        вакансий_уже_было: imported.skipped,
      });
    }
    return json(await sync());
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("hh-sync", message);
    return json({ error: message }, 400);
  }
});

async function getToken() {
  const { data: acc } = await admin
    .from("hh_accounts")
    .select("id, access_token, expires_at")
    .eq("is_active", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (!acc) throw new Error("Работодатель hh не подключён.");

  if (new Date(acc.expires_at).getTime() - Date.now() < 60_000) {
    const { error } = await admin.functions.invoke("hh-oauth", {
      body: { action: "refresh", account_id: acc.id },
    });
    if (error) throw new Error("Доступ к hh истёк. Подключите работодателя заново.");
    const { data: fresh } = await admin
      .from("hh_accounts").select("access_token").eq("id", acc.id).single();
    return { token: fresh!.access_token, accountId: acc.id };
  }
  return { token: acc.access_token, accountId: acc.id };
}

async function hh(token: string, path: string) {
  const res = await fetch(`https://api.hh.ru${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "Rastim-ATS/1.0 (hiring platform)",
    },
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

async function sync(
  opts: { allCollections?: boolean; includeArchived?: boolean; onlyUnsynced?: boolean; deadline?: number } = {},
) {
  const { token, accountId } = await getToken();

  let pubsQuery = admin
    .from("vacancy_publications")
    .select("id, vacancy_id, external_id, archived_at")
    .eq("board", "hh")
    .order("archived_at", { ascending: true, nullsFirst: true });
  // При переносе берём только ещё не разобранные: так прерванный перенос
  // продолжается с того места, где остановился, а не начинается заново.
  if (opts.onlyUnsynced) pubsQuery = pubsQuery.is("last_sync_at", null);
  // Обычная синхронизация ходит только по живым вакансиям. Перенос архива —
  // и по закрытым: их отклики и есть та история, ради которой архив нужен.
  if (!opts.includeArchived) pubsQuery = pubsQuery.is("archived_at", null);
  const { data: pubs } = await pubsQuery;

  if (!pubs || pubs.length === 0) {
    return { ok: true, новых: 0, просмотрено: 0, осталось: 0, сообщение: "На hh нет наших активных вакансий." };
  }

  let created = 0;
  let seen = 0;
  const проблемы: string[] = [];

  let processed = 0;
  for (const pub of pubs) {
    if (opts.deadline && Date.now() > opts.deadline) break;
    // Обычная синхронизация смотрит только папку «Отклики» — новые люди
    // приходят туда. При переносе смотрим все папки, включая отказы: тех,
    // кого на hh успели пригласить, отложить или отклонить, тоже надо
    // забрать. Отказы нужны архиву — «уже приходил, не подошёл потому-то»
    // и есть то, что спасает от второго круга собеседований с тем же
    // человеком.
    let folders = ["response"];
    if (opts.allCollections) {
      const list = await hh(token, `/negotiations?vacancy_id=${pub.external_id}`);
      const ids: string[] = [
        ...(list.body?.collections ?? []),
        ...(list.body?.generated_collections ?? []),
      ].map((c: any) => String(c.id));
      if (ids.length) folders = [...new Set(ids)];
    }

    for (const folder of folders) {
      // Постранично: у популярной вакансии откликов сотни, а hh отдаёт по 50.
      for (let page = 0; page < 20; page++) {
        const res = await hh(
          token,
          `/negotiations/${folder}?vacancy_id=${pub.external_id}&page=${page}&per_page=50`,
        );

        if (!res.ok) {
          if (folder === "response") проблемы.push(`вакансия ${pub.external_id}: hh ответил ${res.status}`);
          break;
        }

        const items = res.body?.items ?? [];
        seen += items.length;

        for (const item of items) {
          const ok = await importNegotiation(item, pub.vacancy_id, statusFor(folder, Boolean(pub.archived_at)));
          if (ok) created += 1;
        }

        if (page + 1 >= (res.body?.pages ?? 1)) break;
      }
    }

    await admin.from("vacancy_publications")
      .update({ last_sync_at: new Date().toISOString() })
      .eq("id", pub.id);
    processed += 1;
  }

  await admin.from("hh_accounts").update({
    last_sync_at: new Date().toISOString(),
    last_error: проблемы.length ? проблемы.join("; ") : null,
  }).eq("id", accountId);

  return {
    ok: true,
    новых: created,
    просмотрено: seen,
    осталось: pubs.length - processed,
    проблемы: проблемы.length ? проблемы : undefined,
  };
}

/** Возвращает true, если завёлся новый отклик. */
/**
 * Во что превращается папка hh у нас.
 *
 * Отказ — отказ, нанят — нанят. Остальные на закрытой вакансии становятся
 * «отложенными», а не «отказанными»: им не отказывали, вакансия просто
 * закрылась. Разница важна, когда через полгода их найдёт «Подбор из базы».
 */
function statusFor(folder: string, vacancyClosed: boolean): "active" | "on_hold" | "rejected" | "hired" {
  if (/discard/i.test(folder)) return "rejected";
  if (folder === "hired") return "hired";
  return vacancyClosed ? "on_hold" : "active";
}

async function importNegotiation(
  item: any,
  vacancyId: string,
  status: "active" | "on_hold" | "rejected" | "hired" = "active",
): Promise<boolean> {
  const negotiationId = String(item.id);

  // Уже забирали — второй раз не нужно.
  const { data: exists } = await admin
    .from("applications")
    .select("id")
    .eq("external_id", negotiationId)
    .maybeSingle();
  if (exists) return false;

  const resume = item.resume ?? {};
  const fio = [resume.last_name, resume.first_name, resume.middle_name]
    .filter(Boolean).join(" ").trim() || "Кандидат с hh";

  const phones: string[] = (resume.contact ?? [])
    .filter((c: any) => c.type?.id === "cell" || c.type?.id === "home")
    .map((c: any) => c.value?.formatted ?? String(c.value ?? ""))
    .filter(Boolean);

  const emails: string[] = (resume.contact ?? [])
    .filter((c: any) => c.type?.id === "email")
    .map((c: any) => String(c.value ?? ""))
    .filter(Boolean);

  // Ищем человека среди своих: тот же телефон или почта означают, что он
  // уже приходил. Заводить его вторым — потерять историю прошлых отказов,
  // ради которой архив и существует.
  let candidateId: string | null = null;

  for (const phone of phones) {
    const { data } = await admin
      .from("candidates").select("id").contains("phones", [phone]).maybeSingle();
    if (data) { candidateId = data.id; break; }
  }
  if (!candidateId) {
    for (const email of emails) {
      const { data } = await admin
        .from("candidates").select("id").contains("emails", [email]).maybeSingle();
      if (data) { candidateId = data.id; break; }
    }
  }

  if (!candidateId) {
    const { data: created, error } = await admin.from("candidates").insert({
      full_name: fio,
      phones,
      emails,
      city: resume.area?.name ?? null,
      primary_source: "hh",
      resume_text: [resume.title, resume.area?.name].filter(Boolean).join(". "),
      // Согласие кандидат дал hh, откликаясь на нашу вакансию. Отмечаем
      // это явно: основание обработки есть, и оно задокументировано.
      consent_pd_granted: true,
    }).select("id").single();
    if (error) {
      console.error("не завёлся кандидат", error.message);
      return false;
    }
    candidateId = created.id;
  } else {
    // Знакомый человек. Контакты не перезаписываем: то, что лежит у нас,
    // могло быть уточнено рекрутером вручную и точнее того, что в резюме.
    // Обновляем только отметку активности — она влияет на срок хранения.
    await admin.from("candidates")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("id", candidateId);
  }

  const { error: appError } = await admin.from("applications").insert({
    candidate_id: candidateId,
    vacancy_id: vacancyId,
    source: "hh",
    external_id: negotiationId,
    external_url: resume.alternate_url ?? null,
    applied_at: item.created_at ?? new Date().toISOString(),
    status,
    closed_at: status === "active" ? null : (item.updated_at ?? new Date().toISOString()),
    // stage_id, срок ответа и число критериев проставит триггер
    // prepare_new_application — тот же, что для откликов из Телеграма.
    stage_id: null as unknown as string,
  });

  if (appError) {
    // Дубль по (candidate_id, vacancy_id): человек уже откликался сюда
    // другим путём. Это не ошибка, просто нечего добавлять.
    if (appError.code === "23505") return false;
    console.error("не завёлся отклик", appError.message);
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Перенос вакансий, уже размещённых на hh вручную.
//
// Вакансия заводится у нас и связывается с той, что на hh, — без повторной
// публикации и без траты платного размещения. Дальше отклики по ней идут
// в общую воронку, как по вакансиям, опубликованным отсюда.
// ---------------------------------------------------------------------------
function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|h\d)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "— ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function defaultDepartmentId(): Promise<string> {
  // Подразделение у вакансии обязательно, а hh его не знает. Кладём в
  // «Не распределено» — рекрутер перенесёт в нужное, когда откроет карточку.
  const { data: found } = await admin
    .from("departments").select("id").eq("code", "unassigned").maybeSingle();
  if (found) return found.id;
  const { data: created, error } = await admin
    .from("departments")
    .insert({ name: "Не распределено", code: "unassigned" })
    .select("id").single();
  if (error) throw new Error(`Не завелось подразделение для перенесённых вакансий: ${error.message}`);
  return created.id;
}

async function defaultPipelineId(): Promise<string> {
  const { data } = await admin
    .from("pipelines").select("id").eq("is_default", true).eq("is_active", true)
    .order("created_at").limit(1).maybeSingle();
  if (!data) throw new Error("В базе нет воронки по умолчанию.");
  return data.id;
}

let managersProblem: string | null = null;

async function importVacancies(
  deadline: number,
): Promise<{ created: number; archived: number; skipped: number; done: boolean }> {
  const { token } = await getToken();

  const { data: acc } = await admin
    .from("hh_accounts").select("employer_id")
    .eq("is_active", true).order("created_at").limit(1).single();
  if (!acc) throw new Error("Работодатель hh не подключён.");

  const departmentId = await defaultDepartmentId();
  const pipelineId = await defaultPipelineId();

  let created = 0;
  let archived = 0;
  let skipped = 0;

  // hh отдаёт список вакансий по менеджеру: без manager_id — только вакансии
  // того, под кем подключились. Первый перенос так и взял одну активную из
  // нескольких. Поэтому сначала все менеджеры компании, потом вакансии
  // каждого. Если смотреть чужих менеджеров аккаунту не разрешено — берём
  // свои и честно говорим об этом.
  const managers: (string | null)[] = [];
  for (let page = 0; page < 10; page++) {
    const m = await hh(token, `/employers/${acc.employer_id}/managers?page=${page}&per_page=100`);
    if (!m.ok) break;
    for (const it of m.body?.items ?? []) managers.push(String(it.id));
    if (page + 1 >= (m.body?.pages ?? 1)) break;
  }
  if (managers.length === 0) {
    managers.push(null);
    managersProblem =
      "hh не дал список менеджеров компании — перенесены только вакансии того, под кем подключились. " +
      "Чтобы забрать все, подключите hh учётной записью администратора компании на hh.";
  }

  for (const kind of ["active", "archived"] as const) {
  const isArchive = kind === "archived";
  for (const managerId of managers) {
  for (let page = 0; page < 20; page++) {
    const byManager = managerId ? `&manager_id=${managerId}` : "";
    const res = await hh(token, `/employers/${acc.employer_id}/vacancies/${kind}?page=${page}&per_page=50${byManager}`);
    if (!res.ok) {
      // Активные обязательны, архив — нет: если hh архив не отдал, перенесём
      // хотя бы живое и скажем об этом.
      if (isArchive || managerId) { console.error("список hh не отдался", kind, managerId, res.status); break; }
      throw new Error(`hh не отдал список вакансий (${res.status}): ${JSON.stringify(res.body?.errors ?? res.body ?? "")}`);
    }

    for (const short of res.body?.items ?? []) {
      if (Date.now() > deadline) return { created, archived, skipped, done: false };
      const externalId = String(short.id);

      const { data: linked } = await admin
        .from("vacancy_publications").select("id")
        .eq("board", "hh").eq("external_id", externalId).maybeSingle();
      if (linked) { skipped += 1; continue; }

      // Та же должность в том же городе уже есть — это её очередное
      // размещение, а не новая вакансия. Компании годами переразмещают
      // «Продавца в Москве», и первый перенос превратил каждое размещение
      // в отдельную вакансию: 437 вместо 199. Привязываем к существующей.
      const { data: same } = await admin
        .from("vacancies")
        .select("id, status")
        .ilike("title", String(short.name ?? "").trim())
        .ilike("city", String(short.area?.name ?? ""))
        .limit(1)
        .maybeSingle();

      if (same) {
        await admin.from("vacancy_publications").insert({
          vacancy_id: same.id,
          board: "hh",
          external_id: externalId,
          external_url: short.alternate_url ?? null,
          published_at: short.published_at ?? new Date().toISOString(),
          archived_at: isArchive ? (short.archived_at ?? new Date().toISOString()) : null,
        });
        // Живое размещение открывает и вакансию, даже если раньше она закрывалась.
        if (!isArchive && same.status !== "published") {
          await admin.from("vacancies")
            .update({ status: "published", closed_at: null, close_reason: null })
            .eq("id", same.id);
        }
        skipped += 1;
        continue;
      }

      const full = await hh(token, `/vacancies/${externalId}`);
      const v = full.ok ? full.body : short;

      const role = v.professional_roles?.[0];
      const employment: Record<string, string> = {
        full: "full_time", part: "part_time", project: "project", probation: "full_time", volunteer: "project",
      };
      const schedule = v.schedule?.id;

      const { data: vac, error } = await admin.from("vacancies").insert({
        title: v.name,
        department_id: departmentId,
        pipeline_id: pipelineId,
        status: isArchive ? "closed" : "published",
        opened_at: v.published_at ?? new Date().toISOString(),
        closed_at: isArchive ? (v.archived_at ?? v.expires_at ?? new Date().toISOString()) : null,
        close_reason: isArchive ? "Перенесена из архива hh" : null,
        city: v.area?.name ?? null,
        specialization: role?.name ?? null,
        hh_area_id: v.area?.id ? String(v.area.id) : null,
        hh_professional_role_id: role?.id ? String(role.id) : null,
        employment_type: employment[v.employment?.id] ?? "full_time",
        work_format: schedule === "remote" ? "remote" : "onsite",
        description: stripHtml(v.description),
      }).select("id").single();

      if (error) {
        console.error("не перенеслась вакансия", externalId, error.message);
        continue;
      }

      if (v.salary && (v.salary.from || v.salary.to)) {
        await admin.from("vacancy_compensation").insert({
          vacancy_id: vac.id,
          salary_min: v.salary.from ?? null,
          salary_max: v.salary.to ?? null,
          is_net: v.salary.gross === false,
          currency: v.salary.currency === "RUR" ? "RUB" : (v.salary.currency ?? "RUB"),
        });
      }

      await admin.from("vacancy_publications").insert({
        vacancy_id: vac.id,
        board: "hh",
        external_id: externalId,
        external_url: v.alternate_url ?? null,
        published_at: v.published_at ?? new Date().toISOString(),
        archived_at: isArchive ? (v.archived_at ?? v.expires_at ?? new Date().toISOString()) : null,
      });

      created += 1;
      if (isArchive) archived += 1;
    }

    if (page + 1 >= (res.body?.pages ?? 1)) break;
  }
  }
  }

  return { created, archived, skipped, done: true };
}
