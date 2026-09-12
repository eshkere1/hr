/**
 * hh-publish — вакансия из нашей системы уходит на hh.
 *
 * Смысл в том, чтобы вакансия заводилась один раз. Сейчас её пишут у нас,
 * потом руками перенабирают на hh, а через неделю правят требования — и
 * версии расходятся. Кандидат читает одно, рекрутер отбирает по другому.
 *
 * Действия: publish (создать), update (обновить), archive (снять).
 *
 * Чего функция намеренно не делает — не догадывается. Если регион или
 * профессиональную роль сопоставить не удалось, она возвращает внятную
 * ошибку вместо того, чтобы подставить «Москва» и «Другое». Опубликованная
 * не в том регионе вакансия хуже неопубликованной: деньги за размещение
 * списаны, отклики идут не те.
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
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const { data: userData } = await admin.auth.getUser(auth.replace("Bearer ", ""));
  const userId = userData.user?.id;
  if (!userId) return json({ error: "не авторизован" }, 401);

  // Публикует HR: это его работа, а не суперпользователя.
  const { data: isHr } = await admin.rpc("has_role", { _user_id: userId, _role: "hr_manager" });
  const { data: isSu } = await admin.rpc("has_role", { _user_id: userId, _role: "superuser" });
  if (!isHr && !isSu) return json({ error: "публиковать вакансии может HR" }, 403);

  let payload: { action?: string; vacancy_id?: string; billing_type?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "не разобрал запрос" }, 400);
  }

  if (!payload.vacancy_id) return json({ error: "нужна вакансия" }, 400);

  try {
    switch (payload.action) {
      case "archive": return await archive(payload.vacancy_id);
      case "update": return await publish(payload.vacancy_id, payload.billing_type, true);
      default: return await publish(payload.vacancy_id, payload.billing_type, false);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("hh-publish", message);
    return json({ error: message }, 400);
  }
});

// ---------------------------------------------------------------------------
// Доступ
// ---------------------------------------------------------------------------

/** Живой токен работодателя. Протухший обновляем до, а не после отказа hh. */
async function getToken(): Promise<{ token: string; employerId: string; accountId: string }> {
  const { data: acc } = await admin
    .from("hh_accounts")
    .select("id, employer_id, access_token, expires_at, is_active")
    .eq("is_active", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (!acc) {
    throw new Error("Работодатель hh не подключён. Настройка → hh.ru → «Подключить».");
  }

  // Минута запаса: токен, истекающий через десять секунд, не годится —
  // запрос успеет уйти уже просроченным.
  if (new Date(acc.expires_at).getTime() - Date.now() < 60_000) {
    const { error } = await admin.functions.invoke("hh-oauth", {
      body: { action: "refresh", account_id: acc.id },
    });
    if (error) throw new Error("Доступ к hh истёк, обновить не удалось. Подключите работодателя заново.");

    const { data: fresh } = await admin
      .from("hh_accounts").select("access_token").eq("id", acc.id).single();
    return { token: fresh!.access_token, employerId: acc.employer_id!, accountId: acc.id };
  }

  return { token: acc.access_token, employerId: acc.employer_id!, accountId: acc.id };
}

async function hh(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`https://api.hh.ru${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
      // hh просит представляться: без User-Agent часть методов отвечает 400.
      "User-Agent": "Rastim-ATS/1.0 (hiring platform)",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  return { ok: res.ok, status: res.status, body };
}

/**
 * Ошибки hh приходят массивом кодов вроде
 * [{ type: "bad_argument", value: "area" }] — человеку это ничего не говорит.
 * Переводим то, что встречается чаще всего.
 */
function explain(body: any, status: number): string {
  const errors = body?.errors ?? [];
  const parts: string[] = [];

  for (const e of errors) {
    const field = e.value ?? e.field ?? "";
    switch (e.type) {
      case "not_enough_purchased_services":
        parts.push("У работодателя закончились оплаченные публикации на hh. Пополните пакет в кабинете hh.");
        break;
      case "quota_exceeded":
        parts.push("Исчерпана квота публикаций на hh.");
        break;
      case "bad_argument":
        parts.push(`hh не принял поле «${field}».`);
        break;
      case "required":
        parts.push(`hh требует заполнить «${field}».`);
        break;
      case "conflict":
        parts.push("Такая вакансия на hh уже есть.");
        break;
      default:
        parts.push(`${e.type ?? "ошибка"}${field ? ` (${field})` : ""}`);
    }
  }

  if (parts.length === 0) {
    parts.push(body?.description ?? `hh ответил ${status}`);
  }
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Справочники: сопоставляем словами то, что hh хранит числами
// ---------------------------------------------------------------------------
async function resolveArea(city: string | null): Promise<string | null> {
  if (!city) return null;
  const { data } = await admin
    .from("hh_dictionaries")
    .select("external_id, name")
    .eq("kind", "area")
    .ilike("name", city.trim())
    .limit(1);
  return data?.[0]?.external_id ?? null;
}

async function resolveRole(specialization: string | null): Promise<string | null> {
  if (!specialization) return null;
  const { data } = await admin
    .from("hh_dictionaries")
    .select("external_id, name")
    .eq("kind", "professional_role")
    .ilike("name", `%${specialization.trim()}%`)
    .limit(1);
  return data?.[0]?.external_id ?? null;
}

// ---------------------------------------------------------------------------
// Публикация
// ---------------------------------------------------------------------------
const EMPLOYMENT: Record<string, string> = {
  full_time: "full", part_time: "part", project: "project",
  contract: "probation", hourly: "part",
};

const SCHEDULE: Record<string, string> = {
  onsite: "fullDay", remote: "remote", hybrid: "flexible",
};

async function publish(vacancyId: string, billingType: string | undefined, isUpdate: boolean) {
  const { token, employerId } = await getToken();

  const { data: v, error } = await admin
    .from("vacancies")
    .select(`
      id, title, description, requirements, conditions, first_month_reality,
      city, specialization, employment_type, work_format,
      hh_area_id, hh_professional_role_id,
      vacancy_compensation ( salary_min, salary_max, is_net, currency )
    `)
    .eq("id", vacancyId)
    .single();
  if (error) throw error;

  // Регион и роль: берём заданные явно, иначе подбираем по названию.
  const areaId = v.hh_area_id ?? await resolveArea(v.city);
  if (!areaId) {
    throw new Error(
      `Не удалось определить регион hh по городу «${v.city ?? "не указан"}». ` +
      `Укажите город точно так, как он называется на hh, либо впишите идентификатор региона в карточку вакансии.`,
    );
  }

  const roleId = v.hh_professional_role_id ?? await resolveRole(v.specialization);
  if (!roleId) {
    throw new Error(
      `Не удалось подобрать профессиональную роль hh по направлению «${v.specialization ?? "не указано"}». ` +
      `hh не примет вакансию без неё — выберите роль в карточке вакансии.`,
    );
  }

  // Описание. hh требует не меньше нескольких сотен знаков и понимает HTML.
  // Собираем из полей, которые у нас и так заполнены, включая честное
  // «что реально будет в первый месяц» — на hh такого почти никто не пишет,
  // и это работает лучше любого «динамично развивающаяся компания».
  const описание = [
    v.description,
    v.requirements ? `<p><strong>Что нужно уметь</strong></p><p>${v.requirements}</p>` : "",
    v.conditions ? `<p><strong>Условия</strong></p><p>${v.conditions}</p>` : "",
    v.first_month_reality
      ? `<p><strong>Что реально будет в первый месяц</strong></p><p>${v.first_month_reality}</p>`
      : "",
  ].filter(Boolean).join("");

  const comp = (v as any).vacancy_compensation;
  const salary = comp && (comp.salary_min || comp.salary_max)
    ? {
        from: comp.salary_min ?? null,
        to: comp.salary_max ?? null,
        currency: comp.currency ?? "RUR",
        // hh называет «gross» зарплату до вычета налога. У нас is_net —
        // «на руки», поэтому знак противоположный.
        gross: !comp.is_net,
      }
    : null;

  const payload: Record<string, unknown> = {
    name: v.title,
    description: описание,
    area: { id: areaId },
    professional_roles: [{ id: roleId }],
    employment: { id: EMPLOYMENT[v.employment_type] ?? "full" },
    schedule: { id: SCHEDULE[v.work_format] ?? "fullDay" },
    salary,
    employer_id: employerId,
  };
  if (!isUpdate) payload.billing_type = { id: billingType ?? "standard" };

  const { data: existing } = await admin
    .from("vacancy_publications")
    .select("id, external_id")
    .eq("vacancy_id", vacancyId)
    .eq("board", "hh")
    .is("archived_at", null)
    .maybeSingle();

  if (isUpdate && !existing?.external_id) {
    throw new Error("Вакансия ещё не опубликована на hh — обновлять нечего.");
  }

  const res = isUpdate
    ? await hh(token, `/vacancies/${existing!.external_id}`, {
        method: "PUT", body: JSON.stringify(payload),
      })
    : await hh(token, "/vacancies", {
        method: "POST", body: JSON.stringify(payload),
      });

  if (!res.ok) {
    const message = explain(res.body, res.status);
    if (existing) {
      await admin.from("vacancy_publications")
        .update({ sync_error: message, last_sync_at: new Date().toISOString() })
        .eq("id", existing.id);
    }
    throw new Error(message);
  }

  const externalId = String(res.body?.id ?? existing?.external_id);
  const externalUrl = res.body?.alternate_url ?? `https://hh.ru/vacancy/${externalId}`;

  await admin.from("vacancy_publications").upsert({
    id: existing?.id,
    vacancy_id: vacancyId,
    board: "hh",
    external_id: externalId,
    external_url: externalUrl,
    published_at: existing?.id ? undefined : new Date().toISOString(),
    last_sync_at: new Date().toISOString(),
    sync_error: null,
  }, { onConflict: "vacancy_id,board,external_id" });

  // Запоминаем разгаданные идентификаторы: в следующий раз не гадаем.
  await admin.from("vacancies")
    .update({ hh_area_id: areaId, hh_professional_role_id: roleId })
    .eq("id", vacancyId);

  return json({ ok: true, external_id: externalId, url: externalUrl, updated: isUpdate });
}

async function archive(vacancyId: string) {
  const { token } = await getToken();

  const { data: pub } = await admin
    .from("vacancy_publications")
    .select("id, external_id")
    .eq("vacancy_id", vacancyId)
    .eq("board", "hh")
    .is("archived_at", null)
    .maybeSingle();

  if (!pub?.external_id) throw new Error("Эта вакансия на hh не опубликована.");

  const res = await hh(token, `/vacancies/${pub.external_id}/archive`, { method: "PUT" });
  if (!res.ok) throw new Error(explain(res.body, res.status));

  await admin.from("vacancy_publications")
    .update({ archived_at: new Date().toISOString(), sync_error: null })
    .eq("id", pub.id);

  return json({ ok: true });
}
