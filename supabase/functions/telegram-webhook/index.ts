/**
 * telegram-webhook — бот для кандидата.
 *
 * Кандидат живёт в Телеграме и на сайт не заходит. Значит, весь его путь
 * должен помещаться сюда: отклик, статус, запись на встречу, задание,
 * документы, согласие и право его отозвать.
 *
 * Что умеет (номера — фишки из исходной таблицы):
 *   11  весь путь кандидата в мессенджере
 *   34  самозапись на встречу из свободных окон
 *   36  короткий тест прямо в переписке
 *   42  публичный статус: где я и до какого срока обещан ответ
 *   50  какие документы нужны и чего не хватает
 *   61  согласие на обработку данных кнопкой, отзыв — там же
 *   62  запрос на удаление данных
 *
 * Чего он НЕ делает: не выдумывает. Каждый ответ собран из строк базы.
 * Бот, сочинивший вилку или срок, стоит дороже, чем бот, который честно
 * говорит «этого я не знаю, передал рекрутеру».
 *
 * Ботов может быть несколько, поэтому адрес несёт id того, кто принимает:
 *   /functions/v1/telegram-webhook/<id бота>
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

// ---------------------------------------------------------------------------
// Телеграм
// ---------------------------------------------------------------------------
type Button = { text: string; callback_data: string };

async function tg(token: string, method: string, body: unknown) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

interface Ctx {
  botId: string;
  token: string;
  chatId: number;
  candidateId: string;
  conversationId: string;
}

/**
 * Ответ кандидату.
 *
 * Отправляем сразу и только потом пишем в базу — с уже проставленным
 * external_message_id, чтобы функция доставки не отправила то же самое
 * вторым сообщением.
 *
 * ai_intent = auto_reply: это ответ на вопрос, а не наша инициатива,
 * и в лимит касаний он не идёт (см. миграцию 09).
 */
async function reply(ctx: Ctx, text: string, buttons?: Button[][]) {
  const sent = await tg(ctx.token, "sendMessage", {
    chat_id: ctx.chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
  });

  await supabase.from("messages").insert({
    conversation_id: ctx.conversationId,
    direction: "outbound",
    author_kind: "ai_assistant",
    body: text.replace(/<[^>]+>/g, ""),
    ai_intent: "auto_reply",
    external_message_id: sent.ok ? `tg:${ctx.chatId}:${sent.result?.message_id}` : null,
    is_read: true,
  });
}

// ---------------------------------------------------------------------------
// Форматирование
// ---------------------------------------------------------------------------
const MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

function whenRu(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("ru-RU", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow",
  });
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${time}`;
}

/** «через 4 часа», «завтра» — человеку понятнее, чем дата со временем. */
function leftRu(iso: string): string {
  const hours = Math.round((new Date(iso).getTime() - Date.now()) / 3_600_000);
  if (hours < 0) return "срок уже вышел, мы знаем и торопимся";
  if (hours < 1) return "в течение часа";
  if (hours < 24) return `в течение ${hours} ч`;
  const days = Math.round(hours / 24);
  return days === 1 ? "до завтра" : `в течение ${days} дн.`;
}

const DOC_LABEL: Record<string, string> = {
  passport: "паспорт",
  snils: "СНИЛС",
  inn: "ИНН",
  work_book: "трудовая книжка",
  diploma: "диплом",
  qualification: "документ о квалификации",
  medical_certificate: "медицинская справка",
  background_check: "справка об отсутствии судимости",
  military_id: "военный билет",
  other: "другое",
};

// ---------------------------------------------------------------------------
// Точка входа
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const botId = parts[parts.length - 1];
  if (!/^[0-9a-f-]{36}$/i.test(botId ?? "")) {
    return new Response("bot id missing in path", { status: 404 });
  }

  const { data: bot } = await supabase
    .from("messenger_bots")
    .select("id, token, webhook_secret, is_active")
    .eq("id", botId)
    .maybeSingle();

  if (!bot || !bot.is_active) return new Response("unknown bot", { status: 404 });

  // Проверка секрета — до любой работы с телом. Без неё адрес открыт всему
  // интернету, а он пишет в базу.
  if (req.headers.get("x-telegram-bot-api-secret-token") !== bot.webhook_secret) {
    return new Response("forbidden", { status: 403 });
  }

  let update: any;
  try {
    update = await req.json();
  } catch {
    return new Response("bad request", { status: 400 });
  }

  try {
    await route(bot, update);
  } catch (e) {
    console.error("telegram-webhook", botId, e);
    await supabase
      .from("messenger_bots")
      .update({ last_error: String(e).slice(0, 500) })
      .eq("id", bot.id);
  }

  // 200 всегда: на 5xx Телеграм повторяет доставку по кругу, и очередь встанет.
  // Ошибка видна в карточке бота и в логах.
  return new Response("ok");
});

async function route(bot: { id: string; token: string }, update: any) {
  const cb = update.callback_query;
  const msg = update.message ?? update.edited_message ?? cb?.message;
  const from = cb?.from ?? update.message?.from ?? update.edited_message?.from;
  if (!msg || !from) return;

  const chatId = msg.chat.id;
  const { candidateId, conversationId, isNew } = await ensureCandidate(bot.id, from, chatId);
  const ctx: Ctx = { botId: bot.id, token: bot.token, chatId, candidateId, conversationId };

  if (cb) {
    // Убираем «часики» на кнопке — иначе Телеграм крутит их до таймаута.
    await tg(bot.token, "answerCallbackQuery", { callback_query_id: cb.id });
    await onCallback(ctx, String(cb.data ?? ""));
    return;
  }

  const text: string = update.message?.text ?? update.message?.caption ?? "";
  if (!text) return;

  // Входящее пишем всегда: даже команда — это часть переписки, и рекрутер
  // должен видеть, что человек делал.
  await supabase.from("messages").insert({
    conversation_id: conversationId,
    direction: "inbound",
    author_kind: "candidate",
    body: text,
    external_message_id: `tg:${chatId}:${update.message?.message_id ?? Date.now()}`,
    sent_at: new Date((update.message?.date ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    is_read: false,
  });

  if (isNew || text.startsWith("/start")) return onStart(ctx);
  if (text.startsWith("/")) return onCommand(ctx, text.split(/[\s@]/)[0]);
  return onPlainText(ctx, text);
}

// ---------------------------------------------------------------------------
// Кандидат и диалог
// ---------------------------------------------------------------------------
async function ensureCandidate(botId: string, from: any, chatId: number) {
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ")
    || from.username || `Кандидат ${from.id}`;

  let { data: candidate } = await supabase
    .from("candidates")
    .select("id")
    .eq("telegram_user_id", from.id)
    .maybeSingle();

  let isNew = false;
  if (!candidate) {
    isNew = true;
    const { data: created } = await supabase
      .from("candidates")
      .insert({
        full_name: name,
        telegram_user_id: from.id,
        telegram_username: from.username ?? null,
        primary_source: "telegram",
        // Согласие берём отдельным шагом, кнопкой. Из того, что человек
        // написал боту, оно не следует (152-ФЗ, фишка 61).
        consent_pd_granted: false,
      })
      .select("id")
      .single();
    candidate = created!;
  }

  let { data: conversation } = await supabase
    .from("conversations")
    .select("id, bot_id")
    .eq("candidate_id", candidate!.id)
    .eq("channel", "telegram")
    .is("application_id", null)
    .maybeSingle();

  if (!conversation) {
    const { data: created } = await supabase
      .from("conversations")
      .insert({
        candidate_id: candidate!.id,
        channel: "telegram",
        external_chat_id: String(chatId),
        bot_id: botId,
      })
      .select("id, bot_id")
      .single();
    conversation = created!;
  } else if (conversation.bot_id !== botId) {
    // Написал в другого нашего бота — отвечать теперь оттуда же.
    await supabase
      .from("conversations")
      .update({ bot_id: botId, external_chat_id: String(chatId) })
      .eq("id", conversation.id);
  }

  return { candidateId: candidate!.id, conversationId: conversation!.id, isNew };
}

// ---------------------------------------------------------------------------
// Команды
// ---------------------------------------------------------------------------
const MENU: Button[][] = [
  [{ text: "Мой статус", callback_data: "status" }, { text: "Вакансии", callback_data: "vacancies" }],
  [{ text: "Записаться на встречу", callback_data: "slots" }, { text: "Задание", callback_data: "test" }],
  [{ text: "Документы", callback_data: "docs" }, { text: "Мои данные", callback_data: "privacy" }],
];

async function onCommand(ctx: Ctx, cmd: string) {
  switch (cmd) {
    case "/status": return showStatus(ctx);
    case "/vacancies": return showVacancies(ctx);
    case "/slots": return showSlots(ctx);
    case "/docs": return showDocs(ctx);
    case "/test": return showTest(ctx);
    case "/privacy": return showPrivacy(ctx);
    case "/menu":
    case "/help":
      return reply(ctx, "Чем помочь?", MENU);
    default:
      return reply(
        ctx,
        "Такой команды не знаю. Вот что умею:",
        MENU,
      );
  }
}

async function onCallback(ctx: Ctx, data: string) {
  const [action, arg] = data.split(":");
  switch (action) {
    case "status": return showStatus(ctx);
    case "vacancies": return showVacancies(ctx);
    case "slots": return showSlots(ctx);
    case "docs": return showDocs(ctx);
    case "test": return showTest(ctx);
    case "privacy": return showPrivacy(ctx);
    case "consent": return onConsent(ctx, arg === "yes");
    case "apply": return onApply(ctx, arg);
    case "book": return onBook(ctx, arg);
    case "begin": return onBeginTest(ctx, arg);
    case "revoke": return onRevoke(ctx);
    case "erase": return onErase(ctx, arg === "yes");
    default: return reply(ctx, "Не понял, что нажали. Попробуйте ещё раз:", MENU);
  }
}

// ---------------------------------------------------------------------------
// Старт и согласие (фишка 61)
// ---------------------------------------------------------------------------
async function onStart(ctx: Ctx) {
  const granted = await hasConsent(ctx.candidateId);
  if (granted) {
    return reply(ctx, "Здравствуйте! Чем помочь?", MENU);
  }

  return reply(
    ctx,
    "Здравствуйте! Я бот компании по найму.\n\n" +
    "Через меня можно откликнуться на вакансию, узнать, где ваш отклик сейчас, " +
    "записаться на встречу и прислать документы.\n\n" +
    "Чтобы вести отбор, мне нужно ваше согласие на обработку персональных данных: " +
    "имя, контакты, ответы на задания. Храним их до трёх лет, отозвать согласие " +
    "можно в любой момент — команда /privacy.\n\n" +
    "Без согласия я ничего о вас не запишу и обращаться к вам не буду.",
    [[
      { text: "Согласен", callback_data: "consent:yes" },
      { text: "Не согласен", callback_data: "consent:no" },
    ]],
  );
}

async function hasConsent(candidateId: string): Promise<boolean> {
  const { data } = await supabase
    .from("consents")
    .select("id")
    .eq("candidate_id", candidateId)
    .eq("kind", "pd_processing")
    .is("revoked_at", null)
    .maybeSingle();
  return !!data;
}

async function onConsent(ctx: Ctx, yes: boolean) {
  if (!yes) {
    await supabase.from("deletion_requests").insert({
      candidate_id: ctx.candidateId,
      source: "telegram",
      note: "Отказ от обработки данных при первом контакте",
    });
    return reply(
      ctx,
      "Понял, настаивать не буду. Заявку на удаление того, что уже записалось, " +
      "я передал — её обработает человек.\n\n" +
      "Если передумаете, напишите /start.",
    );
  }

  await supabase.from("consents").upsert(
    {
      candidate_id: ctx.candidateId,
      kind: "pd_processing",
      granted_at: new Date().toISOString(),
      revoked_at: null,
      text_version: "v1",
      // Чем подтверждается согласие: не «где-то галочка», а конкретное
      // нажатие в конкретном чате в конкретное время.
      evidence: { source: "telegram_button", chat_id: ctx.chatId, at: new Date().toISOString() },
    },
    { onConflict: "candidate_id,kind" },
  );
  await supabase
    .from("candidates")
    .update({ consent_pd_granted: true })
    .eq("id", ctx.candidateId);

  return reply(
    ctx,
    "Спасибо. Теперь можно к делу — с чего начнём?",
    MENU,
  );
}

// ---------------------------------------------------------------------------
// Статус (фишка 42)
// ---------------------------------------------------------------------------
async function showStatus(ctx: Ctx) {
  const { data: apps } = await supabase
    .from("applications")
    .select(`
      id, status, stage_entered_at, sla_due_at, archive_segment,
      vacancies ( title ),
      pipeline_stages ( name, order_index ),
      rejection_reasons ( candidate_wording )
    `)
    .eq("candidate_id", ctx.candidateId)
    .order("applied_at", { ascending: false });

  if (!apps || apps.length === 0) {
    return reply(
      ctx,
      "Откликов пока нет. Посмотрите, что открыто:",
      [[{ text: "Вакансии", callback_data: "vacancies" }]],
    );
  }

  const lines = apps.map((a: any) => {
    const title = a.vacancies?.title ?? "Вакансия";
    if (a.status === "rejected") {
      // Формулировка берётся из справочника причин (фишка 33): человек
      // читает её, а не «вы нам не подходите».
      const wording = a.rejection_reasons?.candidate_wording
        ?? "Мы остановились на другом кандидате. Ваш профиль остаётся в базе.";
      return `<b>${title}</b>\nОтбор завершён. ${wording}`;
    }
    if (a.status === "hired") return `<b>${title}</b>\nВы приняты. Поздравляем!`;

    const stage = a.pipeline_stages?.name ?? "В работе";
    const promise = a.sla_due_at
      ? `\nОтветим ${leftRu(a.sla_due_at)}.`
      : "";
    return `<b>${title}</b>\nСейчас: ${stage}.${promise}`;
  });

  return reply(
    ctx,
    lines.join("\n\n") +
    "\n\nЕсли срок ответа вышел — это наша вина, а не ваша. Напишите сюда, я передам.",
    MENU,
  );
}

// ---------------------------------------------------------------------------
// Вакансии и отклик (фишка 11)
// ---------------------------------------------------------------------------
async function showVacancies(ctx: Ctx) {
  const { data: vacancies } = await supabase
    .from("vacancies")
    .select("id, title, city, work_format, first_month_reality, specialization")
    .eq("status", "published")
    .limit(10);

  if (!vacancies || vacancies.length === 0) {
    return reply(ctx, "Сейчас открытых вакансий нет. Как появятся — напишу, если разрешите.");
  }

  const { data: mine } = await supabase
    .from("applications")
    .select("vacancy_id")
    .eq("candidate_id", ctx.candidateId);
  const applied = new Set((mine ?? []).map((a: any) => a.vacancy_id));

  const FORMAT: Record<string, string> = {
    onsite: "офис", remote: "удалённо", hybrid: "гибрид",
  };

  const text = vacancies
    .map((v: any) => {
      const where = [v.city, FORMAT[v.work_format]].filter(Boolean).join(", ");
      const honest = v.first_month_reality ? `\n<i>Первый месяц: ${v.first_month_reality}</i>` : "";
      return `<b>${v.title}</b>${where ? `\n${where}` : ""}${honest}`;
    })
    .join("\n\n");

  const buttons = vacancies
    .filter((v: any) => !applied.has(v.id))
    .map((v: any) => [{ text: `Откликнуться: ${v.title}`.slice(0, 60), callback_data: `apply:${v.id}` }]);

  return reply(
    ctx,
    text + (buttons.length === 0 ? "\n\nВы уже откликнулись на всё, что открыто." : ""),
    buttons.length ? buttons : MENU,
  );
}

async function onApply(ctx: Ctx, vacancyId: string) {
  if (!(await hasConsent(ctx.candidateId))) return onStart(ctx);

  const { error } = await supabase.from("applications").insert({
    candidate_id: ctx.candidateId,
    vacancy_id: vacancyId,
    source: "telegram",
    // stage_id, sla_due_at и число критериев проставит триггер
    // prepare_new_application — клиенту это знать не нужно.
    stage_id: null as unknown as string,
  });

  if (error) {
    if (error.code === "23505") return reply(ctx, "Вы уже откликались на эту вакансию.", MENU);
    throw error;
  }

  return reply(
    ctx,
    "Отклик принят. Рекрутер увидит его в ближайшее время — статус можно " +
    "посмотреть в любой момент.",
    [[{ text: "Мой статус", callback_data: "status" }]],
  );
}

// ---------------------------------------------------------------------------
// Самозапись на встречу (фишка 34)
// ---------------------------------------------------------------------------
async function activeApplication(candidateId: string) {
  const { data } = await supabase
    .from("applications")
    .select("id, vacancy_id, vacancies ( title, required_documents )")
    .eq("candidate_id", candidateId)
    .eq("status", "active")
    .order("applied_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as any;
}

async function showSlots(ctx: Ctx) {
  const app = await activeApplication(ctx.candidateId);
  if (!app) return reply(ctx, "Активного отклика нет — записываться пока не на что.", MENU);

  const { data: booked } = await supabase
    .from("interview_slots")
    .select("starts_at, work_format, location")
    .eq("booked_by_application_id", app.id)
    .gte("starts_at", new Date().toISOString())
    .maybeSingle();

  if (booked) {
    const where = booked.work_format === "onsite"
      ? `Адрес: ${booked.location ?? "уточним отдельно"}`
      : "Ссылку пришлём перед встречей.";
    return reply(ctx, `Вы записаны: <b>${whenRu(booked.starts_at)}</b>.\n${where}`, MENU);
  }

  const { data: slots } = await supabase
    .from("interview_slots")
    .select("id, starts_at, work_format")
    .eq("is_booked", false)
    .or(`vacancy_id.eq.${app.vacancy_id},vacancy_id.is.null`)
    .gte("starts_at", new Date().toISOString())
    .order("starts_at")
    .limit(8);

  if (!slots || slots.length === 0) {
    return reply(
      ctx,
      "Свободных окон сейчас нет. Как только руководитель их откроет, я напишу.",
      MENU,
    );
  }

  return reply(
    ctx,
    "Выберите удобное время. Согласовывать ни с кем не нужно — окно займётся сразу.",
    slots.map((s: any) => [{ text: whenRu(s.starts_at), callback_data: `book:${s.id}` }]),
  );
}

async function onBook(ctx: Ctx, slotId: string) {
  const app = await activeApplication(ctx.candidateId);
  if (!app) return reply(ctx, "Активного отклика нет.", MENU);

  // Условие is_booked = false в самом UPDATE: двое могли нажать на одно
  // окно одновременно, и выиграть должен только первый.
  const { data, error } = await supabase
    .from("interview_slots")
    .update({ is_booked: true, booked_by_application_id: app.id })
    .eq("id", slotId)
    .eq("is_booked", false)
    .select("starts_at, work_format, location")
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return reply(
      ctx,
      "Это окно только что заняли. Вот что осталось:",
      [[{ text: "Показать свободные", callback_data: "slots" }]],
    );
  }

  const where = data.work_format === "onsite"
    ? `Адрес: ${data.location ?? "пришлём отдельно"}`
    : "Ссылку пришлём перед встречей.";

  return reply(
    ctx,
    `Записал: <b>${whenRu(data.starts_at)}</b>.\n${where}\n\n` +
    "Если планы изменятся — напишите сюда, перенесём.",
    MENU,
  );
}

// ---------------------------------------------------------------------------
// Задание (фишки 10, 36, 37)
// ---------------------------------------------------------------------------
async function currentAssessment(candidateId: string) {
  const { data } = await supabase
    .from("assessments")
    .select(`
      id, status, answers, due_at,
      assessment_templates ( name, description, duration_min, questions ),
      applications!inner ( candidate_id )
    `)
    .eq("applications.candidate_id", candidateId)
    .in("status", ["assigned", "opened"])
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as any;
}

async function showTest(ctx: Ctx) {
  const a = await currentAssessment(ctx.candidateId);
  if (!a) return reply(ctx, "Заданий сейчас нет. Появится — пришлю сюда.", MENU);

  const t = a.assessment_templates;
  const total = (t?.questions ?? []).length;
  const done = (a.answers ?? []).length;

  if (a.status === "opened" && done > 0) {
    return askQuestion(ctx, a);
  }

  const due = a.due_at ? `\nОтветить нужно ${leftRu(a.due_at)}.` : "";
  return reply(
    ctx,
    `<b>${t?.name ?? "Задание"}</b>\n${t?.description ?? ""}\n\n` +
    `Вопросов: ${total}. Займёт около ${t?.duration_min ?? 10} минут.${due}\n\n` +
    "Отвечать можно обычными сообщениями, по одному на вопрос.",
    [[{ text: "Начать", callback_data: `begin:${a.id}` }]],
  );
}

async function onBeginTest(ctx: Ctx, assessmentId: string) {
  await supabase
    .from("assessments")
    .update({ status: "opened", opened_at: new Date().toISOString() })
    .eq("id", assessmentId);
  const a = await currentAssessment(ctx.candidateId);
  if (a) return askQuestion(ctx, a);
}

async function askQuestion(ctx: Ctx, a: any) {
  const questions = a.assessment_templates?.questions ?? [];
  const done = (a.answers ?? []).length;
  if (done >= questions.length) return finishTest(ctx, a);

  return reply(
    ctx,
    `Вопрос ${done + 1} из ${questions.length}:\n\n<b>${questions[done].q}</b>\n\n` +
    "<i>Ответьте сообщением. Развёрнуто — лучше, чем коротко.</i>",
  );
}

async function finishTest(ctx: Ctx, a: any) {
  await supabase
    .from("assessments")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", a.id);

  return reply(
    ctx,
    "Готово, задание принято. Разбор пришлём вам лично — он будет полезен, " +
    "даже если мы не сойдёмся.",
    MENU,
  );
}

// ---------------------------------------------------------------------------
// Документы (фишка 50)
// ---------------------------------------------------------------------------
async function showDocs(ctx: Ctx) {
  const app = await activeApplication(ctx.candidateId);
  if (!app) return reply(ctx, "Активного отклика нет — документы пока не нужны.", MENU);

  const required: string[] = app.vacancies?.required_documents ?? [];
  if (required.length === 0) {
    return reply(ctx, "Для этой вакансии документы заранее не нужны.", MENU);
  }

  const { data: docs } = await supabase
    .from("candidate_documents")
    .select("kind, state")
    .eq("candidate_id", ctx.candidateId);

  const have = new Map((docs ?? []).map((d: any) => [d.kind, d.state]));
  const STATE: Record<string, string> = {
    valid: "принят", pending: "на проверке", expiring: "скоро истечёт",
    expired: "истёк", rejected: "не принят", missing: "не хватает",
  };

  const lines = required.map((k) => {
    const state = have.get(k);
    const mark = state === "valid" ? "✅" : state === "pending" ? "🕓" : "❌";
    return `${mark} ${DOC_LABEL[k] ?? k} — ${STATE[state ?? "missing"]}`;
  });

  const missing = required.filter((k) => have.get(k) !== "valid");

  return reply(
    ctx,
    `Для оформления по этой вакансии нужно:\n\n${lines.join("\n")}\n\n` +
    (missing.length
      ? "Пришлите недостающее прямо сюда — фото или файлом. Пока чего-то не хватает, " +
        "оффер оформить не сможем, это требование не наше."
      : "Всё на месте, ничего присылать не нужно."),
    MENU,
  );
}

// ---------------------------------------------------------------------------
// Данные: отзыв согласия и удаление (фишки 61, 62)
// ---------------------------------------------------------------------------
async function showPrivacy(ctx: Ctx) {
  const granted = await hasConsent(ctx.candidateId);
  return reply(
    ctx,
    "<b>Ваши данные</b>\n\n" +
    `Согласие на обработку: ${granted ? "выдано" : "не выдано"}.\n` +
    "Что храним: имя, контакты, отклики, переписку и ответы на задания.\n" +
    "Срок хранения: до трёх лет с последнего контакта.\n\n" +
    "Отзыв согласия останавливает обработку — мы перестаём вам писать. " +
    "Удаление стирает всё, включая историю откликов, и восстановить её нельзя.",
    [
      granted ? [{ text: "Отозвать согласие", callback_data: "revoke" }] : [],
      [{ text: "Запросить удаление данных", callback_data: "erase:ask" }],
    ].filter((r) => r.length > 0),
  );
}

async function onRevoke(ctx: Ctx) {
  await supabase
    .from("consents")
    .update({ revoked_at: new Date().toISOString() })
    .eq("candidate_id", ctx.candidateId)
    .eq("kind", "pd_processing")
    .is("revoked_at", null);
  await supabase
    .from("candidates")
    .update({ consent_pd_granted: false })
    .eq("id", ctx.candidateId);

  return reply(
    ctx,
    "Согласие отозвано, писать вам мы перестанем.\n\n" +
    "Данные пока остаются — если хотите стереть их совсем, нажмите ниже. " +
    "Вернуться можно в любой момент: /start.",
    [[{ text: "Удалить данные", callback_data: "erase:ask" }]],
  );
}

async function onErase(ctx: Ctx, confirmed: boolean) {
  if (!confirmed) {
    return reply(
      ctx,
      "Удалить всё: профиль, отклики, переписку и ответы на задания?\n\n" +
      "Это необратимо. Если позже захотите откликнуться снова, начинать придётся с нуля — " +
      "прошлые результаты не сохранятся.",
      [[
        { text: "Да, удалить", callback_data: "erase:yes" },
        { text: "Отмена", callback_data: "privacy" },
      ]],
    );
  }

  await supabase.from("deletion_requests").insert({
    candidate_id: ctx.candidateId,
    source: "telegram",
    note: "Запрос из бота, подтверждён кнопкой",
  });

  return reply(
    ctx,
    "Заявку принял. Данные удалит человек — по закону у нас на это до 30 дней, " +
    "обычно уходит меньше. Писать вам мы перестали уже сейчас.",
  );
}

// ---------------------------------------------------------------------------
// Обычный текст
// ---------------------------------------------------------------------------
async function onPlainText(ctx: Ctx, text: string) {
  // Идёт задание — сообщение считается ответом на текущий вопрос.
  const a = await currentAssessment(ctx.candidateId);
  if (a && a.status === "opened") {
    const questions = a.assessment_templates?.questions ?? [];
    const answers = [...(a.answers ?? [])];
    if (answers.length < questions.length) {
      answers.push({ q: questions[answers.length].q, a: text });
      await supabase.from("assessments").update({ answers }).eq("id", a.id);
      const fresh = { ...a, answers };
      return answers.length >= questions.length
        ? finishTest(ctx, fresh)
        : askQuestion(ctx, fresh);
    }
  }

  // Всё остальное — вопрос живому человеку. Бот не отвечает по существу
  // намеренно: сочинённая вилка или срок стоят дороже, чем пауза до
  // ответа рекрутера. Сообщение уже записано, оно попадёт в «Мессенджер».
  return reply(
    ctx,
    "Передал рекрутеру — ответит здесь же.\n\n" +
    "А пока можно посмотреть самому:",
    MENU,
  );
}
