/**
 * telegram-webhook — входящая сторона переписки (фишки 11, 12).
 *
 * Ботов может быть много: разные бренды, разные регионы, массовый подбор
 * отдельно от точечного. Поэтому адрес несёт в себе, кто именно принимает:
 *
 *   /functions/v1/telegram-webhook/<id бота>
 *
 * Токен и секрет берутся из строки этого бота в базе, а не из переменных
 * окружения — иначе добавить второго бота можно было бы только через
 * переразвёртывание функции.
 *
 * Диалог запоминает бота. Отвечать нужно из того же аккаунта, в который
 * написал человек: ответ «не от того бота» кандидат либо не получит,
 * либо примет за спам.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  // 1. Кто принимает. Последний сегмент адреса — id бота.
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const botId = parts[parts.length - 1];
  const looksLikeUuid = /^[0-9a-f-]{36}$/i.test(botId ?? "");
  if (!looksLikeUuid) {
    return new Response("bot id missing in path", { status: 404 });
  }

  const { data: bot } = await supabase
    .from("messenger_bots")
    .select("id, token, webhook_secret, is_active")
    .eq("id", botId)
    .maybeSingle();

  if (!bot || !bot.is_active) {
    return new Response("unknown bot", { status: 404 });
  }

  // 2. Проверка секрета — до любой работы с телом запроса. Без неё адрес
  //    открыт всему интернету, а он пишет в базу. Секрет у каждого бота
  //    свой: утечка одного не открывает остальных.
  if (req.headers.get("x-telegram-bot-api-secret-token") !== bot.webhook_secret) {
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

    // 3. Кандидат. Первое сообщение боту — это и есть отклик «из Телеграма».
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

    // 4. Диалог. Уникальность в схеме — (candidate_id, channel, application_id),
    //    но application_id здесь null, а NULL в Postgres не совпадает сам с
    //    собой. Поэтому ищем явно, а не полагаемся на on conflict.
    let { data: conversation } = await supabase
      .from("conversations")
      .select("id, bot_id")
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
          bot_id: bot.id,
        })
        .select("id, bot_id")
        .single();
      if (error) throw error;
      conversation = created;
    } else if (conversation.bot_id !== bot.id) {
      // Человек написал в другого нашего бота — значит, отвечать теперь
      // нужно оттуда же. Переписка при этом остаётся одной: она про
      // человека, а не про канал.
      await supabase
        .from("conversations")
        .update({ bot_id: bot.id, external_chat_id: String(msg.chat.id) })
        .eq("id", conversation.id);
    }

    // 5. Сообщение. external_message_id защищает от дублей при повторной
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

    await supabase
      .from("messenger_bots")
      .update({ last_seen_at: new Date().toISOString(), last_error: null })
      .eq("id", bot.id);

    return new Response("ok");
  } catch (e) {
    console.error("telegram-webhook", botId, e);
    await supabase
      .from("messenger_bots")
      .update({ last_error: String(e).slice(0, 500) })
      .eq("id", bot.id);
    // 200 намеренно: на 5xx Телеграм будет повторять доставку по кругу.
    // Ошибка видна в карточке бота и в логах, а очередь не встанет.
    return new Response("ok");
  }
});
