/**
 * telegram-webhook — входящая сторона переписки (фишки 11, 12).
 *
 * Телеграм присылает сюда каждое сообщение кандидата. Функция находит
 * человека по telegram_user_id, при первом контакте заводит карточку и
 * кладёт сообщение в messages. Счётчик непрочитанного и last_message_at
 * поднимает триггер on_message_inserted — здесь их трогать не нужно.
 *
 * ТОКЕНА БОТА В КОДЕ НЕТ И БЫТЬ НЕ ДОЛЖНО. Он приходит из секретов проекта:
 *   supabase secrets set TELEGRAM_BOT_TOKEN=...
 *   supabase secrets set TELEGRAM_WEBHOOK_SECRET=...
 *
 * Регистрация адреса у Телеграма (secret_token обязателен — иначе на этот
 * URL сможет постучаться кто угодно и наплодить фальшивых кандидатов):
 *   curl "https://api.telegram.org/bot<ТОКЕН>/setWebhook" \
 *     -d "url=https://<проект>.supabase.co/functions/v1/telegram-webhook" \
 *     -d "secret_token=<ТОТ ЖЕ TELEGRAM_WEBHOOK_SECRET>"
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";

// service_role живёт только здесь, на сервере: он обходит RLS, и на клиенте
// ему не место ни при каких условиях.
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: { id: number };
  text?: string;
  caption?: string;
  date: number;
}

Deno.serve(async (req) => {
  // Проверка секрета — первое, что происходит. Без неё эндпоинт открыт всему
  // интернету, а он пишет в базу.
  if (!WEBHOOK_SECRET ||
      req.headers.get("x-telegram-bot-api-secret-token") !== WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  let update: { message?: TgMessage; edited_message?: TgMessage };
  try {
    update = await req.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const msg = update.message ?? update.edited_message;
  const from = msg?.from;
  const body = msg?.text ?? msg?.caption ?? null;

  // Телеграм повторяет доставку, пока не получит 200. Служебные апдейты,
  // которые нам неинтересны, подтверждаем сразу — иначе он будет долбиться
  // в этот адрес бесконечно.
  if (!msg || !from || !body) {
    return new Response("ok");
  }

  try {
    const name = [from.first_name, from.last_name].filter(Boolean).join(" ")
      || from.username
      || `Кандидат ${from.id}`;

    // 1. Кандидат. Первое сообщение боту — это и есть отклик «из Телеграма».
    let { data: candidate } = await supabase
      .from("candidates")
      .select("id")
      .eq("telegram_user_id", from.id)
      .maybeSingle();

    if (!candidate) {
      const { data: created, error } = await supabase
        .from("candidates")
        .insert({
          full_name: name,
          telegram_user_id: from.id,
          telegram_username: from.username ?? null,
          primary_source: "telegram",
          // Согласие на обработку берём отдельным шагом в диалоге (152-ФЗ,
          // фишка 61), а не по факту того, что человек что-то написал.
          consent_pd_granted: false,
        })
        .select("id")
        .single();
      if (error) throw error;
      candidate = created;
    }

    // 2. Диалог. Уникальность в схеме — (candidate_id, channel, application_id),
    //    но application_id здесь null, а NULL в Postgres не совпадает сам с
    //    собой. Поэтому ищем явно, а не полагаемся на on conflict.
    let { data: conversation } = await supabase
      .from("conversations")
      .select("id")
      .eq("candidate_id", candidate.id)
      .eq("channel", "telegram")
      .is("application_id", null)
      .maybeSingle();

    if (!conversation) {
      const { data: created, error } = await supabase
        .from("conversations")
        .insert({
          candidate_id: candidate.id,
          channel: "telegram",
          external_chat_id: String(msg.chat.id),
        })
        .select("id")
        .single();
      if (error) throw error;
      conversation = created;
    }

    // 3. Сообщение. external_message_id защищает от дублей при повторной
    //    доставке: Телеграм присылает тот же апдейт, если не получил 200.
    const { error: msgError } = await supabase.from("messages").insert({
      conversation_id: conversation.id,
      direction: "inbound",
      author_kind: "candidate",
      body,
      external_message_id: `tg:${msg.chat.id}:${msg.message_id}`,
      sent_at: new Date(msg.date * 1000).toISOString(),
      is_read: false,
    });
    if (msgError && msgError.code !== "23505") throw msgError;

    return new Response("ok");
  } catch (e) {
    console.error("telegram-webhook", e);
    // 200 намеренно: на 5xx Телеграм будет повторять доставку по кругу.
    // Ошибку видно в логах функции, а очередь не встанет.
    return new Response("ok");
  }
});
