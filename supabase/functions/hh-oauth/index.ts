/**
 * hh-oauth — подключение работодателя и поддержание доступа живым.
 *
 * hh выдаёт access_token на две недели и refresh_token к нему. Тонкость,
 * на которой ломаются интеграции: refresh одноразовый. После обмена старый
 * перестаёт работать немедленно, и если новый не сохранить — доступ потерян,
 * подключаться придётся заново вручную.
 *
 * Поэтому обновление живёт здесь, в одном месте, и пишет результат в базу
 * сразу. Остальные функции просто просят готовый токен.
 *
 * Действия:
 *   start    — вернуть ссылку, по которой пользователь разрешает доступ
 *   callback — обменять код на токены и сохранить работодателя
 *   refresh  — обновить протухший токен
 *   remove   — отключить работодателя
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CLIENT_ID = Deno.env.get("HH_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("HH_CLIENT_SECRET") ?? "";
const REDIRECT_URI = Deno.env.get("HH_REDIRECT_URI") ?? "";

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

  if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
    return json({
      error: "Не заданы секреты HH_CLIENT_ID, HH_CLIENT_SECRET и HH_REDIRECT_URI в настройках проекта.",
    }, 500);
  }

  // Подключать работодателя может только суперпользователь: доступ даёт
  // право публиковать вакансии и читать резюме от имени компании.
  const auth = req.headers.get("Authorization") ?? "";
  const { data: userData } = await admin.auth.getUser(auth.replace("Bearer ", ""));
  const userId = userData.user?.id;
  if (!userId) return json({ error: "не авторизован" }, 401);

  const { data: isSu } = await admin.rpc("has_role", { _user_id: userId, _role: "superuser" });
  if (!isSu) return json({ error: "нужны права суперпользователя" }, 403);

  let payload: { action?: string; code?: string; state?: string; account_id?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "не разобрал запрос" }, 400);
  }

  try {
    switch (payload.action) {
      case "start": return await start(userId);
      case "callback": return await callback(payload.code, payload.state, userId);
      case "refresh": return json(await refreshAccount(payload.account_id!));
      case "remove": return await remove(payload.account_id);
      default: return json({ error: "неизвестное действие" }, 400);
    }
  } catch (e) {
    console.error("hh-oauth", e);
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});

/** Ссылка, по которой человек разрешает доступ к своему работодателю. */
async function start(userId: string) {
  const url = new URL("https://hh.ru/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("state", await signState(userId));
  return json({ url: url.toString() });
}

/**
 * state — подпись, а не случайная строка в таблице.
 *
 * hh вернёт этот параметр на страницу возврата, и по нему мы убеждаемся, что
 * обмениваем код, за которым сами же и посылали этого человека. Иначе
 * достаточно подсунуть суперпользователю ссылку с чужим кодом — и к нашей
 * системе окажется подключён чужой работодатель, а вместе с ним — чужие вакансии
 * и чужие отклики.
 *
 * Подпись вместо таблицы: состояние живёт десять минут, и заводить под него
 * таблицу, которую потом нужно чистить, ни к чему.
 */
async function signState(userId: string) {
  const head = `${userId}.${Date.now() + 10 * 60_000}`;
  return `${head}.${await hmac(head)}`;
}

/** Возвращает текст ошибки или null, если всё сошлось. */
async function checkState(state: string | undefined, userId: string) {
  if (!state) {
    return "hh не вернул state. Начните подключение заново со страницы «hh.ru».";
  }

  const cut = state.lastIndexOf(".");
  const head = state.slice(0, cut);
  if (cut < 0 || (await hmac(head)) !== state.slice(cut + 1)) {
    return "Подпись state не сошлась: подключение начато не в этой системе.";
  }

  const [stateUser, exp] = head.split(".");
  if (stateUser !== userId) {
    return "Ссылку на подключение запрашивал другой человек.";
  }
  if (Number(exp) < Date.now()) {
    return "На подключение даётся десять минут, и они вышли. Нажмите «Подключить» ещё раз.";
  }
  return null;
}

async function hmac(data: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(CLIENT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function callback(code: string | undefined, state: string | undefined, userId: string) {
  if (!code) return json({ error: "нет кода авторизации" }, 400);

  const bad = await checkState(state, userId);
  if (bad) return json({ error: bad }, 400);

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    code,
  });

  const res = await fetch("https://api.hh.ru/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const tokens = await res.json();

  if (!res.ok) {
    // hh отвечает описанием ошибки — показываем его как есть, а не «не
    // удалось». Чаще всего это истёкший код: он живёт минуты.
    return json({
      error: `hh отказал: ${tokens.error_description ?? tokens.error ?? res.status}`,
    }, 400);
  }

  // Кто мы теперь. Без этого непонятно, чей работодатель подключён.
  const meRes = await fetch("https://api.hh.ru/me", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const me = await meRes.json();

  const employerId = me.employer?.id ? String(me.employer.id) : null;
  if (!employerId) {
    return json({
      error: "Этот аккаунт hh не привязан к работодателю. Подключать нужно учётную запись сотрудника компании, а не соискателя.",
    }, 400);
  }

  const { data: account, error } = await admin
    .from("hh_accounts")
    .upsert({
      employer_id: employerId,
      employer_name: me.employer?.name ?? null,
      manager_id: me.manager?.id ? String(me.manager.id) : null,
      manager_name: [me.first_name, me.last_name].filter(Boolean).join(" ") || me.email || null,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + (tokens.expires_in ?? 1209600) * 1000).toISOString(),
      is_active: true,
      last_error: null,
      connected_by: userId,
    }, { onConflict: "employer_id" })
    .select("id, employer_name, manager_name")
    .single();

  if (error) throw error;

  // Справочники сразу: без них первая же публикация упрётся в «неизвестный
  // регион», и человек не поймёт, при чём тут словарь.
  await syncDictionaries(tokens.access_token).catch((e) =>
    console.warn("справочники не загрузились:", e)
  );

  return json({
    id: account.id,
    employer_name: account.employer_name,
    manager_name: account.manager_name,
  });
}

/**
 * Обновление токена.
 *
 * Экспортируется по смыслу: остальные функции вызывают hh-oauth с
 * action=refresh, а не повторяют эту логику у себя. Одноразовый refresh
 * прощает только одну попытку — дублировать её в трёх местах опасно.
 */
async function refreshAccount(accountId: string) {
  const { data: acc } = await admin
    .from("hh_accounts")
    .select("id, refresh_token")
    .eq("id", accountId)
    .maybeSingle();
  if (!acc) throw new Error("работодатель не найден");

  const res = await fetch("https://api.hh.ru/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: acc.refresh_token,
    }),
  });
  const tokens = await res.json();

  if (!res.ok) {
    const message = `Доступ к hh истёк и не обновился: ${tokens.error_description ?? tokens.error ?? res.status}. Подключите работодателя заново.`;
    await admin.from("hh_accounts")
      .update({ last_error: message, is_active: false })
      .eq("id", accountId);
    throw new Error(message);
  }

  await admin.from("hh_accounts").update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: new Date(Date.now() + (tokens.expires_in ?? 1209600) * 1000).toISOString(),
    is_active: true,
    last_error: null,
  }).eq("id", accountId);

  return { ok: true };
}

async function remove(accountId?: string) {
  if (!accountId) return json({ error: "нужен id" }, 400);
  const { error } = await admin.from("hh_accounts").delete().eq("id", accountId);
  if (error) throw error;
  return json({ ok: true });
}

/**
 * Справочники регионов и профессиональных ролей.
 *
 * hh не принимает город и направление словами. Дерево регионов большое,
 * тянуть его при каждой публикации расточительно — кладём в базу и
 * обновляем по требованию.
 */
async function syncDictionaries(token: string) {
  const rows: { kind: string; external_id: string; name: string; parent_id: string | null }[] = [];

  const areasRes = await fetch("https://api.hh.ru/areas", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const areas = await areasRes.json();

  const walk = (nodes: any[], parent: string | null) => {
    for (const n of nodes ?? []) {
      rows.push({ kind: "area", external_id: String(n.id), name: n.name, parent_id: parent });
      if (n.areas?.length) walk(n.areas, String(n.id));
    }
  };
  walk(areas, null);

  const rolesRes = await fetch("https://api.hh.ru/professional_roles", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const roles = await rolesRes.json();
  for (const cat of roles.categories ?? []) {
    for (const r of cat.roles ?? []) {
      rows.push({
        kind: "professional_role",
        external_id: String(r.id),
        name: r.name,
        parent_id: String(cat.id),
      });
    }
  }

  // Пачками: справочник регионов — это несколько тысяч строк.
  for (let i = 0; i < rows.length; i += 500) {
    await admin.from("hh_dictionaries").upsert(
      rows.slice(i, i + 500).map((r) => ({ ...r, synced_at: new Date().toISOString() })),
      { onConflict: "kind,external_id" },
    );
  }

  return rows.length;
}
