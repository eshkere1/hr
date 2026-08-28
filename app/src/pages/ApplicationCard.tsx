import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Bot, Check, HelpCircle, Minus, X as XIcon, Sparkles,
} from "lucide-react";
import * as api from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/hooks/useAuth";
import {
  Avatar, Button, Card, Field, Modal, Select, Skeleton, Tabs, Tag, Textarea,
} from "@/components/ui";
import { CriteriaMeter, SlaIndicator, StageChip } from "@/components/app/primitives";
import { SOURCE_LABEL, type CriteriaResult, type CriterionResult } from "@/lib/types";
import { cn, dateRu, dateTimeRu, money } from "@/lib/utils";

const TABS = [
  { id: "profile", label: "Профиль" },
  { id: "chat", label: "Переписка" },
  { id: "assessment", label: "Тест и кейс" },
  { id: "calls", label: "Созвоны" },
  { id: "docs", label: "Документы" },
];

/**
 * Один экран на человека: кто он, что подтверждено, где он сейчас и что
 * от нас требуется. Вкладки идут в порядке работы HR, а не по алфавиту.
 */
export default function ApplicationCard() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { profile, can } = useAuth();
  const [tab, setTab] = useState("profile");
  const [rejectOpen, setRejectOpen] = useState(false);

  const application = useAsync(() => api.getApplication(id), [id]);
  const stages = useAsync(() => api.listStages(), []);
  const results = useAsync(() => api.listCriteriaResults(id), [id]);
  const candidate = useAsync(
    () => (application.data ? api.getCandidate(application.data.candidate_id) : Promise.resolve(null)),
    [application.data?.candidate_id],
  );

  const app = application.data;
  const stage = (stages.data ?? []).find((s) => s.id === app?.stage_id);
  const nextStage = (stages.data ?? []).find(
    (s) => s.order_index === (stage?.order_index ?? 0) + 1,
  );

  if (application.loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!app) {
    return (
      <Card>
        <p className="m-0 text-ink-2">
          Отклик не найден или у вас нет к нему доступа.{" "}
          <Link to="/pipeline">Вернуться к воронке</Link>
        </p>
      </Card>
    );
  }

  async function moveNext() {
    if (!nextStage) return;
    await api.moveApplication(app!.id, nextStage.id);
    application.reload();
  }

  return (
    <>
      <button
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-2 text-[13px] text-ink-3 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Назад
      </button>

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Левая колонка видна всегда: она отвечает на вопрос «кто это». */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="flex flex-col gap-[14px]">
            <div className="flex items-start gap-3">
              <Avatar name={app.candidate_name} size="lg" />
              <div className="min-w-0">
                <h1 className="m-0 font-display text-[19px] font-semibold leading-tight tracking-[-0.01em]">
                  {app.candidate_name}
                </h1>
                <div className="mt-1 text-[12.5px] text-ink-3">
                  {candidate.data?.teacher
                    ? `${candidate.data.teacher.subjects.join(", ")} · опыт ${candidate.data.teacher.total_experience_years} лет`
                    : app.subtitle}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {stage && <StageChip stage={stage} />}
              {app.status === "rejected" && <Tag tone="mute">Отказ</Tag>}
              {app.is_private && <Tag tone="info">Приватный отклик</Tag>}
              {candidate.data?.hide_from_current_employer && (
                <Tag tone="info">Скрыт от работодателя</Tag>
              )}
            </div>

            <CriteriaMeter met={app.criteria_met} total={app.criteria_total} />

            <div className="flex flex-col gap-2 border-t border-border pt-3 text-[12.5px]">
              <Row label="Вакансия">
                <Link to={`/vacancies/${app.vacancy_id}`}>{app.vacancy_title}</Link>
              </Row>
              <Row label="Откликнулся">{dateRu(app.applied_at)}</Row>
              <Row label="Город">{candidate.data?.city ?? "—"}</Row>
              {/* Ожидания по зарплате видит не каждый: у денег своя политика */}
              {can("hr_manager", "director", "dept_head", "superuser") && (
                <Row label="Ожидания">
                  <span className="font-mono">{money(app.expected_salary)}</span>
                </Row>
              )}
              <Row label="Срок ответа">
                <SlaIndicator dueAt={app.sla_due_at} startedAt={app.stage_entered_at} compact />
              </Row>
            </div>
          </Card>

          {/* Панель решения. Один экран — одно решение. */}
          {app.status === "active" && can("hr_manager", "director", "dept_head", "superuser") && (
            <Card className="flex flex-col gap-2">
              {nextStage && (
                <Button onClick={moveNext}>Двинуть на «{nextStage.name}»</Button>
              )}
              <Button variant="secondary" onClick={() => setRejectOpen(true)}>
                Отказать
              </Button>
            </Card>
          )}
        </aside>

        <div>
          <Tabs tabs={TABS} value={tab} onChange={setTab} />
          <div className="pt-5">
            {tab === "profile" && (
              <ProfileTab
                results={results.data ?? []}
                loading={results.loading}
                onConfirm={async (rid) => {
                  await api.confirmCriterion(rid, profile?.full_name ?? "—");
                  results.reload();
                }}
                applicationId={app.id}
              />
            )}
            {tab === "chat" && <ChatTab candidateId={app.candidate_id} />}
            {tab === "assessment" && <AssessmentTab applicationId={app.id} />}
            {tab === "calls" && <CallsTab applicationId={app.id} />}
            {tab === "docs" && <DocsTab candidateId={app.candidate_id} />}
          </div>
        </div>
      </div>

      <RejectModal
        open={rejectOpen}
        candidateName={app.candidate_name}
        onClose={() => setRejectOpen(false)}
        onDone={async (reasonId, note) => {
          await api.rejectApplication(app.id, reasonId, note);
          setRejectOpen(false);
          application.reload();
        }}
      />
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-ink-3">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Профиль: критерии с основаниями. Главный блок всего экрана.
// ---------------------------------------------------------------------------
const RESULT_VIEW: Record<
  CriterionResult,
  { label: string; icon: typeof Check; className: string }
> = {
  met: { label: "Закрыт", icon: Check, className: "text-good bg-good-soft" },
  partial: { label: "Частично", icon: Minus, className: "text-warn bg-warn-soft" },
  not_met: { label: "Не закрыт", icon: XIcon, className: "text-crit bg-crit-soft" },
  unknown: { label: "Не проверялся", icon: HelpCircle, className: "text-ink-3 bg-surface-2" },
};

function ProfileTab({
  results, loading, onConfirm, applicationId,
}: {
  results: CriteriaResult[];
  loading: boolean;
  onConfirm: (resultId: string) => Promise<void>;
  applicationId: string;
}) {
  const notes = useAsync(() => api.listNotes(applicationId), [applicationId]);
  const opinions = useAsync(() => api.listTeamOpinions(applicationId), [applicationId]);

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-1 font-display text-[19px] font-semibold tracking-[-0.01em]">
          Критерии вакансии
        </h2>
        <p className="mb-4 max-w-[64ch] text-[13.5px] text-ink-2">
          Не балл, а перечень: что закрыто и чем подтверждено. Балл без основания
          не защитит решение перед руководителем.
        </p>

        {results.length === 0 ? (
          <Card>
            <p className="m-0 text-[13.5px] text-ink-2">
              Разбор ещё не делался. Он запускается сам, как только к отклику
              прикрепится резюме.
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {results.map((r) => {
              const view = RESULT_VIEW[r.result];
              const Icon = view.icon;
              return (
                <Card key={r.id} className="flex flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-[10px]">
                      <span
                        className={cn(
                          "mt-[1px] grid h-6 w-6 shrink-0 place-items-center rounded-sm",
                          view.className,
                        )}
                        title={view.label}
                      >
                        <Icon className="h-[14px] w-[14px]" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold leading-snug">{r.criterion_name}</div>
                        <div className="mt-[2px] text-[12px] text-ink-3">
                          {view.label} · источник: {SOURCE_LABEL[r.source]}
                        </div>
                      </div>
                    </div>

                    {r.is_ai && !r.confirmed_by && (
                      <Button size="sm" variant="secondary" onClick={() => onConfirm(r.id)}>
                        <Check className="h-[14px] w-[14px]" /> Подтвердить
                      </Button>
                    )}
                  </div>

                  {r.evidence && (
                    <p className="m-0 border-l-2 border-border-strong pl-3 text-[13px] text-ink-2">
                      {r.evidence}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-ink-3">
                    {r.is_ai && (
                      <span className="inline-flex items-center gap-1">
                        <Sparkles className="h-3 w-3" /> разобрал ассистент
                      </span>
                    )}
                    {r.confirmed_by && (
                      <span className="inline-flex items-center gap-1 text-good">
                        <Check className="h-3 w-3" /> подтвердил {r.confirmed_by}
                      </span>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {(opinions.data?.length ?? 0) > 0 && (
        <section>
          <h3 className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
            Мнение команды
          </h3>
          <div className="flex flex-col gap-2">
            {(opinions.data ?? []).map((o) => (
              <Card key={o.id} className="flex items-start gap-3 p-4">
                <Avatar name={o.author_name} size="sm" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <b className="text-[13.5px]">{o.author_name}</b>
                    <Tag tone={o.verdict === "yes" ? "good" : o.verdict === "no" ? "crit" : "warn"}>
                      {o.verdict === "yes" ? "За" : o.verdict === "no" ? "Против" : "Сомневаюсь"}
                    </Tag>
                  </div>
                  {o.comment && <p className="m-0 mt-1 text-[13px] text-ink-2">{o.comment}</p>}
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {(notes.data?.length ?? 0) > 0 && (
        <section>
          <h3 className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
            Заметки команды найма
          </h3>
          <div className="flex flex-col gap-2">
            {(notes.data ?? []).map((n) => (
              <Card key={n.id} className="p-4">
                <div className="mb-1 flex items-center gap-2 text-[12px] text-ink-3">
                  {n.is_ai && <Bot className="h-[13px] w-[13px]" />}
                  <b className="font-medium text-ink-2">{n.author_name}</b>
                  <span>· {dateRu(n.created_at)}</span>
                </div>
                <p className="m-0 text-[13.5px] text-ink-2">{n.body}</p>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Переписка
// ---------------------------------------------------------------------------
function ChatTab({ candidateId }: { candidateId: string }) {
  const conversations = useAsync(() => api.listConversations(), []);
  const cv = (conversations.data ?? []).find((c) => c.candidate_id === candidateId);
  const messages = useAsync(
    () => (cv ? api.listMessages(cv.id) : Promise.resolve([])),
    [cv?.id],
  );

  if (conversations.loading) return <Skeleton className="h-64 w-full" />;
  if (!cv) {
    return (
      <Card>
        <p className="m-0 text-[13.5px] text-ink-2">
          Переписки ещё нет. Она начнётся, как только кандидат напишет боту.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex max-w-[560px] flex-col gap-[9px] rounded-lg border border-border bg-surface-2 p-4">
      {(messages.data ?? []).map((m) => (
        <Bubble key={m.id} message={m} />
      ))}
    </div>
  );
}

/**
 * Три вида пузырей. Сообщение ассистента помечено пунктиром и подписью:
 * человек всегда должен понимать, с кем говорит.
 */
function Bubble({ message }: { message: { author_kind: string; body: string; sent_at: string; author_name: string | null } }) {
  const isAi = message.author_kind === "ai_assistant";
  const isOut = message.author_kind !== "candidate";

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
      {message.body}
      <time className={cn("mt-1 block font-mono text-[10.5px]", isOut && !isAi ? "text-primary-soft" : "text-ink-3")}>
        {isAi ? "ассистент · " : message.author_name ? `${message.author_name} · ` : ""}
        {dateTimeRu(message.sent_at)}
      </time>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Тест и кейс
// ---------------------------------------------------------------------------
function AssessmentTab({ applicationId }: { applicationId: string }) {
  const items = useAsync(() => api.listAssessments(applicationId), [applicationId]);
  if (items.loading) return <Skeleton className="h-48 w-full" />;
  if ((items.data ?? []).length === 0) {
    return (
      <Card>
        <p className="m-0 text-[13.5px] text-ink-2">
          Заданий пока нет. Они выдаются сами при переходе на этап «Тест и кейс».
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {(items.data ?? []).map((a) => (
        <Card key={a.id} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <b className="font-display text-[16px] font-semibold">{a.template_name}</b>
            {a.verdict ? (
              <Tag tone={a.verdict === "strong" ? "good" : a.verdict === "ok" ? "info" : "warn"}>
                {a.verdict === "strong" ? "Сильно" : a.verdict === "ok" ? "Проходной" : "Слабо"}
              </Tag>
            ) : (
              <Tag tone="mute">Ждём ответа</Tag>
            )}
          </div>

          {a.feedback_internal && (
            <div>
              <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
                Обоснование для нас
              </div>
              <p className="m-0 text-[13.5px] text-ink-2">{a.feedback_internal}</p>
            </div>
          )}

          {a.feedback_for_candidate && (
            <div className="rounded-md border border-dashed border-primary bg-primary-soft p-3">
              <div className="mb-1 flex items-center gap-[6px] text-[11.5px] font-semibold uppercase tracking-[0.1em] text-primary">
                <Sparkles className="h-3 w-3" /> Обратная связь кандидату
              </div>
              <p className="m-0 text-[13.5px] text-ink-2">{a.feedback_for_candidate}</p>
              <Button size="sm" className="mt-3">Отправить в Телеграм</Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Созвоны
// ---------------------------------------------------------------------------
function CallsTab({ applicationId }: { applicationId: string }) {
  const items = useAsync(() => api.listInterviews(applicationId), [applicationId]);
  if (items.loading) return <Skeleton className="h-48 w-full" />;
  if ((items.data ?? []).length === 0) {
    return (
      <Card>
        <p className="m-0 text-[13.5px] text-ink-2">Созвонов ещё не было.</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {(items.data ?? []).map((i) => (
        <Card key={i.id} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <b className="font-display text-[16px] font-semibold">
                {i.kind === "demo_lesson" ? "Демо-урок" : "Интервью"}
              </b>
              <div className="mt-[2px] text-[12.5px] text-ink-3">
                {dateTimeRu(i.scheduled_at)} · {i.work_format === "online" ? "онлайн" : "очно"}
              </div>
            </div>
            <Tag tone={i.status === "done" ? "good" : "info"}>
              {i.status === "done" ? "Прошло" : "Назначено"}
            </Tag>
          </div>

          {!i.recording_consent && i.status === "done" && (
            <Tag tone="crit">
              Согласие на запись не получено — разбор собран из заметок вручную
            </Tag>
          )}

          {i.ai_summary && (
            <div>
              <div className="mb-1 flex items-center gap-[6px] text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
                <Sparkles className="h-3 w-3" /> О чём говорили
              </div>
              <p className="m-0 text-[13.5px] text-ink-2">{i.ai_summary}</p>
            </div>
          )}

          {i.ai_conclusions && (
            <div>
              <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
                Выводы по критериям
              </div>
              <p className="m-0 text-[13.5px] text-ink-2">{i.ai_conclusions}</p>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Документы. Ниша: без допуска педагога не пустят к детям.
// ---------------------------------------------------------------------------
const DOC_STATE_VIEW = {
  valid: { tone: "good" as const, label: "В порядке" },
  expiring: { tone: "warn" as const, label: "Истекает" },
  expired: { tone: "crit" as const, label: "Просрочен" },
  missing: { tone: "mute" as const, label: "Нет" },
  pending: { tone: "info" as const, label: "На проверке" },
  rejected: { tone: "crit" as const, label: "Отклонён" },
};

function DocsTab({ candidateId }: { candidateId: string }) {
  const docs = useAsync(() => api.listDocuments(candidateId), [candidateId]);
  if (docs.loading) return <Skeleton className="h-40 w-full" />;

  const list = docs.data ?? [];
  if (list.length === 0) {
    return (
      <Card>
        <p className="m-0 text-[13.5px] text-ink-2">
          Документы ещё не загружены. Кандидат может прислать их прямо в чат бота.
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3">
      {list.map((d) => {
        const view = DOC_STATE_VIEW[d.state];
        return (
          <div
            key={d.id}
            className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 last:border-0 last:pb-0"
          >
            <div>
              <div className="text-[13.5px] font-medium">
                {
                  {
                    criminal_record: "Справка об отсутствии судимости",
                    medical_book: "Медкнижка",
                    diploma: "Диплом",
                    qualification: "Категория",
                    passport: "Паспорт",
                    snils: "СНИЛС",
                    inn: "ИНН",
                    other: "Другое",
                  }[d.kind]
                }
              </div>
              {d.expires_on && (
                <div className="font-mono text-[11.5px] text-ink-3">до {dateRu(d.expires_on)}</div>
              )}
            </div>
            <Tag tone={view.tone}>{view.label}</Tag>
          </div>
        );
      })}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Отказ. Причина обязательна и берётся из справочника: без неё архив
// превращается в свалку, а кандидат остаётся без внятного ответа.
// ---------------------------------------------------------------------------
function RejectModal({
  open, candidateName, onClose, onDone,
}: {
  open: boolean;
  candidateName: string;
  onClose: () => void;
  onDone: (reasonId: string, note: string) => Promise<void>;
}) {
  const reasons = useAsync(() => api.listRejectionReasons(), []);
  const [reasonId, setReasonId] = useState("");
  const [wording, setWording] = useState("");
  const [busy, setBusy] = useState(false);

  const reason = (reasons.data ?? []).find((r) => r.id === reasonId);

  function pick(id: string) {
    setReasonId(id);
    const r = (reasons.data ?? []).find((x) => x.id === id);
    setWording(r?.candidate_wording ?? "");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Отказ · ${candidateName}`}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Отмена
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={!reasonId || busy}
            onClick={async () => {
              setBusy(true);
              await onDone(reasonId, wording);
              setBusy(false);
            }}
          >
            Отказать и отправить ответ
          </Button>
        </>
      }
    >
      <p className="m-0 text-sm text-ink-2">
        Причина обязательна: по ней архив делится на сегменты, и по ней же
        человека можно вернуть, когда откроется подходящая вакансия.
      </p>

      <Field label="Причина отказа" htmlFor="reason">
        <Select id="reason" value={reasonId} onChange={(e) => pick(e.target.value)}>
          <option value="">Выберите причину</option>
          {(reasons.data ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </Field>

      {reason && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
            <Tag tone={reason.segment === "stop_list" ? "crit" : "info"}>
              {
                {
                  not_now: "Не сейчас",
                  not_our_profile: "Не наш профиль",
                  not_ready: "Не готов",
                  stop_list: "Стоп-лист",
                }[reason.segment]
              }
            </Tag>
            {reason.reactivate_after_months && (
              <span>вернуться через {reason.reactivate_after_months} мес.</span>
            )}
          </div>

          <Field
            label="Что увидит кандидат"
            hint="Текст подставлен из справочника. Поправьте, если по этому человеку есть что добавить."
            htmlFor="wording"
          >
            <Textarea id="wording" value={wording} onChange={(e) => setWording(e.target.value)} />
          </Field>
        </>
      )}
    </Modal>
  );
}
