import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, Check, ExternalLink, Phone, Search, X } from "lucide-react";
import * as api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Input, Skeleton, Tag } from "@/components/ui";
import { EmptyState, PageHeader } from "@/components/app/primitives";
import { ChatComposer, ChatThread } from "@/components/app/Chat";
import { cn, initials, timeRu } from "@/lib/utils";
import type { Conversation, Message } from "@/lib/types";

/**
 * Мессенджер.
 *
 * Кандидат живёт в Телеграме и на сайт не заходит. Значит, вся переписка —
 * это рабочее место, а не справочный раздел: HR сидит здесь часами. Отсюда
 * требования, которых не было у прежнего экрана на две колонки: поиск по
 * людям, неотвеченные сверху, дни разделены, лента сама прокручивается вниз
 * и сама подтягивает новые сообщения.
 *
 * Ботов может быть несколько, и в шапке диалога видно, через какого он идёт:
 * ответить нужно из того аккаунта, в который человек написал.
 */
const REFRESH_MS = 15_000;

export default function Inbox() {
  const { can } = useAuth();
  const [list, setList] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [onlyUnread, setOnlyUnread] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);

  const activeRef = useRef<string | null>(null);
  activeRef.current = activeId;

  async function loadList() {
    const raw = await api.listConversations();
    setList(await api.attachPreviews(raw));
    setLoading(false);
  }

  async function loadMessages(id: string, silent = false) {
    if (!silent) setMsgLoading(true);
    const data = await api.listMessages(id);
    // Пока грузили, человек мог переключиться на другой диалог — не
    // подменяем ему переписку под руками.
    if (activeRef.current === id) setMessages(data);
    setMsgLoading(false);
  }

  useEffect(() => {
    void loadList();
  }, []);

  // Ответ кандидата приходит в Телеграме, а не по нашей кнопке. Без опроса
  // HR узнавал бы о нём, только обновив страницу вручную.
  useEffect(() => {
    const t = setInterval(() => {
      void loadList();
      if (activeRef.current) void loadMessages(activeRef.current, true);
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list
      .filter((c) => (onlyUnread ? c.unread_for_staff > 0 : true))
      .filter((c) =>
        !q ||
        c.candidate_name.toLowerCase().includes(q) ||
        (c.vacancy_title ?? "").toLowerCase().includes(q) ||
        (c.preview ?? "").toLowerCase().includes(q),
      );
  }, [list, query, onlyUnread]);

  const active = filtered.find((c) => c.id === activeId) ?? filtered[0] ?? null;

  useEffect(() => {
    if (active && active.id !== activeRef.current) {
      activeRef.current = active.id;
      setActiveId(active.id);
      void loadMessages(active.id);
    }
  }, [active?.id]);

  const unreadTotal = list.reduce((n, c) => n + (c.unread_for_staff > 0 ? 1 : 0), 0);

  if (loading) return <Skeleton className="h-[70vh] w-full" />;

  if (list.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Телеграм" title="Мессенджер" />
        <EmptyState
          title="Диалогов пока нет"
          description="Они появятся, как только первый кандидат напишет боту. Регистрироваться на сайте ему не нужно. Если бот ещё не подключён — это в разделе «Боты»."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Телеграм"
        title="Мессенджер"
        description={
          unreadTotal > 0
            ? `${unreadTotal} ${unreadTotal === 1 ? "диалог ждёт" : unreadTotal < 5 ? "диалога ждут" : "диалогов ждут"} ответа. Сообщения ассистента помечены пунктиром: человек всегда должен понимать, с кем говорит.`
            : "Все ответы даны. Сообщения ассистента помечены пунктиром: человек всегда должен понимать, с кем говорит."
        }
      />

      <div className="grid h-[calc(100vh-230px)] min-h-[460px] gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* ---------------------------------------------------------------
            Лента диалогов
        --------------------------------------------------------------- */}
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface">
          <div className="flex flex-col gap-2 border-b border-border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-[10px] top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Имя, вакансия или текст"
                aria-label="Поиск по переписке"
                className="pl-9"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  aria-label="Очистить поиск"
                  className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-ink-3 hover:bg-surface-2"
                >
                  <X className="h-[14px] w-[14px]" />
                </button>
              )}
            </div>

            <button
              onClick={() => setOnlyUnread((v) => !v)}
              className={cn(
                "self-start rounded-md px-[9px] py-[5px] text-[12px] font-medium transition-colors",
                onlyUnread
                  ? "bg-primary-soft text-primary"
                  : "text-ink-3 hover:bg-surface-2 hover:text-ink",
              )}
            >
              {onlyUnread ? "Показаны только неотвеченные" : `Только неотвеченные · ${unreadTotal}`}
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <p className="p-4 text-center text-[12.5px] text-ink-3">
                Ничего не нашлось
              </p>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setActiveId(c.id);
                    activeRef.current = c.id;
                    void loadMessages(c.id);
                  }}
                  className={cn(
                    "flex w-full items-start gap-[10px] rounded-md p-[10px] text-left transition-colors",
                    active?.id === c.id ? "bg-primary-soft" : "hover:bg-surface-2",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-primary-soft text-[11px] font-bold text-primary"
                  >
                    {initials(c.candidate_name)}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <b className="truncate text-[13.5px]">{c.candidate_name}</b>
                      <time className="shrink-0 font-mono text-[10px] text-ink-3">
                        {timeRu(c.last_message_at)}
                      </time>
                    </span>

                    <span className="mt-[1px] block truncate text-[11.5px] text-ink-3">
                      {c.vacancy_title ?? "Без вакансии"}
                    </span>

                    <span className="mt-[3px] flex items-center gap-2">
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-[12px]",
                          c.unread_for_staff > 0 ? "font-medium text-ink" : "text-ink-2",
                        )}
                      >
                        {c.preview_incoming === false && c.preview && (
                          <Check className="mr-1 inline h-3 w-3 text-ink-3" aria-label="Отвечено" />
                        )}
                        {c.preview ?? "—"}
                      </span>
                      {c.unread_for_staff > 0 && (
                        <span className="shrink-0 rounded-full bg-primary px-[6px] font-mono text-[10px] leading-[16px] text-primary-foreground">
                          {c.unread_for_staff}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* ---------------------------------------------------------------
            Диалог
        --------------------------------------------------------------- */}
        {active ? (
          <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-[10px]">
              <div className="flex min-w-0 items-center gap-[10px]">
                <span
                  aria-hidden="true"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-primary-soft text-[11px] font-bold text-primary"
                >
                  {initials(active.candidate_name)}
                </span>
                <div className="min-w-0">
                  <b className="block truncate text-[14px]">{active.candidate_name}</b>
                  <span className="block truncate text-[11.5px] text-ink-3">
                    {active.vacancy_title ?? "Без вакансии"}
                    {active.bot_name && ` · ${active.bot_name}`}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {active.is_ai_autopilot && (
                  <Tag tone="info">
                    <Bot className="h-3 w-3" /> Ассистент ведёт диалог
                  </Tag>
                )}
                {can("hr_manager", "superuser") && (
                  <Link
                    to={`/people?q=${encodeURIComponent(active.candidate_name)}`}
                    title="Найти в общем списке"
                    className="grid h-8 w-8 place-items-center rounded-md text-ink-3 no-underline hover:bg-surface-2 hover:text-ink"
                  >
                    <Phone className="h-4 w-4" />
                  </Link>
                )}
                {active.application_id && (
                  <Link
                    to={`/applications/${active.application_id}`}
                    className="inline-flex items-center gap-[6px] rounded-md border border-border-strong px-[10px] py-[6px] text-[12.5px] font-semibold text-ink no-underline hover:bg-surface-2 hover:no-underline"
                  >
                    <ExternalLink className="h-[14px] w-[14px]" /> Отклик
                  </Link>
                )}
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto bg-surface-2">
              <ChatThread messages={messages} loading={msgLoading} />
            </div>

            <ChatComposer
              conversationId={active.id}
              candidateId={active.candidate_id}
              botName={active.bot_name}
              onSent={() => {
                void loadMessages(active.id, true);
                void loadList();
              }}
            />
          </section>
        ) : (
          <div className="grid place-items-center rounded-lg border border-border bg-surface">
            <p className="m-0 text-[13px] text-ink-3">Выберите диалог слева</p>
          </div>
        )}
      </div>
    </>
  );
}
