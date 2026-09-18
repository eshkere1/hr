import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Plus, Sparkles } from "lucide-react";
import * as api from "@/lib/api";
import { PublishBlock } from "@/pages/HeadHunter";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/hooks/useAuth";
import { Button, Field, Input, Modal, Select, Textarea } from "@/components/ui";
import {
  Card, Skeleton, Table, TableWrap, Tabs, Tag, Td, Th,
} from "@/components/ui";
import { EmptyState, PageHeader, StageChip } from "@/components/app/primitives";
import { Funnel } from "./Dashboard";
import {
  EMPLOYMENT_LABEL, GRADE_LABEL, PRIORITY_LABEL, VACANCY_STATUS_LABEL, WORK_FORMAT_LABEL,
  type EmploymentType, type GradeLevel, type VacancyInput,
  type VacancyPriority, type VacancyStatus, type WorkFormat,
} from "@/lib/types";
import { daysSince, daysWord, dateRu, money } from "@/lib/utils";
import { isDemoMode } from "@/lib/supabase";

const PRIORITY_TONE: Record<VacancyPriority, "crit" | "warn" | "info" | "mute"> = {
  critical: "crit", high: "warn", normal: "info", low: "mute",
};

const STATUS_TONE: Record<VacancyStatus, "good" | "warn" | "info" | "mute" | "crit"> = {
  published: "good", approved: "info", pending_approval: "warn", draft: "mute",
  on_hold: "warn", closed: "mute", cancelled: "crit",
};

// ---------------------------------------------------------------------------
// Список вакансий
// ---------------------------------------------------------------------------
export default function Vacancies() {
  const { can } = useAuth();
  const vacancies = useAsync(() => api.listVacancies(), []);
  const applications = useAsync(() => api.listApplications(), []);
  const [filter, setFilter] = useState("open");
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const all = vacancies.data ?? [];
  const list = all.filter((v) =>
    filter === "open"
      ? ["published", "approved"].includes(v.status)
      : filter === "approval"
        ? v.status === "pending_approval"
        : true,
  );

  const countFor = (vacancyId: string) =>
    (applications.data ?? []).filter((a) => a.vacancy_id === vacancyId && a.status === "active").length;

  return (
    <>
      <PageHeader
        eyebrow="Подбор"
        title={can("dept_head", "line_manager") ? "Мои вакансии" : "Вакансии"}
        description="Сколько дней открыта, сколько людей в работе и кто за неё отвечает."
        actions={
          can("hr_manager", "superuser") ? (
            <Button onClick={() => setCreating(true)} disabled={isDemoMode}>
              <Plus className="h-4 w-4" /> Открыть вакансию
            </Button>
          ) : undefined
        }
      />

      <NewVacancyModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false);
          vacancies.reload();
          navigate(`/vacancies/${id}`);
        }}
      />

      <div className="mb-5">
        <Tabs
          value={filter}
          onChange={setFilter}
          tabs={[
            { id: "open", label: "В работе", count: all.filter((v) => ["published", "approved"].includes(v.status)).length },
            { id: "approval", label: "На согласовании", count: all.filter((v) => v.status === "pending_approval").length },
            { id: "all", label: "Все", count: all.length },
          ]}
        />
      </div>

      {vacancies.loading ? (
        <Skeleton className="h-48 w-full" />
      ) : list.length === 0 ? (
        <EmptyState
          title="Вакансий в этом разделе нет"
          description={
            can("hr_manager", "superuser")
              ? "Нажмите «Открыть вакансию» — и подбор начнётся с неё: отклики, воронка, сроки ответа и публикация на hh считаются от вакансии."
              : "Здесь появятся вакансии, как только их согласуют и опубликуют."
          }
        />
      ) : (
        <TableWrap>
          <Table className="min-w-[860px]">
            <thead>
              <tr>
                <Th>Вакансия</Th>
                <Th>Подразделение</Th>
                <Th>Статус</Th>
                <Th>Приоритет</Th>
                <Th className="text-right">Открыта</Th>
                <Th className="text-right">В работе</Th>
                <Th>Ответственный HR</Th>
              </tr>
            </thead>
            <tbody>
              {list.map((v) => {
                const days = v.opened_at ? daysSince(v.opened_at) : null;
                return (
                  <tr key={v.id} className="hover:bg-surface-2">
                    <Td>
                      <Link to={`/vacancies/${v.id}`} className="font-medium">
                        {v.title}
                      </Link>
                      {v.specialization && (
                        <div className="text-xs text-ink-3">
                          {v.specialization}
                          {v.grade ? ` · ${GRADE_LABEL[v.grade]}` : ""}
                        </div>
                      )}
                    </Td>
                    <Td className="text-ink-2">{v.department_name}</Td>
                    <Td>
                      <Tag tone={STATUS_TONE[v.status]}>{VACANCY_STATUS_LABEL[v.status]}</Tag>
                    </Td>
                    <Td>
                      <Tag tone={PRIORITY_TONE[v.priority]}>{PRIORITY_LABEL[v.priority]}</Tag>
                    </Td>
                    <Td className="text-right font-mono tabular-nums">
                      {days === null ? "—" : `${days} ${daysWord(days)}`}
                    </Td>
                    <Td className="text-right font-mono tabular-nums">{countFor(v.id)}</Td>
                    <Td className="text-ink-2">{v.recruiter_name ?? "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Карточка вакансии
// ---------------------------------------------------------------------------
export function VacancyCard() {
  const { id = "" } = useParams();
  const [tab, setTab] = useState("profile");
  const vacancy = useAsync(() => api.getVacancy(id), [id]);
  const criteria = useAsync(() => api.listCriteria(id), [id]);
  const stages = useAsync(
    () => (vacancy.data ? api.listStages(vacancy.data.pipeline_id) : Promise.resolve([])),
    [vacancy.data?.pipeline_id],
  );
  const applications = useAsync(() => api.listApplications(id), [id]);

  const v = vacancy.data;
  if (vacancy.loading) return <Skeleton className="h-64 w-full" />;
  if (!v) {
    return (
      <Card>
        <p className="m-0 text-ink-2">
          Вакансия не найдена или у вас нет к ней доступа.{" "}
          <Link to="/vacancies">К списку вакансий</Link>
        </p>
      </Card>
    );
  }

  const days = v.opened_at ? daysSince(v.opened_at) : null;

  return (
    <>
      <PageHeader
        eyebrow={`${v.department_name} · ${v.city ?? ""}`}
        title={v.title}
        description={
          days !== null
            ? `Открыта ${days} ${daysWord(days)}. Цель — закрыть к ${dateRu(v.target_close_date)}.`
            : undefined
        }
        actions={
          <>
            <Tag tone={STATUS_TONE[v.status]}>{VACANCY_STATUS_LABEL[v.status]}</Tag>
            <Tag tone={PRIORITY_TONE[v.priority]}>{PRIORITY_LABEL[v.priority]}</Tag>
          </>
        }
      />

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "profile", label: "Профиль" },
          { id: "criteria", label: "Критерии", count: (criteria.data ?? []).length },
          { id: "questions", label: "Вопросы на интервью" },
          { id: "funnel", label: "Воронка" },
          { id: "approval", label: "Согласование" },
          { id: "publish", label: "Публикация" },
          { id: "versions", label: "Версии требований" },
        ]}
      />

      <div className="pt-5">
        {tab === "profile" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="flex flex-col gap-4">
              <Block title="Что делать">{v.description}</Block>
              {/* Честные условия: что реально будет в первый месяц */}
              <Block title="Что реально будет в первый месяц">{v.first_month_reality}</Block>
            </Card>

            <div className="flex flex-col gap-4">
              <Card className="flex flex-col gap-2 text-[13.5px]">
                <Info label="Нагрузка">
                  {v.weekly_hours ? `${v.weekly_hours} ч в неделю` : "—"}
                </Info>
                <Info label="Направление">{v.specialization ?? "—"}</Info>
                <Info label="Уровень">{v.grade ? GRADE_LABEL[v.grade] : "—"}</Info>
                <Info label="Заказчик">{v.hiring_manager_name ?? "—"}</Info>
                <Info label="Ответственный HR">{v.recruiter_name ?? "—"}</Info>
                <Info label="Нужно человек">
                  <span className="font-mono">{v.hired_count} из {v.headcount}</span>
                </Info>
              </Card>

              {/* Вилка приходит из отдельной таблицы со своей политикой.
                  Нет права — блока просто нет, без заглушки «нет доступа». */}
              {v.compensation && (
                <Card className="flex flex-col gap-2 text-[13.5px]">
                  <div className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
                    Вилка
                  </div>
                  <Info label="Утверждено">
                    <span className="font-mono">
                      {money(v.compensation.salary_min)} — {money(v.compensation.salary_max)}
                      {v.compensation.is_net ? " на руки" : ""}
                    </span>
                  </Info>
                  {v.compensation.market_p50 && (
                    <Info label="Рынок, медиана">
                      <span className="font-mono">{money(v.compensation.market_p50)}</span>
                    </Info>
                  )}
                </Card>
              )}
            </div>
          </div>
        )}

        {tab === "criteria" && (
          <div className="flex flex-col gap-2">
            <p className="mb-2 max-w-[64ch] text-[13.5px] text-ink-2">
              Пять-шесть критериев — по ним разбирается каждый отклик, и по ним же
              потом оценивают человека на испытательном сроке.
            </p>
            {(criteria.data ?? []).map((c) => (
              <Card key={c.id} className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold">{c.name}</div>
                  {c.description && (
                    <p className="m-0 mt-1 text-[13px] text-ink-2">{c.description}</p>
                  )}
                </div>
                {c.is_required && <Tag tone="info">Обязательный</Tag>}
              </Card>
            ))}
            {(criteria.data ?? []).length === 0 && (
              <EmptyState
                title="Критерии не заданы"
                description="Без них отклик не с чем сопоставить: разбор покажет «0 из 0», а решение снова будет «по ощущениям»."
              />
            )}
          </div>
        )}

        {tab === "questions" && <QuestionsTab vacancyId={v.id} />}
        {tab === "publish" && <PublishBlock vacancyId={v.id} />}
        {tab === "approval" && <ApprovalTab vacancyId={v.id} />}
        {tab === "versions" && <VersionsTab vacancyId={v.id} />}

        {tab === "funnel" && (
          <div className="flex flex-col gap-5">
            <Funnel vacancyId={v.id} />
            <div>
              <h3 className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
                Кто сейчас в работе
              </h3>
              <TableWrap>
                <Table className="min-w-[640px]">
                  <thead>
                    <tr>
                      <Th>Кандидат</Th>
                      <Th>Этап</Th>
                      <Th className="text-right">Критерии</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(applications.data ?? [])
                      .filter((a) => a.status === "active")
                      .map((a) => {
                        const st = (stages.data ?? []).find((s) => s.id === a.stage_id);
                        return (
                          <tr key={a.id} className="hover:bg-surface-2">
                            <Td>
                              <Link to={`/applications/${a.id}`}>{a.candidate_name}</Link>
                            </Td>
                            <Td>{st && <StageChip stage={st} />}</Td>
                            <Td className="text-right font-mono tabular-nums">
                              {a.criteria_met} из {a.criteria_total}
                            </Td>
                          </tr>
                        );
                      })}
                  </tbody>
                </Table>
              </TableWrap>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div>
      <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
        {title}
      </div>
      <p className="m-0 text-[13.5px] text-ink-2">{children}</p>
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-ink-3">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Согласование вакансии (фишка 26).
// Задача владельца дословно: «утвердить открытие вакансии, вилку и приоритет».
// Видно, кто и когда согласовал — это снимает вопрос «а мы это утверждали?».
// ---------------------------------------------------------------------------
function ApprovalTab({ vacancyId }: { vacancyId: string }) {
  const { can } = useAuth();
  const approvals = useAsync(() => api.listApprovals(vacancyId), [vacancyId]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  if (approvals.loading) return <Skeleton className="h-40 w-full" />;
  const list = approvals.data ?? [];

  if (list.length === 0) {
    return (
      <EmptyState
        title="Согласование не запрашивалось"
        description="Вакансия открыта без утверждения вилки. Это работает ровно до первого оффера выше бюджета."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {list.map((a) => (
        <Card key={a.id} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <b className="text-[14px]">{a.approver_name}</b>
              <div className="mt-[2px] text-[12.5px] text-ink-3">
                запрошено {dateRu(a.created_at)}
                {a.decided_at ? ` · решение ${dateRu(a.decided_at)}` : ""}
              </div>
            </div>
            <Tag
              tone={
                a.decision === "approved" ? "good" : a.decision === "rejected" ? "crit" : "warn"
              }
            >
              {a.decision === "approved"
                ? "Согласовано"
                : a.decision === "rejected"
                  ? "Отклонено"
                  : "Ждёт решения"}
            </Tag>
          </div>

          {a.comment && <p className="m-0 text-[13.5px] text-ink-2">{a.comment}</p>}

          {a.decision === "pending" && can("director", "superuser") && (
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <Textarea
                placeholder="Комментарий к решению — что именно утверждаете или что смущает"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="min-h-[56px]"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    await api.decideApproval(a.id, "approved", comment);
                    setBusy(false);
                    approvals.reload();
                  }}
                >
                  Согласовать
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    await api.decideApproval(a.id, "rejected", comment);
                    setBusy(false);
                    approvals.reload();
                  }}
                >
                  Вернуть на доработку
                </Button>
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Версии требований (фишка 27).
// «Требования меняются на ходу, работа обесценивается» — боль HR.
// Здесь видно, что именно поменялось, кто и когда.
// ---------------------------------------------------------------------------
function VersionsTab({ vacancyId }: { vacancyId: string }) {
  const versions = useAsync(() => api.listVersions(vacancyId), [vacancyId]);
  if (versions.loading) return <Skeleton className="h-40 w-full" />;
  const list = versions.data ?? [];

  if (list.length === 0) {
    return (
      <EmptyState
        title="Требования не менялись"
        description="Как только кто-то поправит критерии или вилку, здесь появится запись — что было, что стало и по чьей просьбе."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 max-w-[64ch] text-[13.5px] text-ink-2">
        Если требования поменяли посреди отбора, часть уже отсмотренных
        кандидатов оценивалась по другим правилам. Это видно здесь, а не
        выясняется на разборе провалившегося найма.
      </p>

      {list.map((v) => (
        <Card key={v.id} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <b className="font-mono text-[13px]">Версия {v.version_no}</b>
              <div className="mt-[2px] text-[12.5px] text-ink-3">
                {v.changed_by_name} · {dateRu(v.created_at)}
              </div>
            </div>
            {v.version_no === list[0].version_no && <Tag tone="good">Действует</Tag>}
          </div>

          {v.change_note && <p className="m-0 text-[13.5px] text-ink-2">{v.change_note}</p>}

          {v.changes.length > 0 && (
            <div className="flex flex-col gap-2">
              {v.changes.map((c, i) => (
                <div key={i} className="flex flex-wrap items-baseline gap-2 text-[13px]">
                  <span className="font-medium">{c.field}:</span>
                  <span className="text-ink-3 line-through">{c.from}</span>
                  <span className="text-ink-3">→</span>
                  <span className="font-medium text-ink">{c.to}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Вопросы и оценочная форма под роль (фишка 28).
// «Не знает, какие вопросы задавать для проверки компетенций» — боль
// руководителя подразделения. Вопросы строятся из критериев вакансии,
// поэтому интервью проверяет ровно то, по чему принимается решение.
// ---------------------------------------------------------------------------
function QuestionsTab({ vacancyId }: { vacancyId: string }) {
  const questions = useAsync(() => api.listQuestions(vacancyId), [vacancyId]);
  if (questions.loading) return <Skeleton className="h-40 w-full" />;
  const list = questions.data ?? [];

  if (list.length === 0) {
    return (
      <EmptyState
        title="Вопросы не из чего собрать"
        description="Сначала задайте критерии вакансии — вопросы строятся из них, а не из общего списка «что спросить на собеседовании»."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex items-start gap-3 border-l-[3px] border-l-primary">
        <Sparkles className="mt-[2px] h-5 w-5 shrink-0 text-primary" />
        <p className="m-0 text-[13.5px] text-ink-2">
          По одному вопросу на критерий. Рядом — что считать хорошим ответом:
          без этого «понравился» и «не понравился» снова остаются единственными
          вариантами. Распечатайте или откройте с телефона прямо на интервью.
        </p>
      </Card>

      {list.map((q, i) => (
        <Card key={q.id} className="flex flex-col gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
            {i + 1}. Проверяет: {q.criterion_name}
          </div>
          <p className="m-0 text-[15px] font-medium leading-snug">{q.question}</p>
          <div className="rounded-md bg-good-soft p-3">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-good">
              Что считать хорошим ответом
            </div>
            <p className="m-0 text-[12.5px] text-ink-2">{q.good_answer}</p>
          </div>
        </Card>
      ))}
    </div>
  );
}


// ---------------------------------------------------------------------------
// Новая вакансия
//
// Раньше вакансии брались только из встроенного набора: завести свою было
// нечем, и после первой же уборки демо-данных подбор начинать было не с чего.
//
// Поля разделены на обязательные и остальные не по важности, а по тому, без
// чего вакансия не работает. Город и направление обязательны потому, что hh
// хранит регион и профессиональную роль числами и подбирает их по этим двум
// словам: без них публикация остановится с ошибкой.
// ---------------------------------------------------------------------------
const EMPTY: VacancyInput = {
  title: "",
  department_id: "",
  specialization: "",
  city: "",
  employment_type: "full_time",
  work_format: "onsite",
  grade: null,
  headcount: 1,
  weekly_hours: null,
  description: "",
  requirements: "",
  conditions: "",
  first_month_reality: "",
  salary_min: null,
  salary_max: null,
  is_net: true,
};

function NewVacancyModal({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const departments = useAsync(() => api.listDepartments(), []);
  const [form, setForm] = useState<VacancyInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof VacancyInput>(key: K, value: VacancyInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const ready = form.title.trim() && form.department_id && form.specialization.trim() && form.city.trim();

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const id = await api.createVacancy(form);
      setForm(EMPTY);
      onCreated(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не получилось создать вакансию");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Открыть вакансию" wide>
      <div className="flex flex-col gap-3">
        {error && (
          <p className="m-0 rounded-md border border-crit-soft bg-crit-soft px-[10px] py-2 text-[12.5px] text-crit">
            {error}
          </p>
        )}

        <Field label="Название должности">
          <Input
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Менеджер по продажам"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Подразделение">
            <Select value={form.department_id} onChange={(e) => set("department_id", e.target.value)}>
              <option value="">Выберите</option>
              {(departments.data ?? []).map((d: { id: string; name: string }) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
          </Field>

          <Field
            label="Направление"
            hint="Так это называется на языке площадок: «Продажи», «Разработка», «Бухгалтерия»"
          >
            <Input
              value={form.specialization}
              onChange={(e) => set("specialization", e.target.value)}
              placeholder="Продажи"
            />
          </Field>

          <Field label="Город" hint="Как на hh: «Москва», «Санкт-Петербург»">
            <Input
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
              placeholder="Москва"
            />
          </Field>

          <Field label="Сколько человек нужно">
            <Input
              type="number"
              min={1}
              value={String(form.headcount)}
              onChange={(e) => set("headcount", Math.max(1, Number(e.target.value) || 1))}
            />
          </Field>

          <Field label="Занятость">
            <Select
              value={form.employment_type}
              onChange={(e) => set("employment_type", e.target.value as EmploymentType)}
            >
              {Object.entries(EMPLOYMENT_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </Field>

          <Field label="Формат работы">
            <Select
              value={form.work_format}
              onChange={(e) => set("work_format", e.target.value as WorkFormat)}
            >
              {Object.entries(WORK_FORMAT_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </Field>

          <Field label="Уровень">
            <Select
              value={form.grade ?? ""}
              onChange={(e) => set("grade", (e.target.value || null) as GradeLevel | null)}
            >
              <option value="">не важен</option>
              {Object.entries(GRADE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </Field>

          <Field label="Часов в неделю" hint="Честная нагрузка, а не «по договорённости»">
            <Input
              type="number"
              min={1}
              value={form.weekly_hours === null ? "" : String(form.weekly_hours)}
              onChange={(e) => set("weekly_hours", e.target.value ? Number(e.target.value) : null)}
              placeholder="40"
            />
          </Field>

          <Field label="Вилка от, ₽">
            <Input
              type="number"
              value={form.salary_min === null ? "" : String(form.salary_min)}
              onChange={(e) => set("salary_min", e.target.value ? Number(e.target.value) : null)}
              placeholder="80000"
            />
          </Field>

          <Field label="Вилка до, ₽">
            <Input
              type="number"
              value={form.salary_max === null ? "" : String(form.salary_max)}
              onChange={(e) => set("salary_max", e.target.value ? Number(e.target.value) : null)}
              placeholder="120000"
            />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          <input
            type="checkbox"
            checked={form.is_net}
            onChange={(e) => set("is_net", e.target.checked)}
          />
          Вилка указана на руки (снимите галочку, если до вычета налога)
        </label>

        <Field label="Чем предстоит заниматься">
          <Textarea
            rows={3}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>

        <Field label="Что обязательно нужно уметь">
          <Textarea
            rows={3}
            value={form.requirements}
            onChange={(e) => set("requirements", e.target.value)}
          />
        </Field>

        <Field label="Условия">
          <Textarea
            rows={2}
            value={form.conditions}
            onChange={(e) => set("conditions", e.target.value)}
          />
        </Field>

        <Field
          label="Что реально будет в первый месяц"
          hint="Самое полезное поле объявления: отсеивает не тех до отклика, а не после собеседования. Уходит на hh вместе с описанием."
        >
          <Textarea
            rows={3}
            value={form.first_month_reality}
            onChange={(e) => set("first_month_reality", e.target.value)}
            placeholder="Первые две недели — обучение продукту и слушаем звонки старших. С третьей — свои звонки под присмотром."
          />
        </Field>

        <div className="mt-1 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Отмена</Button>
          <Button onClick={submit} disabled={!ready || busy}>
            {busy ? "Открываю…" : "Открыть вакансию"}
          </Button>
        </div>

        {!ready && (
          <p className="m-0 text-right text-[12px] text-ink-3">
            Нужны название, подразделение, направление и город.
          </p>
        )}
      </div>
    </Modal>
  );
}
