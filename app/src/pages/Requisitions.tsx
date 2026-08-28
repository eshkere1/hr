import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Sparkles } from "lucide-react";
import * as api from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/hooks/useAuth";
import {
  Button, Card, Field, Select, Skeleton, Tag, Textarea,
} from "@/components/ui";
import { EmptyState, PageHeader } from "@/components/app/primitives";
import { dateRu } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Очередь согласований для владельца
// ---------------------------------------------------------------------------
export default function Requisitions() {
  const items = useAsync(() => api.listRequisitions(), []);
  const list = items.data ?? [];
  const pending = list.filter((r) => r.status === "pending_approval");

  return (
    <>
      <PageHeader
        eyebrow="Заявки на подбор"
        title="Согласования"
        description="Одно решение в один тап. Видно, кто просит, зачем и в какие деньги."
      />

      {items.loading ? (
        <Skeleton className="h-48 w-full" />
      ) : pending.length === 0 ? (
        <EmptyState
          title="Ничего не ждёт согласования"
          description="Как только руководитель подразделения отправит заявку, она появится здесь — вместе с вилкой и сроком."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {pending.map((r) => (
            <Card key={r.id} className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="m-0 font-display text-[18px] font-semibold tracking-[-0.01em]">
                    {r.department_name}
                  </h2>
                  <div className="mt-1 text-[12.5px] text-ink-3">
                    Просит {r.requested_by_name} · {dateRu(r.created_at)}
                  </div>
                </div>
                <Tag tone="warn">Ждёт вашего решения</Tag>
              </div>

              <dl className="m-0 grid gap-3 sm:grid-cols-2">
                <Answer q="Кто нужен и зачем" a={r.q_who_needed} />
                <Answer q="Что будет делать" a={r.q_tasks} />
                <Answer q="Без чего точно не возьмём" a={r.q_must_have} />
                <Answer q="К какой дате" a={r.q_deadline} />
                <Answer q="Сколько готовы платить" a={r.q_budget} />
              </dl>

              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                <Button><Check className="h-4 w-4" /> Согласовать и открыть вакансию</Button>
                <Button variant="secondary">Вернуть на доработку</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {list.filter((r) => r.status !== "pending_approval").length > 0 && (
        <section className="mt-8">
          <h3 className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
            Уже согласованы
          </h3>
          <div className="flex flex-col gap-2">
            {list
              .filter((r) => r.status !== "pending_approval")
              .map((r) => (
                <Card key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                  <div>
                    <b className="text-[14px]">{r.department_name}</b>
                    <span className="ml-2 text-[12.5px] text-ink-3">
                      {r.requested_by_name} · {dateRu(r.created_at)}
                    </span>
                  </div>
                  <Tag tone="good">Согласована</Tag>
                </Card>
              ))}
          </div>
        </section>
      )}
    </>
  );
}

function Answer({ q, a }: { q: string; a: string | null }) {
  return (
    <div>
      <dt className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">{q}</dt>
      <dd className="m-0 mt-1 text-[13.5px] text-ink-2">{a || "—"}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Заявка на подбор: пять вопросов, три минуты
// ---------------------------------------------------------------------------
const QUESTIONS = [
  {
    key: "q_who_needed" as const,
    label: "Кого нужно и зачем",
    hint: "Своими словами. Например: «второй математик на 5–9 классы, потому что Анна уходит в декрет»",
  },
  {
    key: "q_tasks" as const,
    label: "Что человек будет делать в первый месяц",
    hint: "Часы, классы, есть ли классное руководство",
  },
  {
    key: "q_must_have" as const,
    label: "Без чего точно не возьмём",
    hint: "Одно-два условия, а не список из десяти",
  },
  {
    key: "q_deadline" as const,
    label: "К какой дате нужен",
    hint: "И что случится, если не успеем",
  },
  {
    key: "q_budget" as const,
    label: "Сколько готовы платить",
    hint: "Вилка на руки. Если не знаете — напишите «не знаю», подскажем по рынку",
  },
];

export function RequisitionNew() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const departments = useAsync(() => api.listDepartments(), []);
  const [values, setValues] = useState<Record<string, string>>({});
  const [departmentId, setDepartmentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const filled = QUESTIONS.filter((q) => (values[q.key] ?? "").trim().length > 3).length;

  async function submit() {
    setBusy(true);
    await api.createRequisition(
      {
        department_id: departmentId || (departments.data ?? [])[0]?.id || "",
        q_who_needed: values.q_who_needed ?? "",
        q_tasks: values.q_tasks ?? "",
        q_must_have: values.q_must_have ?? "",
        q_deadline: values.q_deadline ?? "",
        q_budget: values.q_budget ?? "",
      },
      profile?.full_name ?? "—",
    );
    setBusy(false);
    setDone(true);
  }

  if (done) {
    return (
      <>
        <PageHeader eyebrow="Заявка на подбор" title="Заявка отправлена" />
        <Card className="max-w-[560px] border-l-[3px] border-l-good">
          <p className="m-0 text-[14px] text-ink-2">
            Ассистент достроит профиль вакансии, требования и вилку из ваших ответов,
            а HR проверит и отправит на согласование. Форму на двадцать полей
            заполнять не придётся — если чего-то не хватит, вас спросят одним
            сообщением.
          </p>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => navigate("/vacancies")}>К моим вакансиям</Button>
            <Button
              variant="secondary"
              onClick={() => {
                setValues({});
                setDone(false);
              }}
            >
              Ещё одна заявка
            </Button>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Три минуты, пять вопросов"
        title="Заявка на подбор"
        description="Отвечайте своими словами. Профиль вакансии, требования и вилку ассистент достроит сам — вы потом проверите."
      />

      <div className="max-w-[640px]">
        <Card className="flex flex-col gap-5">
          <Field label="Подразделение" htmlFor="dept">
            <Select
              id="dept"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
            >
              {(departments.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>

          {QUESTIONS.map((q, i) => (
            <Field
              key={q.key}
              label={`${i + 1}. ${q.label}`}
              hint={q.hint}
              htmlFor={q.key}
            >
              <Textarea
                id={q.key}
                value={values[q.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [q.key]: e.target.value }))}
                className="min-h-[72px]"
              />
            </Field>
          ))}

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
            <Button onClick={submit} disabled={filled < 3 || busy}>
              <Sparkles className="h-4 w-4" /> Собрать вакансию
            </Button>
            <span className="text-[12.5px] text-ink-3">
              Заполнено <span className="font-mono tabular-nums">{filled}</span> из 5.
              {filled < 3 && " Ответьте хотя бы на три — остальное достроим."}
            </span>
          </div>
        </Card>
      </div>
    </>
  );
}
