import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, Send } from "lucide-react";
import * as api from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/hooks/useAuth";
import { Button, Card, Input, Skeleton, Tag } from "@/components/ui";
import { EmptyState, PageHeader } from "@/components/app/primitives";
import { cn, dateTimeRu, initials } from "@/lib/utils";
import type { Message } from "@/lib/types";

/**
 * Переписка. Кандидат живёт в Телеграме и на сайт не заходит — здесь мы
 * видим тот же диалог с нашей стороны.
 *
 * Перед отправкой проверяется лимит касаний: дожим без лимитов убивает базу.
 */
export default function Inbox() {
  const { profile } = useAuth();
  const conversations = useAsync(() => api.listConversations(), []);
  const [activeId, setActiveId] = useState<string | null>(null);

  const list = conversations.data ?? [];
  const active = list.find((c) => c.id === activeId) ?? list[0];

  const messages = useAsync(
    () => (active ? api.listMessages(active.id) : Promise.resolve([])),
    [active?.id],
  );

  const [draft, setDraft] = useState("");
  const [canTouch, setCanTouch] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!active) return;
    void api.canTouchCandidate(active.candidate_id).then(setCanTouch);
  }, [active?.candidate_id, messages.data]);

  async function send() {
    if (!active || !draft.trim()) return;
    setSending(true);
    await api.sendMessage(active.id, draft.trim(), profile?.full_name ?? "HR");
    setDraft("");
    messages.reload();
    conversations.reload();
    setSending(false);
  }

  if (conversations.loading) return <Skeleton className="h-[60vh] w-full" />;

  if (list.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Телеграм" title="Переписка" />
        <EmptyState
          title="Диалогов пока нет"
          description="Они появятся, как только первый кандидат напишет боту. Регистрироваться на сайте ему не нужно."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Телеграм"
        title="Переписка"
        description="Сообщения ассистента помечены пунктиром: человек всегда должен понимать, с кем говорит."
      />

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Список диалогов */}
        <div className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto rounded-lg border border-border bg-surface p-2">
          {list.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={cn(
                "flex items-start gap-[10px] rounded-md p-[10px] text-left transition-colors",
                active?.id === c.id ? "bg-primary-soft" : "hover:bg-surface-2",
              )}
            >
              <span
                aria-hidden="true"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-primary-soft text-[11px] font-bold text-primary"
              >
                {initials(c.candidate_name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <b className="truncate text-[13.5px]">{c.candidate_name}</b>
                  {c.unread_for_staff > 0 && (
                    <span className="rounded-full bg-primary px-[6px] font-mono text-[10px] text-primary-foreground">
                      {c.unread_for_staff}
                    </span>
                  )}
                </span>
                <span className="block truncate text-[11.5px] text-ink-3">
                  {c.vacancy_title ?? "Без вакансии"}
                </span>
              </span>
              {c.is_ai_autopilot && (
                <Bot className="mt-1 h-[14px] w-[14px] shrink-0 text-primary" aria-label="Ассистент ведёт диалог" />
              )}
            </button>
          ))}
        </div>

        {/* Диалог */}
        {active && (
          <Card className="flex max-h-[70vh] flex-col gap-3 p-0">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div>
                <b className="text-[14px]">{active.candidate_name}</b>
                {active.application_id && (
                  <Link
                    to={`/applications/${active.application_id}`}
                    className="ml-2 text-[12.5px]"
                  >
                    открыть отклик
                  </Link>
                )}
              </div>
              {active.is_ai_autopilot && (
                <Tag tone="info">
                  <Bot className="h-3 w-3" /> Ассистент ведёт диалог сам
                </Tag>
              )}
            </header>

            <div className="flex flex-1 flex-col gap-[9px] overflow-y-auto bg-surface-2 px-4 py-3">
              {messages.loading ? (
                <Skeleton className="h-32 w-full" />
              ) : (
                (messages.data ?? []).map((m) => <Bubble key={m.id} m={m} />)
              )}
            </div>

            <footer className="flex flex-col gap-2 border-t border-border px-4 py-3">
              {!canTouch && (
                <Tag tone="warn">
                  Лимит касаний на этой неделе исчерпан. Ещё одно сообщение — и мы спам
                </Tag>
              )}
              <div className="flex gap-2">
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void send()}
                  placeholder="Написать кандидату"
                  aria-label="Текст сообщения"
                  disabled={!canTouch}
                />
                <Button onClick={send} disabled={!draft.trim() || sending || !canTouch}>
                  <Send className="h-4 w-4" /> Отправить
                </Button>
              </div>
            </footer>
          </Card>
        )}
      </div>
    </>
  );
}

function Bubble({ m }: { m: Message }) {
  const isAi = m.author_kind === "ai_assistant";
  const isOut = m.author_kind !== "candidate";
  return (
    <div
      className={cn(
        "max-w-[82%] rounded-lg px-[13px] py-[9px] text-[13.5px] leading-snug",
        isAi
          ? "self-start rounded-bl-sm border border-dashed border-primary bg-primary-soft text-ink"
          : isOut
            ? "self-end rounded-br-sm bg-primary text-primary-foreground"
            : "self-start rounded-bl-sm border border-border bg-surface",
      )}
    >
      {m.body}
      <time
        className={cn(
          "mt-1 block font-mono text-[10.5px]",
          isOut && !isAi ? "text-primary-soft" : "text-ink-3",
        )}
      >
        {isAi ? "ассистент · " : m.author_name ? `${m.author_name} · ` : ""}
        {dateTimeRu(m.sent_at)}
      </time>
    </div>
  );
}
