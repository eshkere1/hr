/**
 * telegram-send — исходящая сторона переписки.
 *
 * Приложение при отправке просто пишет строку в messages: база остаётся
 * единственным источником правды, а доставка — отдельная забота. Эту
 * функцию дёргает Database Webhook на INSERT в messages.
 *
 * Настройка (Dashboard → Database → Webhooks):
 *   таблица   messages
 *   событие   INSERT
 *   тип       Supabase Edge Function → telegram-send
 *
 * Секреты:
 *   supabase secrets set TELEGRAM_BOT_TOKEN=...
 *
 * Почему лимит касаний проверяется здесь, а не только в интерфейсе:
 * интерфейс — не граница системы. Сообщение может уйти из скрипта, из
 * автодействия этапа, из будущего ИИ-автопилота. Единственное место, где
 * запрет действительно работает, — точка отправки.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";

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
}

Deno.serve(async (req) => {
  if (!BOT_TOKEN) {
    console.error("telegram-send: TELEGRAM_BOT_TOKEN не задан");
    return new Response("ok");
  }

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

  try {
    const { data: conv, error } = await supabase
      .from("conversations")
      .select("id, candidate_id, channel, external_chat_id")
      .eq("id", row.conversation_id)
      .single();
    if (error) throw error;

    // Диалог мог идти по почте или в самом приложении — тогда это не наша
    // доставка, молча выходим.
    if (conv.channel !== "telegram" || !conv.external_chat_id) {
      return new Response("ok");
    }

    // Антиспам (фишка 41). Считает та же функция в базе, что и интерфейс, —
    // чтобы правило было одно, а не два расходящихся.
    const { data: allowed } = await supabase.rpc("can_touch_candidate", {
      _candidate_id: conv.candidate_id,
    });
    if (allowed === false) {
      console.warn(`telegram-send: лимит касаний исчерпан, кандидат ${conv.candidate_id}`);
      return new Response("ok");
    }

    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
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
      // потеря хуже, чем запись в логе, по которой видно, что не ушло.
      console.error("telegram-send: Telegram ответил", res.status, await res.text());
      return new Response("ok");
    }

    const sent = await res.json();
    await supabase
      .from("messages")
      .update({ external_message_id: `tg:${conv.external_chat_id}:${sent.result?.message_id}` })
      .eq("id", row.id);

    return new Response("ok");
  } catch (e) {
    console.error("telegram-send", e);
    return new Response("ok");
  }
});
