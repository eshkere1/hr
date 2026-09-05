/**
 * bot-register — добавление и проверка ботов из интерфейса.
 *
 * Раньше подключение бота выглядело так: положи токен в переменные
 * окружения, переразверни функцию, выполни setWebhook курлом, не перепутай
 * секрет. Четыре шага в терминале ради одной строки в базе — и второго бота
 * так уже не добавишь.
 *
 * Теперь это одно поле на экране «Боты». Функция сама:
 *   1. спрашивает у Телеграма, живой ли токен (getMe),
 *   2. придумывает секрет вебхука — свой для каждого бота,
 *   3. кладёт бота в базу,
 *   4. регистрирует адрес у Телеграма (setWebhook).
 *
 * Токен приходит сюда по HTTPS и остаётся в базе под RLS. В приложение он
 * не возвращается никогда — наружу уходит только имя, @username и хвост
 * из шести символов, чтобы человек узнал свой бот в списке.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

/**
 * Эту функцию, в отличие от двух остальных, вызывает браузер — а он перед
 * POST на чужой домен спрашивает разрешение отдельным запросом OPTIONS.
 * Без ответа на него и без этих заголовков вызов не уйдёт вовсе: браузер
 * заблокирует его сам, и приложение увидит только «не удалось отправить».
 */
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

  // 1. Кто просит. Токен бота — ключ от всей переписки с кандидатами,
  //    поэтому право добавлять ботов есть только у суперпользователя.
  //    Проверяем по базе, а не по тому, что прислал клиент.
  const authHeader = req.headers.get("Authorization") ?? "";
  const { data: userData } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
  const userId = userData.user?.id;
  if (!userId) return json({ error: "не авторизован" }, 401);

  const { data: isSu } = await admin.rpc("has_role", {
    _user_id: userId,
    _role: "superuser",
  });
  if (!isSu) return json({ error: "нужны права суперпользователя" }, 403);

  let payload: { action?: string; token?: string; name?: string; bot_id?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "не разобрал запрос" }, 400);
  }

  try {
    if (payload.action === "remove") return await remove(payload.bot_id);
    if (payload.action === "recheck") return await recheck(payload.bot_id);
    return await add(payload.token, payload.name, userId);
  } catch (e) {
    console.error("bot-register", e);
    return json({ error: String(e) }, 500);
  }
});

/** Адрес свой у каждого бота: по нему функция приёма понимает, кто принимает. */
function webhookUrl(botId: string) {
  return `${SUPABASE_URL}/functions/v1/telegram-webhook/${botId}`;
}

/**
 * Регистрация адреса у Телеграма.
 *
 * allowed_updates перечисляет, что он вообще будет нам присылать. Забыть
 * тут callback_query — значит получить бота, у которого не работают кнопки:
 * нажатие происходит, но до нас не доходит, и отладить это по логам нельзя,
 * потому что запроса просто нет.
 */
async function registerWebhook(token: string, url: string, secret: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url,
      secret_token: secret,
      allowed_updates: ["message", "edited_message", "callback_query"],
    }),
  });
  return res.json();
}

/** Спросить у Телеграма, кто владелец токена. Заодно проверка, что он живой. */
async function getMe(token: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const data = await res.json();
  if (!data.ok) {
    // 404 у Телеграма означает «такого токена нет» — самая частая ошибка
    // при подключении. Говорим об этом словами, а не кодом.
    throw new Error(
      data.error_code === 404
        ? "Телеграм не знает такой токен. Проверьте, что скопировали его целиком и что он не отозван."
        : `Телеграм отказал: ${data.description ?? "неизвестная причина"}`,
    );
  }
  return data.result as { id: number; username?: string; first_name?: string };
}

async function add(token?: string, name?: string, userId?: string) {
  const clean = (token ?? "").trim();
  if (!clean) return json({ error: "нужен токен бота" }, 400);

  const me = await getMe(clean);

  // Секрет вебхука. Телеграм принимает только латиницу, цифры, дефис и
  // подчёркивание — генерируем сразу в допустимом наборе, чтобы человеку
  // не пришлось узнавать об этом ограничении из ошибки.
  const secret = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[b % 62])
    .join("");

  const { data: bot, error } = await admin
    .from("messenger_bots")
    .insert({
      channel: "telegram",
      name: (name ?? "").trim() || me.first_name || me.username || "Бот",
      username: me.username ?? null,
      external_id: String(me.id),
      token: clean,
      webhook_secret: secret,
      created_by: userId,
      // Первый бот становится основным: через него уйдут исходящие в
      // диалогах, у которых бот почему-то не проставлен.
      is_default: !(await hasDefault()),
    })
    .select("id, name, username")
    .single();

  if (error) {
    if (error.code === "23505") {
      return json({ error: "Этот бот уже подключён." }, 409);
    }
    throw error;
  }

  const url = webhookUrl(bot.id);
  const setResult = await registerWebhook(clean, url, secret);

  // Меню команд в самом Телеграме: кандидат видит кнопку со списком и не
  // должен угадывать, что боту можно написать.
  await fetch(`https://api.telegram.org/bot${clean}/setMyCommands`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      commands: [
        { command: "status", description: "Где мой отклик сейчас" },
        { command: "vacancies", description: "Открытые вакансии" },
        { command: "slots", description: "Записаться на встречу" },
        { command: "test", description: "Задание" },
        { command: "docs", description: "Какие документы нужны" },
        { command: "privacy", description: "Мои данные и согласие" },
        { command: "help", description: "Что я умею" },
      ],
    }),
  }).catch(() => {/* меню — приятная мелочь, из-за неё подключение не валим */});

  if (!setResult.ok) {
    // Бот в базе есть, но сообщения до нас не дойдут. Не молчим и не
    // удаляем строку втихую: пишем причину в карточку, человек увидит её
    // на экране и сможет нажать «Проверить».
    await admin
      .from("messenger_bots")
      .update({ last_error: setResult.description ?? "setWebhook не прошёл" })
      .eq("id", bot.id);
    return json(
      { id: bot.id, name: bot.name, username: bot.username, warning: setResult.description },
      200,
    );
  }

  return json({ id: bot.id, name: bot.name, username: bot.username, webhook_url: url });
}

/** Жив ли бот и доходят ли до нас сообщения — по данным самого Телеграма. */
async function recheck(botId?: string) {
  if (!botId) return json({ error: "нужен id бота" }, 400);

  const { data: bot } = await admin
    .from("messenger_bots")
    .select("id, token, webhook_secret")
    .eq("id", botId)
    .maybeSingle();
  if (!bot) return json({ error: "бот не найден" }, 404);

  // Перед проверкой перерегистрируем адрес. Это чинит ботов, подключённых
  // раньше: если в прошлый раз список типов обновлений был неполным или
  // адрес сменился, «Проверить» приведёт всё в порядок само, без
  // переподключения бота и потери переписки.
  await registerWebhook(bot.token, webhookUrl(bot.id), bot.webhook_secret)
    .catch(() => {/* если не вышло — увидим это в getWebhookInfo ниже */});

  const res = await fetch(`https://api.telegram.org/bot${bot.token}/getWebhookInfo`);
  const info = await res.json();
  if (!info.ok) {
    await admin.from("messenger_bots").update({ last_error: "токен не работает" }).eq("id", bot.id);
    return json({ ok: false, error: "Токен не работает. Возможно, его отозвали." });
  }

  const r = info.result ?? {};
  const problem = r.last_error_message ?? null;
  await admin
    .from("messenger_bots")
    .update({ last_error: problem })
    .eq("id", bot.id);

  return json({
    ok: !problem,
    url: r.url ?? null,
    pending: r.pending_update_count ?? 0,
    error: problem,
  });
}

/** Отключить бота: снимаем вебхук у Телеграма и убираем строку. */
async function remove(botId?: string) {
  if (!botId) return json({ error: "нужен id бота" }, 400);

  const { data: bot } = await admin
    .from("messenger_bots")
    .select("id, token")
    .eq("id", botId)
    .maybeSingle();
  if (!bot) return json({ error: "бот не найден" }, 404);

  // Сначала отписываемся у Телеграма, потом удаляем. В обратном порядке
  // он продолжал бы слать сообщения на адрес, за которым уже никого нет.
  await fetch(`https://api.telegram.org/bot${bot.token}/deleteWebhook`, { method: "POST" })
    .catch(() => {/* бот мог быть уже удалён — не повод оставлять строку */});

  const { error } = await admin.from("messenger_bots").delete().eq("id", bot.id);
  if (error) throw error;

  return json({ ok: true });
}

async function hasDefault(): Promise<boolean> {
  const { count } = await admin
    .from("messenger_bots")
    .select("id", { count: "exact", head: true })
    .eq("channel", "telegram")
    .eq("is_default", true);
  return (count ?? 0) > 0;
}
