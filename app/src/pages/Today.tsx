import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, CalendarPlus, Check, MessageSquare, Phone, Sparkles,
} from "lucide-react";
import * as api from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/hooks/useAuth";
import { Button, Card, Skeleton, Tag } from "@/components/ui";
import { PageHeader, SlaIndicator, StageChip } from "@/components/app/primitives";
import type { Application, PipelineStage } from "@/lib/types";
import { cn, initials } from "@/lib/utils";

/**
 * Мой день.
 *
 * Воронка отвечает на вопрос «как дела у вакансии». Утром у HR вопрос
 * другой: «что мне делать прямо сейчас». Поэтому экран собран не по
 * сущностям, а по действиям — ответить, решить, позвонить, назначить.
 *
 * Порядок групп — порядок срочности, а не удобства разработчика: сверху
 * то, где мы уже опаздываем, ниже то, что можно сделать до обеда.
 */
interface Task {
  id: string;
  name: string;
  subtitle: string;
  applicationId?: string;
  phone?: string;
  stage?: PipelineStage | null;
  sla?: string | null;
  since?: string;
  note?: string;
}

interface Group {
  key: string;
  title: string;
  hint: string;
  icon: typeof Check;
  tone: "crit" | "warn" | "info" | "good";
  tasks: Task[];
  action?: { label: string; to: string };
}

export default function Today() {
  const { profile } = useAuth();
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());

  const applications = useAsync(() => api.listApplications(), []);
  const stages = useAsync(() => api.listStages(), []);
  const conversations = useAsync(() => api.listConversations(), []);
  const candidates = useAsync(() => api.listCandidates(), []);
  const slots = useAsync(() => api.listSlots(), []);

  const loading =
    applications.loading || stages.loading || conversations.loading || candidates.loading;

  const groups: Group[] = useMemo(() => {
    const apps = (applications.data ?? []).filter((a) => a.status === "active");
    const st = stages.data ?? [];
    const convs = conversations.data ?? [];
    const cands = candidates.data ?? [];
    const allSlots = slots.data ?? [];
    const stageOf = (a: Application) => st.find((s) => s.id === a.stage_id) ?? null;
    const phoneOf = (id: string) => cands.find((c) => c.id === id)?.phones[0];
    const now = Date.now();

    // 1. Ответить: кандидат написал и ждёт
    const answer: Task[] = convs
      .filter((c) => c.unread_for_staff > 0)
      .sort((a, b) => (b.unread_for_staff ?? 0) - (a.unread_for_staff ?? 0))
      .slice(0, 6)
      .map((c) => ({
        id: `msg-${c.id}`,
        name: c.candidate_name,
        subtitle: c.vacancy_title ?? "Без вакансии",
        applicationId: c.application_id ?? undefined,
        note: `${c.unread_for_staff} непрочитанных`,
      }));

    // 2. Решить: срок вышел. Тишина — это ошибка, а не отсутствие событий
    const overdue: Task[] = apps
      .filter((a) => a.sla_due_at && new Date(a.sla_due_at).getTime() < now)
      .sort((a, b) => (a.sla_due_at ?? "").localeCompare(b.sla_due_at ?? ""))
      .slice(0, 6)
      .map((a) => ({
        id: `sla-${a.id}`,
        name: a.candidate_name,
        subtitle: a.vacancy_title,
        applicationId: a.id,
        stage: stageOf(a),
        sla: a.sla_due_at,
        since: a.stage_entered_at,
      }));

    // 3. Обзвонить: новые отклики, с которыми ещё никто не говорил
    const toCall: Task[] = apps
      .filter((a) => stageOf(a)?.code === "new")
      .filter((a) => !convs.some((c) => c.candidate_id === a.candidate_id))
      .slice(0, 8)
      .map((a) => ({
        id: `call-${a.id}`,
        name: a.candidate_name,
        subtitle: `${a.vacancy_title} · ${a.subtitle ?? ""}`.trim(),
        applicationId: a.id,
        phone: phoneOf(a.candidate_id),
        stage: stageOf(a),
      }));

    // 4. Назначить встречу: дошёл до этапа, где нужна встреча, а слот не занят
    const needMeeting: Task[] = apps
      .filter((a) => ["interview", "practical"].includes(stageOf(a)?.code ?? ""))
      .filter((a) => !allSlots.some((s) => s.booked_by_application_id === a.id))
      .slice(0, 6)
      .map((a) => ({
        id: `meet-${a.id}`,
        name: a.candidate_name,
        subtitle: a.vacancy_title,
        applicationId: a.id,
        stage: stageOf(a),
        sla: a.sla_due_at,
      }));

    const all: Group[] = [
      {
        key: "overdue",
        title: "Срок вышел",
        hint: "Кандидат уходит к тому, кто ответил первым. Это первое, что стоит закрыть.",
        icon: AlertTriangle,
        tone: "crit",
        tasks: overdue,
        action: { label: "Все просрочки", to: "/pipeline" },
      },
      {
        key: "answer",
        title: "Ответить",
        hint: "Написали и ждут. Каждый час молчания — это минус к отклику на следующем этапе.",
        icon: MessageSquare,
        tone: "warn",
        tasks: answer,
        action: { label: "Вся переписка", to: "/inbox" },
      },
      {
        key: "call",
        title: "Обзвонить новых",
        hint: "Пришли, но разговора ещё не было. Звонок на первом дне даёт больше, чем три письма на третьем.",
        icon: Phone,
        tone: "info",
        tasks: toCall,
        action: { label: "Открыть обзвон", to: "/people" },
      },
      {
        key: "meet",
        title: "Назначить встречу",
        hint: "Дошли до этапа, где нужна встреча, а время не выбрано. Откройте окна — кандидат запишется сам.",
        icon: CalendarPlus,
        tone: "info",
        tasks: needMeeting,
        action: { label: "Календарь", to: "/calendar" },
      },
    ];
    return all.filter((g) => g.tasks.length > 0);
  }, [applications.data, stages.data, conversations.data, candidates.data, slots.data]);

  const totalTasks = groups.reduce((n, g) => n + g.tasks.length, 0);
  const left = totalTasks - doneIds.size;

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="Утро" title="Мой день" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={profile?.full_name}
        title="Мой день"
        description={
          left > 0
            ? `${left} ${left === 1 ? "дело" : left < 5 ? "дела" : "дел"} — сверху то, где мы уже опаздываем. Всё остальное подождёт до обеда.`
            : "На сегодня всё закрыто. Можно заняться архивом или подготовить вакансии к следующей неделе."
        }
      />

      {groups.length === 0 ? (
        <Card className="max-w-[520px]">
          <b className="mb-1 block font-display text-[17px] font-semibold">Всё разобрано</b>
          <p className="m-0 mb-4 text-[13.5px] text-ink-2">
            Ни просрочек, ни неотвеченных сообщений. Хорошее время поднять базу:
            система подберёт людей под открытые вакансии из тех, кто уже проходил отбор.
          </p>
          <Link to="/archive">
            <Button size="sm">Подобрать из базы</Button>
          </Link>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <GroupCard
              key={g.key}
              group={g}
              doneIds={doneIds}
              onDone={(id) => setDoneIds((s) => new Set(s).add(id))}
            />
          ))}
        </div>
      )}
    </>
  );
}

const TONE_BORDER = {
  crit: "border-l-crit",
  warn: "border-l-warn",
  info: "border-l-[hsl(var(--stage-3))]",
  good: "border-l-good",
};
const TONE_TEXT = {
  crit: "text-crit",
  warn: "text-warn",
  info: "text-primary",
  good: "text-good",
};

function GroupCard({
  group, doneIds, onDone,
}: {
  group: Group;
  doneIds: Set<string>;
  onDone: (id: string) => void;
}) {
  const Icon = group.icon;
  const rest = group.tasks.filter((t) => !doneIds.has(t.id));

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 flex items-center gap-2 font-display text-[20px] font-semibold tracking-[-0.01em]">
          <Icon className={cn("h-[18px] w-[18px]", TONE_TEXT[group.tone])} />
          {group.title}
          <span className="font-sans text-[14px] font-normal text-ink-3">{rest.length}</span>
        </h2>
        {group.action && (
          <Link to={group.action.to} className="text-[13px]">
            {group.action.label}
          </Link>
        )}
      </div>
      <p className="mb-3 max-w-[70ch] text-[13px] text-ink-2">{group.hint}</p>

      {rest.length === 0 ? (
        <Card className="border-l-[3px] border-l-good p-4">
          <p className="m-0 text-[13.5px] text-ink-2">Здесь всё закрыто.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {rest.map((t) => (
            <Card
              key={t.id}
              className={cn("flex flex-wrap items-center justify-between gap-3 border-l-[3px] p-4", TONE_BORDER[group.tone])}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden="true"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-primary-soft text-[11px] font-bold text-primary"
                >
                  {initials(t.name)}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold">
                    {t.applicationId ? (
                      <Link to={`/applications/${t.applicationId}`}>{t.name}</Link>
                    ) : (
                      t.name
                    )}
                  </div>
                  <div className="truncate text-[12.5px] text-ink-3">{t.subtitle}</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {t.stage && <StageChip stage={t.stage} />}
                {t.note && <Tag tone="warn">{t.note}</Tag>}
                {t.sla && <SlaIndicator dueAt={t.sla} startedAt={t.since} compact />}

                {t.phone && (
                  <a
                    href={`tel:${t.phone.replace(/[^\d+]/g, "")}`}
                    className="inline-flex items-center gap-2 rounded-md border border-border-strong bg-surface px-3 py-[7px] text-[13px] font-semibold text-ink no-underline hover:bg-surface-2 hover:no-underline"
                  >
                    <Phone className="h-4 w-4" /> Позвонить
                  </a>
                )}
                {group.key === "answer" && (
                  <Link to="/inbox">
                    <Button size="sm" variant="secondary">Ответить</Button>
                  </Link>
                )}
                {group.key === "meet" && (
                  <Link to="/calendar">
                    <Button size="sm" variant="secondary">Открыть окна</Button>
                  </Link>
                )}

                <button
                  onClick={() => onDone(t.id)}
                  title="Убрать из списка на сегодня"
                  className="grid h-8 w-8 place-items-center rounded-md text-ink-3 hover:bg-good-soft hover:text-good"
                >
                  <Check className="h-4 w-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

/** Подсказка про подбор из базы — на случай, если день пустой. */
export function ArchiveHint() {
  return (
    <Card className="flex items-start gap-3 border-l-[3px] border-l-primary">
      <Sparkles className="mt-[2px] h-5 w-5 shrink-0 text-primary" />
      <p className="m-0 text-[13.5px] text-ink-2">
        Когда текущих дел нет, самое полезное — поднять архив: люди оттуда уже
        проходили наш отбор, и закрытие из базы обходится дешевле публикации.
      </p>
    </Card>
  );
}
