/**
 * telegram-send — исходящая сторона переписки.
 *
 * Приложение при отправке просто пишет строку в messages: база остаётся
 * единственным источником правды, а доставка — отдельная забота. Эту
 * функцию дёргает Database Webhook на INSERT в messages.
 *
 * Токен берётся у того бота, через которого идёт диалог. Отвечать из
 * другого аккаунта нельзя: кандидат либо не получит сообщение, либо
 * получит его от незнакомого бота и примет за спам.
 *
 * Настройка (Database → Webhooks):
 *   таблица   messages
 *   событие   INSERT
 *   тип       Supabase Edge Function → telegram-send
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

interface MessageRow {
  id: string;
  conversation_id: string;
  direction: string;
  author_kind: string;
  body: string | null;
  external_message_id: string | null;
}

Deno.serve(async (req) => {
  let payload: { type?: string; record?: MessageRow };
  try {
    payload = await req.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const row = payload.record;
  if (payload.type !== "INSERT" || !row || row.direction !== "outbound" || !row.body) {
    return new Response("ok");
  }

  // Бот отвечает кандидату сам и сразу — сообщение уже доставлено, а строка
  // в базе появляется следом, с проставленным external_message_id. Без этой
  // проверки мы отправили бы его второй раз: человек получил бы дубль.
  if (row.external_message_id) {
    return new Response("ok");
  }

  try {
    const { data: conv, error } = await supabase
      .from("conversations")
      .select("id, candidate_id, channel, external_chat_id, bot_id")
      .eq("id", row.conversation_id)
      .single();
    if (error) throw error;

    // Диалог мог идти по почте или в самом приложении — тогда это не наша
    // доставка, молча выходим.
    if (conv.channel !== "telegram" || !conv.external_chat_id) {
      return new Response("ok");
    }

    // Бот диалога. Если его почему-то нет (диалог завели вручную) — берём
    // бота по умолчанию: лучше отправить из основного аккаунта, чем
    // потерять сообщение молча.
    let botQuery = supabase.from("messenger_bots").select("id, token, name").eq("is_active", true);
    botQuery = conv.bot_id
      ? botQuery.eq("id", conv.bot_id)
      : botQuery.eq("channel", "telegram").eq("is_default", true);

    const { data: bot } = await botQuery.maybeSingle();
    if (!bot) {
      console.error("telegram-send: нет бота для диалога", conv.id);
      return new Response("ok");
    }

    // Антиспам (фишка 41). Считает та же функция в базе, что и интерфейс, —
    // чтобы правило было одно, а не два расходящихся. Проверка стоит здесь,
    // а не только на экране, потому что интерфейс не граница системы:
    // сообщение может уйти из автодействия этапа или из будущего автопилота.
    const { data: allowed } = await supabase.rpc("can_touch_candidate", {
      _candidate_id: conv.candidate_id,
    });
    if (allowed === false) {
      console.warn(`telegram-send: лимит касаний исчерпан, кандидат ${conv.candidate_id}`);
      return new Response("ok");
    }

    const res = await fetch(`https://api.telegram.org/bot${bot.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: conv.external_chat_id,
        text: row.body,
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      // Не бросаем: сообщение в базе уже есть, HR его видит. Молчаливая
      // потеря хуже, чем видимая ошибка — записываем её в карточку бота,
      // чтобы было понятно, почему кандидат не отвечает.
      const text = await res.text();
      console.error("telegram-send: Telegram ответил", res.status, text);
      await supabase
        .from("messenger_bots")
        .update({ last_error: `${res.status}: ${text}`.slice(0, 500) })
        .eq("id", bot.id);
      return new Response("ok");
    }

    const sent = await res.json();
    await supabase
      .from("messages")
      .update({ external_message_id: `tg:${conv.external_chat_id}:${sent.result?.message_id}` })
      .eq("id", row.id);

    await supabase
      .from("messenger_bots")
      .update({ last_seen_at: new Date().toISOString(), last_error: null })
      .eq("id", bot.id);

    return new Response("ok");
  } catch (e) {
    console.error("telegram-send", e);
    return new Response("ok");
  }
});
