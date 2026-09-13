import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Bot, Check, HelpCircle, Minus, X as XIcon, Sparkles,
  AlertTriangle, Ban, BellRing,
} from "lucide-react";
import * as api from "@/lib/api";
import { CandidateChat } from "@/components/app/Chat";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/hooks/useAuth";
import {
  Avatar, Button, Card, Field, Modal, Select, Skeleton, Tabs, Tag, Textarea,
} from "@/components/ui";
import { CriteriaMeter, SlaIndicator, StageChip } from "@/components/app/primitives";
import { SelfBooking } from "./Calendar";
import { CHECK_ASPECTS, DOCUMENT_LABEL, type DocumentKind } from "@/lib/types";
import { SOURCE_LABEL, type CriteriaResult, type CriterionResult } from "@/lib/types";
import { cn, dateRu, dateTimeRu, money } from "@/lib/utils";
import { isDemoMode } from "@/lib/supabase";

const TABS = [
  { id: "profile", label: "Профиль" },
  { id: "chat", label: "Переписка" },
  { id: "assessment", label: "Тест и кейс" },
  { id: "calls", label: "Созвоны" },
  { id: "practical", label: "Практическая проверка" },
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
  const [blockOpen, setBlockOpen] = useState(false);
  const [notice, setNotice] = useState<{ tone: "good" | "warn" | "crit"; text: string } | null>(null);

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

  /**
   * Перевод на следующий этап.
   *
   * Здесь два правила ниши, а не просто смена статуса:
   * без действующего допуска к детям на оффер двигать нельзя (фишка 50),
   * а при переходе задание выдаётся само (фишка 10) — «тестовое приходится
   * отправлять вручную» было отдельной болью HR.
   */
  async function moveNext() {
    if (!nextStage || !app) return;

    if (nextStage.code === "offer") {
      const admission = await api.checkAdmission(app.candidate_id, app.vacancy_id);
      if (!admission.ok) {
        setNotice({
          tone: "crit",
          text: `Нельзя двинуть на оффер: не закрыты обязательные для этой вакансии документы — ${admission.missing.join(", ")}. Их оформление занимает недели, поэтому запрашивать надо сейчас, а не в день выхода.`,
        });
        return;
      }
    }

    await api.moveApplication(app.id, nextStage.id);
    const done = await api.runStageAutoActions(app.id, nextStage.id);
    setNotice({
      tone: "good",
      text: done.length
        ? `Этап «${nextStage.name}». ${done.join(". ")} — отправлять вручную не нужно.`
        : `Этап «${nextStage.name}».`,
    });
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
                  {candidate.data?.profile
                    ? `${candidate.data.profile.specialization} · опыт ${candidate.data.profile.total_experience_years} лет`
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
              {/* Дожим руководителя, а не только кандидата (фишка 40) */}
              <Button
                variant="ghost"
                onClick={async () => {
                  const msg = await api.nudgeResponsible(app.id);
                  setNotice({ tone: "warn", text: msg });
                }}
              >
                <BellRing className="h-4 w-4" /> Напомнить о решении
              </Button>
              <Button variant="ghost" className="text-crit" onClick={() => setBlockOpen(true)}>
                <Ban className="h-4 w-4" /> В стоп-лист
              </Button>
            </Card>
          )}

          {notice && (
            <Card
              className={cn(
                "border-l-[3px] p-4",
                notice.tone === "good" && "border-l-good",
                notice.tone === "warn" && "border-l-warn",
                notice.tone === "crit" && "border-l-crit",
              )}
            >
              <div className="flex items-start gap-2">
                {notice.tone === "crit" ? (
                  <AlertTriangle className="mt-[2px] h-4 w-4 shrink-0 text-crit" />
                ) : (
                  <Check className="mt-[2px] h-4 w-4 shrink-0 text-good" />
                )}
                <p className="m-0 text-[13px] text-ink-2">{notice.text}</p>
              </div>
              <button
                onClick={() => setNotice(null)}
                className="mt-2 text-[12px] text-ink-3 hover:text-ink"
              >
                Понятно
              </button>
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
            {tab === "chat" && <CandidateChat candidateId={app.candidate_id} />}
            {tab === "assessment" && <AssessmentTab applicationId={app.id} />}
            {tab === "calls" && (
              <CallsTab applicationId={app.id} vacancyId={app.vacancy_id} />
            )}
            {tab === "practical" && <PracticalTab applicationId={app.id} />}
            {tab === "docs" && <DocsTab candidateId={app.candidate_id} />}
          </div>
        </div>
      </div>

      <BlacklistModal
        open={blockOpen}
        candidateName={app.candidate_name}
        onClose={() => setBlockOpen(false)}
        onDone={async (reason) => {
          await api.setBlacklist(app.candidate_id, true, reason);
          await api.rejectApplication(app.id, "r12", reason);
          setBlockOpen(false);
          application.reload();
          setNotice({
            tone: "crit",
            text: "Кандидат в стоп-листе. При новом отклике система предупредит HR сама и остановит отклик до проверки.",
          });
        }}
      />

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

      <TeamOpinionForm applicationId={applicationId} onSaved={() => opinions.reload()} />

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
function CallsTab({
  applicationId,
  vacancyId,
}: {
  applicationId: string;
  vacancyId: string;
}) {
  const items = useAsync(() => api.listInterviews(applicationId), [applicationId]);
  if (items.loading) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="flex flex-col gap-3">
      {/* Самозапись: кандидат выбирает время сам, переписка о слотах не нужна */}
      <SelfBooking applicationId={applicationId} vacancyId={vacancyId} />

      {(items.data ?? []).length === 0 && (
        <Card>
          <p className="m-0 text-[13.5px] text-ink-2">
            Созвонов ещё не было. Как только встреча пройдёт, здесь появятся
            саммари и выводы по критериям вакансии.
          </p>
        </Card>
      )}
      {(items.data ?? []).map((i) => (
        <Card key={i.id} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <b className="font-display text-[16px] font-semibold">
                {i.kind === "practical_check" ? "Практическая проверка" : "Интервью"}
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
// Документы. Список обязательных задаётся в вакансии, а не в коде.
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
  const { can } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState("");

  // Право решает база, но показывать кнопку, которая заведомо ответит
  // отказом, незачем: руководитель вакансии документы читает, а собирает их
  // кадровик.
  const mayEdit = can("hr_manager", "superuser");

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не получилось");
    } finally {
      setBusy(null);
      docs.reload();
    }
  }

  async function open(path: string) {
    setError(null);
    try {
      window.open(await api.documentFileUrl(path), "_blank", "noopener");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Файл не открылся");
    }
  }

  if (docs.loading) return <Skeleton className="h-40 w-full" />;

  const list = docs.data ?? [];
  const missingKinds = (Object.keys(DOCUMENT_LABEL) as DocumentKind[])
    .filter((k) => !list.some((d) => d.kind === k));

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p className="m-0 rounded-md border border-crit-soft bg-crit-soft px-[10px] py-2 text-[12.5px] text-crit">
          {error}
        </p>
      )}

      {isDemoMode && (
        <Card className="border-l-[3px] border-l-warn">
          <p className="m-0 text-[13.5px] text-ink-2">
            Демо-режим: файлы показываются как отметки. Хранилище живёт в базе,
            здесь его нет.
          </p>
        </Card>
      )}

      {list.length === 0 ? (
        <Card>
          <p className="m-0 text-[13.5px] text-ink-2">
            Документов пока нет. Кандидат может прислать их прямо в чат бота,
            а кадровик — добавить сюда файлом. Какие из них обязательны,
            задаётся в вакансии.
          </p>
        </Card>
      ) : (
        <Card className="flex flex-col gap-3">
          {list.map((d) => {
            const view = DOC_STATE_VIEW[d.state];
            const hasFile = Boolean(d.storage_path);
            return (
              <div
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="text-[13.5px] font-medium">{DOCUMENT_LABEL[d.kind]}</div>
                  {hasFile ? (
                    <div className="truncate text-[11.5px] text-ink-3">
                      {d.file_name}
                      {d.file_size ? ` · ${Math.max(1, Math.round(d.file_size / 1024))} КБ` : ""}
                    </div>
                  ) : (
                    <div className="text-[11.5px] text-ink-3">файла нет</div>
                  )}
                  {d.expires_on && (
                    <div className="font-mono text-[11.5px] text-ink-3">до {dateRu(d.expires_on)}</div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Tag tone={view.tone}>{view.label}</Tag>

                  {hasFile && (
                    <Button size="sm" variant="ghost" onClick={() => open(d.storage_path!)}>
                      Открыть
                    </Button>
                  )}

                  {mayEdit && d.state === "pending" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy === d.id}
                      onClick={() => run(d.id, () => api.verifyCandidateDocument(d.id))}
                    >
                      <Check className="h-4 w-4" /> Проверил
                    </Button>
                  )}

                  {mayEdit && (
                    <FilePick
                      label={hasFile ? "Заменить" : "Загрузить"}
                      busy={busy === d.id}
                      onPick={(file) =>
                        run(d.id, () => api.uploadCandidateDocument(candidateId, d.kind, file))
                      }
                    />
                  )}

                  {mayEdit && hasFile && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy === d.id}
                      onClick={() => run(d.id, () => api.removeCandidateDocumentFile(d.id, d.storage_path!))}
                    >
                      <XIcon className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {mayEdit && missingKinds.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Добавить документ" className="max-w-[280px]">
            <Select value={adding} onChange={(e) => setAdding(e.target.value)}>
              <option value="">Выберите вид</option>
              {missingKinds.map((k) => (
                <option key={k} value={k}>{DOCUMENT_LABEL[k]}</option>
              ))}
            </Select>
          </Field>
          <Button
            size="sm"
            disabled={!adding || busy === "add"}
            onClick={() => run("add", async () => {
              await api.addCandidateDocument(candidateId, adding as DocumentKind);
              setAdding("");
            })}
          >
            Добавить
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Выбор файла кнопкой.
 *
 * Отдельным компонентом, потому что настоящий input[type=file] стилизовать
 * нельзя — его прячут и кликают по нему из обработчика кнопки.
 */
function FilePick({
  label, busy, onPick,
}: {
  label: string;
  busy: boolean;
  onPick: (file: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png,.heic,.webp,.doc,.docx,.rtf,.odt,.txt"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onPick(f);
        }}
      />
      <Button size="sm" variant="ghost" disabled={busy || isDemoMode} onClick={() => ref.current?.click()}>
        {busy ? "…" : label}
      </Button>
    </>
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

// ---------------------------------------------------------------------------
// Практическая проверка (фишка 51). Человек делает настоящую рабочую задачу,
// а не рассказывает о себе. Пять аспектов одинаковы для всех ролей, поэтому
// проверки сравнимы между собой.
// ---------------------------------------------------------------------------
const CHECK_RESULT_TONE: Record<CriterionResult, "good" | "warn" | "crit" | "mute"> = {
  met: "good",
  partial: "warn",
  not_met: "crit",
  unknown: "mute",
};

function PracticalTab({ applicationId }: { applicationId: string }) {
  const { profile } = useAuth();
  const checks = useAsync(() => api.listPracticalChecks(applicationId), [applicationId]);
  const [scoring, setScoring] = useState(false);
  const [draft, setDraft] = useState<Record<string, { result: CriterionResult; comment: string }>>(
    {},
  );
  const [verdict, setVerdict] = useState("strong");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  if (checks.loading) return <Skeleton className="h-48 w-full" />;

  const check = (checks.data ?? [])[0];
  if (!check) {
    return (
      <Card>
        <p className="m-0 text-[13.5px] text-ink-2">
          Практическая проверка не назначена. Она появится, когда отклик дойдёт
          до этого этапа — и это единственный шаг отбора, где видно, как человек
          работает, а не как он о себе рассказывает.
        </p>
      </Card>
    );
  }

  const done = check.scores.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <b className="font-display text-[17px] font-semibold">
              {check.task ?? "Задача не задана"}
            </b>
            <div className="mt-1 text-[12.5px] text-ink-3">
              {[check.context, check.audience, dateTimeRu(check.scheduled_at)]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
          {check.verdict ? (
            <Tag tone={check.verdict === "strong" ? "good" : "warn"}>
              {check.verdict === "strong" ? "Сильно" : "Есть вопросы"}
            </Tag>
          ) : (
            <Tag tone="info">Ждём проверки</Tag>
          )}
        </div>

        {check.comment && (
          <div>
            <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
              Вывод проверяющего · {check.reviewer_name}
            </div>
            <p className="m-0 text-[13.5px] text-ink-2">{check.comment}</p>
          </div>
        )}
      </Card>

      {done && (
        <Card className="flex flex-col gap-3">
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
            Оценочный лист
          </div>
          {check.scores.map((sc) => (
            <div
              key={sc.id}
              className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-3 last:border-0 last:pb-0"
            >
              <div className="min-w-0">
                <div className="text-[13.5px] font-medium">{sc.aspect}</div>
                {sc.comment && <p className="m-0 mt-1 text-[12.5px] text-ink-2">{sc.comment}</p>}
              </div>
              <Tag tone={CHECK_RESULT_TONE[sc.result]}>
                {sc.result === "met"
                  ? "Да"
                  : sc.result === "partial"
                    ? "Частично"
                    : sc.result === "not_met"
                      ? "Нет"
                      : "Не смотрели"}
              </Tag>
            </div>
          ))}
        </Card>
      )}

      {!done && !scoring && (
        <Button onClick={() => setScoring(true)}>Заполнить оценочный лист</Button>
      )}

      {scoring && (
        <Card className="flex flex-col gap-4">
          <p className="m-0 text-[13px] text-ink-2">
            Пять аспектов одинаковы для всех ролей: они про то, как человек
            работает. Предметную часть закрывают критерии вакансии — иначе
            сравнивать проверки между собой невозможно, и решение снова
            становится вопросом впечатления.
          </p>

          {CHECK_ASPECTS.map((aspect) => (
            <div key={aspect} className="flex flex-col gap-2 border-b border-border pb-3">
              <div className="text-[13.5px] font-medium">{aspect}</div>
              <div className="flex flex-wrap gap-2">
                {(["met", "partial", "not_met"] as CriterionResult[]).map((r) => (
                  <button
                    key={r}
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        [aspect]: { result: r, comment: d[aspect]?.comment ?? "" },
                      }))
                    }
                    className={cn(
                      "rounded-md border px-3 py-[6px] text-[12.5px] transition-colors",
                      draft[aspect]?.result === r
                        ? "border-primary bg-primary-soft font-semibold text-primary"
                        : "border-border bg-surface text-ink-2 hover:border-border-strong",
                    )}
                  >
                    {r === "met" ? "Да" : r === "partial" ? "Частично" : "Нет"}
                  </button>
                ))}
              </div>
              <Textarea
                placeholder="Что именно вы увидели — одна фраза"
                value={draft[aspect]?.comment ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    [aspect]: { result: d[aspect]?.result ?? "unknown", comment: e.target.value },
                  }))
                }
                className="min-h-[48px]"
              />
            </div>
          ))}

          <Field label="Общий вывод" htmlFor="verdict">
            <Select id="verdict" value={verdict} onChange={(e) => setVerdict(e.target.value)}>
              <option value="strong">Сильно — берём</option>
              <option value="ok">Нормально, но есть вопросы</option>
              <option value="weak">Слабо</option>
            </Select>
          </Field>

          <Field label="Комментарий проверяющего" htmlFor="mc">
            <Textarea id="mc" value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>

          <div className="flex gap-2">
            <Button
              disabled={busy || Object.keys(draft).length === 0}
              onClick={async () => {
                setBusy(true);
                await api.saveCheckScores(
                  check.id,
                  CHECK_ASPECTS.map((a) => ({
                    aspect: a,
                    result: draft[a]?.result ?? "unknown",
                    comment: draft[a]?.comment ?? "",
                  })),
                  profile?.full_name ?? "—",
                  verdict,
                  comment,
                );
                setBusy(false);
                setScoring(false);
                checks.reload();
              }}
            >
              Сохранить оценку
            </Button>
            <Button variant="secondary" onClick={() => setScoring(false)}>
              Отмена
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Стоп-лист (фишка 7). Явная сущность с причиной и датой, а не тег:
// при новом отклике система предупредит HR сама.
// ---------------------------------------------------------------------------
function BlacklistModal({
  open,
  candidateName,
  onClose,
  onDone,
}: {
  open: boolean;
  candidateName: string;
  onClose: () => void;
  onDone: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`В стоп-лист · ${candidateName}`}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Отмена
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={reason.trim().length < 5 || busy}
            onClick={async () => {
              setBusy(true);
              await onDone(reason.trim());
              setBusy(false);
            }}
          >
            В стоп-лист
          </Button>
        </>
      }
    >
      <p className="m-0 text-sm text-ink-2">
        {candidateName} больше не будет попадать в подбор, а при новом отклике
        система остановит его и предупредит HR. Причина сохранится в карточке
        и будет видна тому, кто столкнётся с этим человеком через год.
      </p>
      <Field
        label="Причина"
        htmlFor="bl-reason"
        hint="Обязательно и своими словами: через год «просто не подошёл» ничего не объяснит"
      >
        <Textarea id="bl-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Мнение команды о кандидате (фишка 38).
// «Мнение о кандидате никто не спрашивает» — боль сотрудников из таблицы.
// Три варианта вместо шкалы: «сомневаюсь» — это тоже ответ, и он полезнее
// натянутой четвёрки по пятибалльной шкале.
// ---------------------------------------------------------------------------
function TeamOpinionForm({
  applicationId,
  onSaved,
}: {
  applicationId: string;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [verdict, setVerdict] = useState<"yes" | "doubt" | "no" | null>(null);
  const [comment, setComment] = useState("");
  const [saved, setSaved] = useState(false);

  if (saved) {
    return (
      <Card className="border-l-[3px] border-l-good">
        <p className="m-0 text-[13.5px] text-ink-2">
          Мнение записано и видно всей команде найма. Кандидат его не увидит.
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <div className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
          Ваше мнение о кандидате
        </div>
        <p className="m-0 mt-1 text-[13px] text-ink-2">
          Если вы с ним пересекались или были на интервью — скажите. Это видно
          команде найма и не видно кандидату.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["yes", "За"],
            ["doubt", "Сомневаюсь"],
            ["no", "Против"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setVerdict(v)}
            className={cn(
              "rounded-md border px-4 py-2 text-[13px] transition-colors",
              verdict === v
                ? "border-primary bg-primary-soft font-semibold text-primary"
                : "border-border bg-surface text-ink-2 hover:border-border-strong",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <Textarea
        placeholder="Почему — одна-две фразы. Без этого «против» ничего не объясняет"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        className="min-h-[56px]"
      />

      <div>
        <Button
          size="sm"
          disabled={!verdict}
          onClick={async () => {
            if (!verdict) return;
            await api.addTeamOpinion(applicationId, verdict, comment, profile?.full_name ?? "—");
            setSaved(true);
            onSaved();
          }}
        >
          Записать мнение
        </Button>
      </div>
    </Card>
  );
}
