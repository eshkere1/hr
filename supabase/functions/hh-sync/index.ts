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

  try {
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

async function sync() {
  const { token, accountId } = await getToken();

  const { data: pubs } = await admin
    .from("vacancy_publications")
    .select("vacancy_id, external_id")
    .eq("board", "hh")
    .is("archived_at", null);

  if (!pubs || pubs.length === 0) {
    return { ok: true, новых: 0, сообщение: "На hh нет наших активных вакансий." };
  }

  let created = 0;
  let seen = 0;
  const проблемы: string[] = [];

  for (const pub of pubs) {
    // Отклики по конкретной вакансии. Постранично: у популярной вакансии
    // их сотни, а hh отдаёт по 50.
    for (let page = 0; page < 20; page++) {
      const res = await hh(
        token,
        `/negotiations/response?vacancy_id=${pub.external_id}&page=${page}&per_page=50`,
      );

      if (!res.ok) {
        проблемы.push(`вакансия ${pub.external_id}: hh ответил ${res.status}`);
        break;
      }

      const items = res.body?.items ?? [];
      seen += items.length;

      for (const item of items) {
        const ok = await importNegotiation(item, pub.vacancy_id);
        if (ok) created += 1;
      }

      if (page + 1 >= (res.body?.pages ?? 1)) break;
    }
  }

  await admin.from("hh_accounts").update({
    last_sync_at: new Date().toISOString(),
    last_error: проблемы.length ? проблемы.join("; ") : null,
  }).eq("id", accountId);

  return {
    ok: true,
    новых: created,
    просмотрено: seen,
    проблемы: проблемы.length ? проблемы : undefined,
  };
}

/** Возвращает true, если завёлся новый отклик. */
async function importNegotiation(item: any, vacancyId: string): Promise<boolean> {
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
