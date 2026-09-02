import { useEffect, useRef, useState } from "react";
import { Bot, Send } from "lucide-react";
import * as api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button, Skeleton, Tag, Textarea } from "@/components/ui";
import { cn, dateRu, timeRu } from "@/lib/utils";
import type { Message } from "@/lib/types";

/**
 * Переписка с кандидатом.
 *
 * Один компонент на два места: страницу «Мессенджер» и вкладку в карточке
 * человека. Раньше карточка показывала те же сообщения, но без поля ввода —
 * приходилось уходить в другой раздел, чтобы ответить. Переписка должна
 * быть там, где принимается решение, а не в соседней вкладке.
 */

/** Сообщения одного дня идут под общей датой — как в любом мессенджере. */
function groupByDay(messages: Message[]) {
  const days: { day: string; items: Message[] }[] = [];
  for (const m of messages) {
    const day = m.sent_at.slice(0, 10);
    const last = days[days.length - 1];
    if (last?.day === day) last.items.push(m);
    else days.push({ day, items: [m] });
  }
  return days;
}

function dayLabel(iso: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (iso === today) return "Сегодня";
  if (iso === yesterday) return "Вчера";
  return dateRu(iso);
}

export function ChatThread({
  messages,
  loading,
  className,
}: {
  messages: Message[];
  loading?: boolean;
  className?: string;
}) {
  const bottom = useRef<HTMLDivElement>(null);
  const count = messages.length;

  // Открывая переписку, человек хочет видеть последнее сообщение, а не
  // первое. Прокручиваем вниз при смене диалога и при новом сообщении.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [count]);

  if (loading) {
    return (
      <div className={cn("flex flex-col gap-3 p-4", className)}>
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="ml-auto h-12 w-1/2" />
        <Skeleton className="h-16 w-3/5" />
      </div>
    );
  }

  if (count === 0) {
    return (
      <div className={cn("grid place-items-center p-8", className)}>
        <p className="m-0 max-w-[46ch] text-center text-[13px] text-ink-3">
          Сообщений пока нет. Переписка начнётся, как только кандидат напишет
          боту — регистрироваться на сайте ему не нужно.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-4 px-4 py-3", className)}>
      {groupByDay(messages).map((g) => (
        <div key={g.day} className="flex flex-col gap-[3px]">
          <div className="mb-2 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">
              {dayLabel(g.day)}
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>
          {g.items.map((m, i) => (
            <Bubble
              key={m.id}
              m={m}
              // Подпись повторяется только когда меняется говорящий:
              // одинаковая строка под каждым пузырём — визуальный шум.
              showAuthor={g.items[i - 1]?.author_kind !== m.author_kind}
            />
          ))}
        </div>
      ))}
      <div ref={bottom} />
    </div>
  );
}

/**
 * Три вида пузырей. Сообщение ассистента помечено пунктиром и подписью:
 * человек всегда должен понимать, с кем говорит.
 */
function Bubble({ m, showAuthor }: { m: Message; showAuthor: boolean }) {
  const isAi = m.author_kind === "ai_assistant";
  const isOut = m.author_kind !== "candidate";

  return (
    <div
      className={cn(
        "max-w-[76%] rounded-[14px] px-[13px] py-[8px] text-[13.5px] leading-[1.45]",
        isAi
          ? "self-start rounded-bl-[4px] border border-dashed border-primary bg-primary-soft text-ink"
          : isOut
            ? "self-end rounded-br-[4px] bg-primary text-primary-foreground"
            : "self-start rounded-bl-[4px] border border-border bg-surface",
      )}
    >
      {showAuthor && (isAi || (isOut && m.author_name)) && (
        <span
          className={cn(
            "mb-[2px] block text-[11px] font-semibold",
            isAi ? "text-primary" : "text-primary-foreground/75",
          )}
        >
          {isAi ? "ассистент" : m.author_name}
        </span>
      )}
      <span className="whitespace-pre-wrap break-words">{m.body}</span>
      <time
        className={cn(
          "mt-[3px] block text-right font-mono text-[10px]",
          isOut && !isAi ? "text-primary-foreground/70" : "text-ink-3",
        )}
      >
        {timeRu(m.sent_at)}
      </time>
    </div>
  );
}

/**
 * Поле ответа.
 *
 * Лимит касаний проверяется до отправки и блокирует кнопку. Это не
 * придирка интерфейса: дожим без ограничений приводит к блокировке бота,
 * а вместе с ним теряется не один кандидат, а канал целиком.
 */
export function ChatComposer({
  conversationId,
  candidateId,
  onSent,
  botName,
}: {
  conversationId: string;
  candidateId: string;
  onSent: () => void;
  botName?: string | null;
}) {
  const { profile } = useAuth();
  const [draft, setDraft] = useState("");
  const [canTouch, setCanTouch] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.canTouchCandidate(candidateId).then(setCanTouch);
  }, [candidateId, conversationId]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      await api.sendMessage(conversationId, text, profile?.full_name ?? "HR");
      setDraft("");
      onSent();
      setCanTouch(await api.canTouchCandidate(candidateId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не отправилось");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border bg-surface px-4 py-3">
      {!canTouch && (
        <Tag tone="warn">
          Лимит касаний на этой неделе исчерпан. Ещё одно сообщение — и мы спам
        </Tag>
      )}
      {error && <Tag tone="crit">{error}</Tag>}

      <div className="flex items-end gap-2">
        <Textarea
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={canTouch ? "Написать кандидату" : "Отправка заблокирована лимитом"}
          aria-label="Текст сообщения"
          disabled={!canTouch}
          className="max-h-[140px] min-h-[40px] resize-y py-[9px]"
        />
        <Button onClick={send} disabled={!draft.trim() || sending || !canTouch}>
          <Send className="h-4 w-4" />
          <span className="hidden sm:inline">Отправить</span>
        </Button>
      </div>

      <p className="m-0 text-[11px] text-ink-3">
        {botName ? (
          <>
            Уйдёт в Телеграм от бота «{botName}». <kbd className="font-mono">Enter</kbd> — отправить,{" "}
            <kbd className="font-mono">Shift+Enter</kbd> — перенос строки
          </>
        ) : (
          <>
            <kbd className="font-mono">Enter</kbd> — отправить,{" "}
            <kbd className="font-mono">Shift+Enter</kbd> — перенос строки
          </>
        )}
      </p>
    </div>
  );
}

/** Готовый чат для карточки кандидата: находит диалог сам. */
export function CandidateChat({ candidateId }: { candidateId: string }) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [botName, setBotName] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const list = await api.listConversations();
    const cv = list.find((c) => c.candidate_id === candidateId);
    setConversationId(cv?.id ?? null);
    setBotName(cv?.bot_name ?? null);
    setMessages(cv ? await api.listMessages(cv.id) : []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [candidateId]);

  if (loading) return <Skeleton className="h-64 w-full" />;

  if (!conversationId) {
    return (
      <div className="rounded-lg border border-border bg-surface p-5">
        <b className="mb-1 block text-[14px]">Переписки ещё нет</b>
        <p className="m-0 max-w-[62ch] text-[13px] text-ink-2">
          Она начнётся, когда кандидат напишет боту. Писать первым в Телеграм
          нельзя — таково ограничение самого мессенджера: диалог всегда
          начинает человек.
        </p>
      </div>
    );
  }

  return (
    <div className="flex max-w-[640px] flex-col overflow-hidden rounded-lg border border-border">
      {botName && (
        <div className="flex items-center gap-2 border-b border-border bg-surface px-4 py-2 text-[12px] text-ink-3">
          <Bot className="h-[14px] w-[14px]" /> {botName}
        </div>
      )}
      <div className="max-h-[52vh] overflow-y-auto bg-surface-2">
        <ChatThread messages={messages} />
      </div>
      <ChatComposer
        conversationId={conversationId}
        candidateId={candidateId}
        botName={botName}
        onSent={load}
      />
    </div>
  );
}
