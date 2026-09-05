import { useMemo, useState } from "react";
import {
  Award, BookOpen, CalendarCheck, Check, ClipboardCheck, GraduationCap,
  MessageSquareQuote, Target, UserCheck,
} from "lucide-react";
import * as api from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import {
  Button, Card, Field, Input, Modal, Skeleton, Table, TableWrap, Tabs, Tag, Td, Textarea, Th,
} from "@/components/ui";
import { EmptyState, PageHeader } from "@/components/app/primitives";
import { cn, dateRu, initials, money, plural } from "@/lib/utils";
import type { CriterionResult, Employee, PeopleCheckpoint } from "@/lib/types";

/**
 * Сотрудники: что происходит после «Вышел».
 *
 * Раньше найм здесь обрывался, и это дорого стоило именно найму. Срок
 * закрытия вакансии показывает скорость, но не показывает, тех ли берём.
 * Ответ на этот вопрос даёт только оценка на испытательном — и только если
 * она идёт по тем же критериям, по которым отбирали.
 *
 * Отсюда порядок: сначала список того, что назрело по календарю (иначе
 * «спросить через три месяца» не сделает никто), потом люди.
 */
export default function Employees() {
  const employees = useAsync(() => api.listEmployees(), []);
  const checkpoints = useAsync(() => api.listCheckpoints(), []);
  const [openId, setOpenId] = useState<string | null>(null);

  const list = employees.data ?? [];
  const due = checkpoints.data ?? [];
  const active = list.find((e) => e.id === openId) ?? null;

  const overdue = useMemo(
    () => due.filter((c) => new Date(c.due_on).getTime() <= Date.now()),
    [due],
  );

  if (employees.loading) return <Skeleton className="h-64 w-full" />;

  if (list.length === 0) {
    return (
      <>
        <PageHeader eyebrow="После найма" title="Сотрудники" />
        <EmptyState
          title="Пока никто не вышел"
          description="Сотрудник заводится сам, когда отклик доходит до этапа «Вышел». Тогда же создаётся план на 30, 60 и 90 дней."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="После найма"
        title="Сотрудники"
        description="Здесь видно, тех ли мы взяли. Оценка идёт по тем же критериям, что были на отборе: расхождение — сигнал не сотруднику, а нашему отбору."
      />

      {overdue.length > 0 && (
        <Card className="mb-5 border-l-[3px] border-l-warn">
          <b className="mb-1 flex items-center gap-2 font-display text-[16px] font-semibold">
            <CalendarCheck className="h-[18px] w-[18px] text-warn" />
            Назрело: {overdue.length}
          </b>
          <p className="m-0 mb-3 max-w-[74ch] text-[13px] text-ink-2">
            Сроки, которые наступили. Без этого списка «спросим через три месяца»
            не делает никто — не потому что не хотят, а потому что некому напомнить.
          </p>
          <div className="flex flex-col gap-2">
            {overdue.slice(0, 6).map((c, i) => (
              <CheckpointRow key={`${c.employee_id}-${c.kind}-${c.mark}-${i}`} c={c} onOpen={() => setOpenId(c.employee_id)} />
            ))}
          </div>
        </Card>
      )}

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Сотрудник</Th>
              <Th>Подразделение</Th>
              <Th>Вышел</Th>
              <Th>На работе</Th>
              <Th>Наставник</Th>
              <Th>Статус</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.id}>
                <Td>
                  <span className="flex items-center gap-[10px]">
                    <span
                      aria-hidden="true"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-primary-soft text-[11px] font-bold text-primary"
                    >
                      {initials(e.full_name)}
                    </span>
                    <span className="min-w-0">
                      <b className="block text-[13.5px]">{e.full_name}</b>
                      <span className="block text-[12px] text-ink-3">{e.position_title ?? "—"}</span>
                    </span>
                  </span>
                </Td>
                <Td>{e.department_name ?? "—"}</Td>
                <Td>{dateRu(e.hired_on)}</Td>
                <Td>
                  {e.days_worked} {plural(e.days_worked, "день", "дня", "дней")}
                </Td>
                <Td>{e.mentor_name ?? "—"}</Td>
                <Td>
                  {e.status === "probation" ? (
                    <Tag tone="warn">испытательный</Tag>
                  ) : e.status === "active" ? (
                    <Tag tone="good">в штате</Tag>
                  ) : (
                    <Tag tone="mute">{e.status}</Tag>
                  )}
                </Td>
                <Td>
                  <Button size="sm" variant="secondary" onClick={() => setOpenId(e.id)}>
                    Открыть
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>

      {active && <EmployeeCard employee={active} onClose={() => {
        setOpenId(null);
        checkpoints.reload();
      }} />}
    </>
  );
}

function CheckpointRow({ c, onOpen }: { c: PeopleCheckpoint; onOpen: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2">
      <span className="text-[13px]">
        <b>{c.full_name}</b>
        <span className="text-ink-3"> · {c.position_title ?? "—"}</span>
      </span>
      <span className="flex items-center gap-2">
        <Tag tone={c.kind === "probation" ? "info" : "warn"}>
          {c.kind === "probation"
            ? `Оценка на ${c.mark} день`
            : `Спросить руководителя · ${c.mark} мес`}
        </Tag>
        <Button size="sm" variant="secondary" onClick={onOpen}>
          Заполнить
        </Button>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Карточка сотрудника
// ---------------------------------------------------------------------------
const TABS = [
  { id: "onboarding", label: "Онбординг" },
  { id: "probation", label: "Испытательный" },
  { id: "idp", label: "План развития" },
  { id: "feedback", label: "Мнение руководителя" },
];

function EmployeeCard({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const [tab, setTab] = useState("onboarding");

  return (
    <Modal open onClose={onClose} title={employee.full_name} wide>
      <div className="mb-4 flex flex-wrap items-center gap-3 text-[13px] text-ink-2">
        <span>{employee.position_title ?? "—"}</span>
        <span className="text-ink-3">·</span>
        <span>{employee.department_name ?? "—"}</span>
        <span className="text-ink-3">·</span>
        <span>
          вышел {dateRu(employee.hired_on)}, {employee.days_worked}{" "}
          {plural(employee.days_worked, "день", "дня", "дней")} в компании
        </span>
        {employee.probation_ends_on && employee.status === "probation" && (
          <Tag tone="warn">испытательный до {dateRu(employee.probation_ends_on)}</Tag>
        )}
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      <div className="mt-4">
        {tab === "onboarding" && <OnboardingTab employeeId={employee.id} />}
        {tab === "probation" && <ProbationTab employee={employee} />}
        {tab === "idp" && <IdpTab employeeId={employee.id} />}
        {tab === "feedback" && <FeedbackTab employee={employee} />}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Онбординг 30/60/90 (фишка 56)
// ---------------------------------------------------------------------------
function OnboardingTab({ employeeId }: { employeeId: string }) {
  const tasks = useAsync(() => api.listOnboardingTasks(employeeId), [employeeId]);
  const list = tasks.data ?? [];

  async function toggle(id: string, done: boolean) {
    await api.toggleOnboardingTask(id, done);
    tasks.reload();
  }

  if (tasks.loading) return <Skeleton className="h-48 w-full" />;
  if (list.length === 0) {
    return <p className="m-0 text-[13.5px] text-ink-2">План не создан.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      {[30, 60, 90].map((h) => {
        const items = list.filter((t) => t.horizon === h);
        if (items.length === 0) return null;
        const done = items.filter((t) => t.done_at).length;
        return (
          <section key={h}>
            <div className="mb-2 flex items-baseline gap-2">
              <h3 className="m-0 font-display text-[16px] font-semibold">Первые {h} дней</h3>
              <span className="text-[13px] text-ink-3">
                {done} из {items.length}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {items.map((t) => (
                <label
                  key={t.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 transition-colors hover:bg-surface-2",
                    t.done_at && "opacity-60",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={!!t.done_at}
                    onChange={(e) => void toggle(t.id, e.target.checked)}
                    className="mt-[3px] h-4 w-4 shrink-0"
                  />
                  <span className="min-w-0">
                    <b className={cn("block text-[13.5px]", t.done_at && "line-through")}>
                      {t.title}
                    </b>
                    {t.description && (
                      <span className="mt-[2px] block max-w-[74ch] text-[12.5px] text-ink-2">
                        {t.description}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Испытательный срок (фишка 59)
// ---------------------------------------------------------------------------
const RESULT_LABEL: Record<CriterionResult, string> = {
  met: "закрыт",
  partial: "частично",
  not_met: "не закрыт",
  unknown: "не проверяли",
};

const RESULT_TONE: Record<CriterionResult, "good" | "warn" | "crit" | "mute"> = {
  met: "good", partial: "warn", not_met: "crit", unknown: "mute",
};

function ProbationTab({ employee }: { employee: Employee }) {
  const reviews = useAsync(() => api.listProbationReviews(employee.id), [employee.id]);
  const criteria = useAsync(
    () =>
      employee.application_id
        ? api.listCriteriaResults(employee.application_id)
        : Promise.resolve([]),
    [employee.application_id],
  );
  const [adding, setAdding] = useState<number | null>(null);

  const list = reviews.data ?? [];
  const done = new Set(list.map((r) => r.checkpoint));

  if (reviews.loading) return <Skeleton className="h-48 w-full" />;

  return (
    <div className="flex flex-col gap-5">
      <p className="m-0 max-w-[74ch] text-[13px] text-ink-2">
        Оценка идёт по тем же критериям, по которым человека отбирали. Если на
        отборе критерий стоял «закрыт», а через два месяца «частично» — это
        вопрос не к сотруднику, а к тому, чем мы его проверяли.
      </p>

      <div className="flex gap-2">
        {[30, 60, 90].map((cp) => (
          <Button
            key={cp}
            size="sm"
            variant={done.has(cp) ? "ghost" : "secondary"}
            onClick={() => setAdding(cp)}
            disabled={employee.days_worked < cp}
          >
            <ClipboardCheck className="h-4 w-4" />
            {cp} дней {done.has(cp) ? "· есть" : ""}
          </Button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="m-0 text-[13.5px] text-ink-3">Оценок пока нет.</p>
      ) : (
        [30, 60, 90].map((cp) => {
          const rows = list.filter((r) => r.checkpoint === cp);
          if (rows.length === 0) return null;
          return (
            <section key={cp}>
              <h3 className="mb-2 font-display text-[16px] font-semibold">{cp} дней</h3>
              <div className="flex flex-col gap-2">
                {rows.map((r) => (
                  <Card key={r.id} className="p-3">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <b className="text-[13.5px]">{r.criterion_name ?? "Общая оценка"}</b>
                      <Tag tone={RESULT_TONE[r.result]}>{RESULT_LABEL[r.result]}</Tag>
                    </div>
                    {r.comment && (
                      <p className="m-0 max-w-[74ch] text-[13px] text-ink-2">{r.comment}</p>
                    )}
                    <p className="m-0 mt-1 text-[11.5px] text-ink-3">
                      {r.reviewer_name ?? "—"} · {dateRu(r.created_at)}
                    </p>
                  </Card>
                ))}
              </div>
            </section>
          );
        })
      )}

      {adding !== null && (
        <ProbationForm
          employeeId={employee.id}
          checkpoint={adding}
          criteria={(criteria.data ?? []).map((c) => ({ id: c.criterion_id, name: c.criterion_name, was: c.result }))}
          onClose={() => setAdding(null)}
          onSaved={() => {
            setAdding(null);
            reviews.reload();
          }}
        />
      )}
    </div>
  );
}

function ProbationForm({
  employeeId, checkpoint, criteria, onClose, onSaved,
}: {
  employeeId: string;
  checkpoint: number;
  criteria: { id: string; name: string; was: CriterionResult }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState(
    criteria.map((c) => ({ ...c, result: "unknown" as CriterionResult, comment: "" })),
  );
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await api.saveProbationReview(
        employeeId,
        checkpoint,
        rows
          .filter((r) => r.result !== "unknown")
          .map((r) => ({
            criterion_id: r.id, criterion_name: r.name,
            result: r.result, comment: r.comment,
          })),
      );
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Оценка на ${checkpoint} день`} wide>
      {criteria.length === 0 ? (
        <p className="m-0 text-[13.5px] text-ink-2">
          У отклика нет критериев — оценивать не по чему. Так бывает, если человека
          завели в систему вручную, минуя отбор.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="m-0 max-w-[74ch] text-[13px] text-ink-2">
            Рядом с каждым критерием показано, что стояло на отборе. Расхождение
            и есть самое ценное: оно говорит про качество нашей проверки.
          </p>

          {rows.map((r, i) => (
            <Card key={r.id} className="p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <b className="text-[13.5px]">{r.name}</b>
                <span className="text-[12px] text-ink-3">на отборе:</span>
                <Tag tone={RESULT_TONE[r.was]}>{RESULT_LABEL[r.was]}</Tag>
              </div>
              <div className="mb-2 flex flex-wrap gap-2">
                {(["met", "partial", "not_met"] as CriterionResult[]).map((v) => (
                  <button
                    key={v}
                    onClick={() =>
                      setRows((s) => s.map((x, ix) => (ix === i ? { ...x, result: v } : x)))
                    }
                    className={cn(
                      "rounded-md border px-[10px] py-[5px] text-[12.5px] font-medium transition-colors",
                      r.result === v
                        ? "border-primary bg-primary-soft text-primary"
                        : "border-border text-ink-2 hover:bg-surface-2",
                    )}
                  >
                    {RESULT_LABEL[v]}
                  </button>
                ))}
              </div>
              <Textarea
                rows={2}
                value={r.comment}
                onChange={(e) =>
                  setRows((s) => s.map((x, ix) => (ix === i ? { ...x, comment: e.target.value } : x)))
                }
                placeholder={
                  r.result !== "unknown" && r.result !== r.was
                    ? "Разошлось с отбором — чем это объясняется?"
                    : "Основание: что именно вы видели"
                }
              />
            </Card>
          ))}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Отмена</Button>
            <Button
              onClick={save}
              disabled={busy || rows.every((r) => r.result === "unknown")}
            >
              Сохранить оценку
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// ИПР (фишка 14)
// ---------------------------------------------------------------------------
function IdpTab({ employeeId }: { employeeId: string }) {
  const plan = useAsync(() => api.getIdpPlan(employeeId), [employeeId]);
  const [editing, setEditing] = useState(false);

  if (plan.loading) return <Skeleton className="h-48 w-full" />;

  const p = plan.data;

  if (!p) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="m-0 max-w-[74ch] text-[13.5px] text-ink-2">
          Плана развития нет. Он нужен не «для галочки»: самый честный источник
          пунктов — критерии, которые на отборе закрылись частично. Там уже
          написано, чего человеку не хватает.
        </p>
        <Button onClick={() => setEditing(true)}>
          <Target className="h-4 w-4" /> Составить план
        </Button>
        {editing && (
          <IdpForm
            employeeId={employeeId}
            onClose={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              plan.reload();
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="border-l-[3px] border-l-primary">
        <b className="mb-1 flex items-center gap-2 font-display text-[16px] font-semibold">
          <Target className="h-[18px] w-[18px] text-primary" /> {p.goal}
        </b>
        <p className="m-0 text-[12.5px] text-ink-3">
          Горизонт {p.horizon_months} мес · составлен {dateRu(p.created_at)}
        </p>
      </Card>

      <div className="flex flex-col gap-2">
        {p.items.map((it) => (
          <Card key={it.id} className="p-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={!!it.done_at}
                onChange={async (e) => {
                  await api.toggleIdpItem(it.id, e.target.checked);
                  plan.reload();
                }}
                className="mt-[3px] h-4 w-4 shrink-0"
              />
              <span className="min-w-0">
                <b className={cn("block text-[13.5px]", it.done_at && "line-through opacity-60")}>
                  {it.what_to_learn}
                </b>
                {it.where_to_learn && (
                  <span className="mt-1 block text-[12.5px] text-ink-2">
                    <BookOpen className="mr-1 inline h-3 w-3" /> {it.where_to_learn}
                  </span>
                )}
                {it.expected_result && (
                  <span className="mt-1 block text-[12.5px] text-ink-2">
                    Результат: {it.expected_result}
                  </span>
                )}
                {it.why && (
                  <span className="mt-1 block text-[12px] italic text-ink-3">{it.why}</span>
                )}
              </span>
            </label>
          </Card>
        ))}
      </div>
    </div>
  );
}

function IdpForm({
  employeeId, onClose, onSaved,
}: {
  employeeId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [goal, setGoal] = useState("");
  const [horizon, setHorizon] = useState(6);
  const [items, setItems] = useState([
    { what_to_learn: "", where_to_learn: "", expected_result: "", why: "" },
  ]);
  const [busy, setBusy] = useState(false);

  return (
    <Modal open onClose={onClose} title="План развития" wide>
      <div className="flex flex-col gap-4">
        <Field label="Цель" hint="Одна фраза: что человек сможет делать через горизонт плана">
          <Input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Забрать на себя интеграции целиком"
            autoFocus
          />
        </Field>

        <Field label="Горизонт, месяцев">
          <Input
            type="number"
            min={1}
            max={24}
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value) || 6)}
            className="max-w-[120px]"
          />
        </Field>

        {items.map((it, i) => (
          <Card key={i} className="flex flex-col gap-3 p-3">
            <Field label={`Пункт ${i + 1}: чему научиться`}>
              <Input
                value={it.what_to_learn}
                onChange={(e) =>
                  setItems((s) => s.map((x, ix) => (ix === i ? { ...x, what_to_learn: e.target.value } : x)))
                }
              />
            </Field>
            <Field label="Где" hint="Материал, наставник, конкретная задача">
              <Input
                value={it.where_to_learn}
                onChange={(e) =>
                  setItems((s) => s.map((x, ix) => (ix === i ? { ...x, where_to_learn: e.target.value } : x)))
                }
              />
            </Field>
            <Field label="Как поймём, что получилось" hint="Проверяемый результат, а не «стал лучше разбираться»">
              <Input
                value={it.expected_result}
                onChange={(e) =>
                  setItems((s) => s.map((x, ix) => (ix === i ? { ...x, expected_result: e.target.value } : x)))
                }
              />
            </Field>
            <Field label="Зачем" hint="Связь с работой или с критерием отбора. Без этого пункт не выполняют">
              <Input
                value={it.why}
                onChange={(e) =>
                  setItems((s) => s.map((x, ix) => (ix === i ? { ...x, why: e.target.value } : x)))
                }
              />
            </Field>
          </Card>
        ))}

        <Button
          variant="secondary"
          onClick={() =>
            setItems((s) => [...s, { what_to_learn: "", where_to_learn: "", expected_result: "", why: "" }])
          }
        >
          Добавить пункт
        </Button>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button
            disabled={!goal.trim() || !items[0].what_to_learn.trim() || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.saveIdpPlan(
                  employeeId, goal.trim(), horizon,
                  items.filter((it) => it.what_to_learn.trim()),
                );
                onSaved();
              } finally {
                setBusy(false);
              }
            }}
          >
            Сохранить план
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Мнение руководителя о качестве найма (фишка 43)
// ---------------------------------------------------------------------------
function FeedbackTab({ employee }: { employee: Employee }) {
  const rows = useAsync(() => api.listSatisfaction(employee.id), [employee.id]);
  const [asking, setAsking] = useState<number | null>(null);

  const list = rows.data ?? [];
  const done = new Set(list.map((r) => r.month_mark));

  if (rows.loading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 max-w-[74ch] text-[13px] text-ink-2">
        Через месяц, три и полгода спрашиваем того, кто заказывал подбор.
        Один вопрос решает всё: взял бы снова? Ответ «нет» через три месяца
        стоит дороже, чем закрытая за две недели вакансия.
      </p>

      <div className="flex gap-2">
        {[1, 3, 6].map((m) => (
          <Button
            key={m}
            size="sm"
            variant={done.has(m) ? "ghost" : "secondary"}
            onClick={() => setAsking(m)}
            disabled={employee.days_worked < m * 30}
          >
            <MessageSquareQuote className="h-4 w-4" />
            {m} мес {done.has(m) ? "· есть" : ""}
          </Button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="m-0 text-[13.5px] text-ink-3">Опросов пока не было.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((r) => (
            <Card key={r.id} className="p-3">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <b className="text-[13.5px]">{r.month_mark} мес</b>
                <Tag tone={r.score >= 4 ? "good" : r.score === 3 ? "warn" : "crit"}>
                  {r.score} из 5
                </Tag>
                {r.would_hire_again === true && <Tag tone="good">взял бы снова</Tag>}
                {r.would_hire_again === false && <Tag tone="crit">не взял бы снова</Tag>}
              </div>
              {r.comment && <p className="m-0 max-w-[74ch] text-[13px] text-ink-2">{r.comment}</p>}
              <p className="m-0 mt-1 text-[11.5px] text-ink-3">
                {r.manager_name ?? "—"} · {dateRu(r.created_at)}
              </p>
            </Card>
          ))}
        </div>
      )}

      {asking !== null && (
        <SatisfactionForm
          employeeId={employee.id}
          monthMark={asking}
          onClose={() => setAsking(null)}
          onSaved={() => {
            setAsking(null);
            rows.reload();
          }}
        />
      )}
    </div>
  );
}

function SatisfactionForm({
  employeeId, monthMark, onClose, onSaved,
}: {
  employeeId: string;
  monthMark: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [score, setScore] = useState(4);
  const [again, setAgain] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Modal open onClose={onClose} title={`Опрос через ${monthMark} мес`}>
      <div className="flex flex-col gap-4">
        <Field label="Насколько человек оправдал ожидания">
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                onClick={() => setScore(v)}
                className={cn(
                  "h-10 w-10 rounded-md border text-[14px] font-semibold transition-colors",
                  score === v
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border text-ink-2 hover:bg-surface-2",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Взяли бы этого человека снова" hint="Главный вопрос: он один говорит о качестве подбора больше, чем оценка">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={again === true ? "primary" : "secondary"}
              onClick={() => setAgain(true)}
            >
              <UserCheck className="h-4 w-4" /> Да
            </Button>
            <Button
              size="sm"
              variant={again === false ? "primary" : "secondary"}
              onClick={() => setAgain(false)}
            >
              Нет
            </Button>
          </div>
        </Field>

        <Field label="Что стоит знать подбору" hint="Особенно если ответ «нет»: это исправит следующий отбор">
          <Textarea
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </Field>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button
            disabled={again === null || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.saveSatisfaction(employeeId, monthMark, score, again!, comment);
                onSaved();
              } finally {
                setBusy(false);
              }
            }}
          >
            Сохранить
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Наставничество (фишка 57) — отдельный экран
// ---------------------------------------------------------------------------
export function Mentorships() {
  const rows = useAsync(() => api.listMentorships(), []);
  const list = rows.data ?? [];

  if (rows.loading) return <Skeleton className="h-48 w-full" />;

  const totalHours = list.reduce((n, m) => n + m.hours_logged, 0);
  const unpaid = list.filter((m) => !m.bonus_paid_at && m.ended_on);

  return (
    <>
      <PageHeader
        eyebrow="После найма"
        title="Наставничество"
        description="Работа наставника видна и оплачивается. Без учёта она превращается в нагрузку сверх основной — и её перестают брать."
      />

      {list.length === 0 ? (
        <EmptyState
          title="Наставников пока нет"
          description="Наставник назначается сотруднику на испытательном сроке."
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-3">
            <Card className="min-w-[180px]">
              <span className="block text-[12px] text-ink-3">Часов всего</span>
              <b className="font-display text-[24px] font-semibold">{totalHours}</b>
            </Card>
            <Card className="min-w-[180px]">
              <span className="block text-[12px] text-ink-3">Бонусов к выплате</span>
              <b className="font-display text-[24px] font-semibold">
                {money(unpaid.reduce((n, m) => n + m.bonus_amount, 0))}
              </b>
            </Card>
          </div>

          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Наставник</Th>
                  <Th>Сотрудник</Th>
                  <Th>Период</Th>
                  <Th>Часы</Th>
                  <Th>Бонус</Th>
                </tr>
              </thead>
              <tbody>
                {list.map((m) => (
                  <tr key={m.id}>
                    <Td>
                      <span className="flex items-center gap-2">
                        <Award className="h-4 w-4 text-primary" />
                        <b>{m.mentor_name}</b>
                      </span>
                    </Td>
                    <Td>{m.employee_name}</Td>
                    <Td>
                      {dateRu(m.started_on)} — {m.ended_on ? dateRu(m.ended_on) : "сейчас"}
                    </Td>
                    <Td>{m.hours_logged}</Td>
                    <Td>
                      {money(m.bonus_amount)}{" "}
                      {m.bonus_paid_at ? (
                        <Tag tone="good">
                          <Check className="h-3 w-3" /> выплачен
                        </Tag>
                      ) : m.ended_on ? (
                        <Tag tone="warn">к выплате</Tag>
                      ) : (
                        <Tag tone="mute">идёт</Tag>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// База материалов (фишка 58) — отдельный экран
// ---------------------------------------------------------------------------
export function Materials() {
  const rows = useAsync(() => api.listMaterials(), []);
  const [adding, setAdding] = useState(false);
  const list = rows.data ?? [];
  const stale = list.filter((m) => m.is_stale);

  return (
    <>
      <PageHeader
        eyebrow="После найма"
        title="Материалы"
        description="«Устареют, никто не обновит» — верно, если ни у чего нет владельца. Здесь у каждого материала есть хозяин и срок пересмотра, а просроченные видно первыми."
        actions={<Button onClick={() => setAdding(true)}>Добавить материал</Button>}
      />

      {rows.loading ? (
        <Skeleton className="h-40 w-full" />
      ) : list.length === 0 ? (
        <EmptyState
          title="Материалов пока нет"
          description="Сюда складывают то, что нужно новичку: регламенты, скрипты, разборы. На них ссылаются задачи онбординга."
        />
      ) : (
        <>
          {stale.length > 0 && (
            <Card className="mb-4 border-l-[3px] border-l-warn">
              <b className="mb-1 block font-display text-[15px] font-semibold">
                Просрочено: {stale.length}
              </b>
              <p className="m-0 max-w-[74ch] text-[13px] text-ink-2">
                Срок пересмотра прошёл. Владельцу достаточно нажать «Ещё актуально» —
                или обновить и нажать то же самое.
              </p>
            </Card>
          )}

          <div className="flex flex-col gap-2">
            {list.map((m) => (
              <Card key={m.id} className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <GraduationCap className="h-[17px] w-[17px] text-primary" />
                    <b className="text-[14px]">{m.title}</b>
                    {m.is_stale && <Tag tone="warn">пора обновить</Tag>}
                  </div>
                  <p className="m-0 text-[12.5px] text-ink-3">
                    {m.owner_name ?? "без владельца"} · проверен {dateRu(m.actualized_on)} ·
                    пересмотр раз в {m.review_every_days} дн.
                  </p>
                  {m.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {m.tags.map((t) => (
                        <Tag key={t} tone="mute">{t}</Tag>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await api.actualizeMaterial(m.id);
                    rows.reload();
                  }}
                >
                  Ещё актуально
                </Button>
              </Card>
            ))}
          </div>
        </>
      )}

      {adding && (
        <AddMaterial
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            rows.reload();
          }}
        />
      )}
    </>
  );
}

function AddMaterial({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [tags, setTags] = useState("");
  const [days, setDays] = useState(180);
  const [busy, setBusy] = useState(false);

  return (
    <Modal open onClose={onClose} title="Новый материал">
      <div className="flex flex-col gap-4">
        <Field label="Название">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label="Ссылка" hint="Необязательно: материал может лежать и здесь текстом">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
        </Field>
        <Field label="Метки" hint="Через запятую: новичку, продажи, всем">
          <Input value={tags} onChange={(e) => setTags(e.target.value)} />
        </Field>
        <Field label="Пересматривать раз в, дней" hint="Через этот срок материал попадёт в список просроченных">
          <Input
            type="number"
            value={days}
            onChange={(e) => setDays(Number(e.target.value) || 180)}
            className="max-w-[120px]"
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button
            disabled={!title.trim() || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.saveMaterial({
                  title: title.trim(),
                  url: url.trim(),
                  tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
                  reviewEveryDays: days,
                });
                onSaved();
              } finally {
                setBusy(false);
              }
            }}
          >
            Сохранить
          </Button>
        </div>
      </div>
    </Modal>
  );
}
