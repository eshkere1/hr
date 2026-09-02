import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, HelpCircle, Minus, X } from "lucide-react";
import * as api from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { Card, Select, Skeleton, Tag } from "@/components/ui";
import { CriteriaMeter, EmptyState, PageHeader } from "@/components/app/primitives";
import { SOURCE_LABEL, type CriteriaResult, type CriterionResult } from "@/lib/types";
import { cn, money } from "@/lib/utils";

/**
 * Сравнение кандидатов рядом на одном экране (фишка 32).
 *
 * Дословная мечта руководителя подразделения из таблицы стейкхолдеров.
 * Сравниваем не людей вообще, а закрытие критериев этой вакансии — и рядом
 * с каждой отметкой держим основание. Иначе получится конкурс обаяния.
 */
const RESULT_ICON: Record<CriterionResult, { icon: typeof Check; cls: string; label: string }> = {
  met: { icon: Check, cls: "text-good bg-good-soft", label: "Закрыт" },
  partial: { icon: Minus, cls: "text-warn bg-warn-soft", label: "Частично" },
  not_met: { icon: X, cls: "text-crit bg-crit-soft", label: "Не закрыт" },
  unknown: { icon: HelpCircle, cls: "text-ink-3 bg-surface-2", label: "Не проверялся" },
};

export default function Compare() {
  const [vacancyId, setVacancyId] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  const vacancies = useAsync(() => api.listVacancies(), []);
  const list = vacancies.data ?? [];
  const vacancy = list.find((v) => v.id === vacancyId) ?? list[0];

  const criteria = useAsync(
    () => (vacancy ? api.listCriteria(vacancy.id) : Promise.resolve([])),
    [vacancy?.id],
  );
  const applications = useAsync(
    () => (vacancy ? api.listApplications(vacancy.id) : Promise.resolve([])),
    [vacancy?.id],
  );

  const active = useMemo(
    () => (applications.data ?? []).filter((a) => a.status === "active"),
    [applications.data],
  );

  // По умолчанию берём троих, у кого закрыто больше критериев: именно между
  // ними и идёт настоящий выбор.
  useEffect(() => {
    if (!active.length) return;
    setPicked(
      [...active]
        .sort((a, b) => b.criteria_met - a.criteria_met)
        .slice(0, 3)
        .map((a) => a.id),
    );
  }, [active]);

  const chosen = active.filter((a) => picked.includes(a.id));

  return (
    <>
      <PageHeader
        eyebrow="Решение по вакансии"
        title="Сравнение кандидатов"
        description="Люди сравниваются по критериям этой вакансии, и у каждой отметки видно основание. Без основания это спор о том, кто приятнее."
        actions={
          <Select
            aria-label="Вакансия"
            className="max-w-[320px]"
            value={vacancy?.id ?? ""}
            onChange={(e) => {
              setVacancyId(e.target.value);
              setPicked([]);
            }}
          >
            {list.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </Select>
        }
      />

      {applications.loading || criteria.loading ? (
        <Skeleton className="h-72 w-full" />
      ) : active.length === 0 ? (
        <EmptyState
          title="Сравнивать пока некого"
          description="По этой вакансии нет активных откликов. Сравнение появится, как только в воронке будет хотя бы двое."
        />
      ) : (
        <>
          {/* Кого сравниваем */}
          <Card className="mb-4">
            <div className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
              Кого сравниваем — не больше четверых, иначе таблица перестаёт читаться
            </div>
            <div className="flex flex-wrap gap-2">
              {active.map((a) => {
                const on = picked.includes(a.id);
                return (
                  <button
                    key={a.id}
                    onClick={() =>
                      setPicked((p) =>
                        on ? p.filter((x) => x !== a.id) : p.length >= 4 ? p : [...p, a.id],
                      )
                    }
                    disabled={!on && picked.length >= 4}
                    className={cn(
                      "rounded-md border px-3 py-2 text-[13px] transition-colors disabled:opacity-40",
                      on
                        ? "border-primary bg-primary-soft font-semibold text-primary"
                        : "border-border bg-surface text-ink-2 hover:border-border-strong",
                    )}
                  >
                    {a.candidate_name}
                    <span className="ml-2 font-mono text-[11px] text-ink-3">
                      {a.criteria_met}/{a.criteria_total}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          {chosen.length < 2 ? (
            <EmptyState
              title="Выберите хотя бы двоих"
              description="Сравнение одного человека с самим собой ничего не решает."
            />
          ) : (
            <ComparisonTable
              criteria={criteria.data ?? []}
              applications={chosen}
              vacancyBandMax={vacancy?.compensation?.salary_max ?? null}
            />
          )}
        </>
      )}
    </>
  );
}

function ComparisonTable({
  criteria, applications, vacancyBandMax,
}: {
  criteria: { id: string; name: string; is_required: boolean }[];
  applications: { id: string; candidate_name: string; criteria_met: number; criteria_total: number; expected_salary: number | null }[];
  vacancyBandMax: number | null;
}) {
  // Результаты по каждому кандидату грузим параллельно
  const results = useAsync(
    async () => {
      const pairs = await Promise.all(
        applications.map(async (a) => [a.id, await api.listCriteriaResults(a.id)] as const),
      );
      return Object.fromEntries(pairs) as Record<string, CriteriaResult[]>;
    },
    [applications.map((a) => a.id).join(",")],
  );

  if (results.loading) return <Skeleton className="h-72 w-full" />;
  const byApp = results.data ?? {};

  const cols = `240px repeat(${applications.length}, minmax(200px, 1fr))`;

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <div style={{ minWidth: 240 + applications.length * 200 }}>
        {/* Шапка */}
        <div
          className="grid items-end gap-0 border-b border-border bg-surface-2"
          style={{ gridTemplateColumns: cols }}
        >
          <div className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">
            Критерий вакансии
          </div>
          {applications.map((a) => (
            <div key={a.id} className="border-l border-border px-4 py-3">
              <Link to={`/applications/${a.id}`} className="block text-[14px] font-semibold">
                {a.candidate_name}
              </Link>
              <CriteriaMeter met={a.criteria_met} total={a.criteria_total} className="mt-1" />
            </div>
          ))}
        </div>

        {/* Строки критериев */}
        {criteria.map((c) => (
          <div
            key={c.id}
            className="grid border-b border-border last:border-0"
            style={{ gridTemplateColumns: cols }}
          >
            <div className="px-4 py-3">
              <div className="text-[13.5px] font-medium">{c.name}</div>
              {c.is_required && (
                <Tag tone="info" className="mt-1">
                  Обязательный
                </Tag>
              )}
            </div>
            {applications.map((a) => {
              const r = (byApp[a.id] ?? []).find((x) => x.criterion_id === c.id);
              const view = RESULT_ICON[r?.result ?? "unknown"];
              const Icon = view.icon;
              return (
                <div key={a.id} className="border-l border-border px-4 py-3">
                  <div className="flex items-start gap-2">
                    <span className={cn("mt-[1px] grid h-5 w-5 shrink-0 place-items-center rounded-sm", view.cls)}>
                      <Icon className="h-3 w-3" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-medium">{view.label}</div>
                      {r?.evidence && (
                        <p className="m-0 mt-1 text-[12px] leading-snug text-ink-2">{r.evidence}</p>
                      )}
                      {r && (
                        <div className="mt-1 text-[11px] text-ink-3">
                          источник: {SOURCE_LABEL[r.source]}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {/* Деньги отдельной строкой: часто именно она решает */}
        <div
          className="grid border-t border-border-strong bg-surface-2"
          style={{ gridTemplateColumns: cols }}
        >
          <div className="px-4 py-3 text-[13.5px] font-medium">Ожидания по зарплате</div>
          {applications.map((a) => {
            const over =
              vacancyBandMax != null && a.expected_salary != null
                ? a.expected_salary - vacancyBandMax
                : null;
            return (
              <div key={a.id} className="border-l border-border px-4 py-3">
                <div className="font-mono text-[13px] tabular-nums">{money(a.expected_salary)}</div>
                {over != null && over > 0 && (
                  <Tag tone="warn" className="mt-1">
                    выше вилки на {money(over)}
                  </Tag>
                )}
                {over != null && over <= 0 && (
                  <Tag tone="good" className="mt-1">
                    в вилке
                  </Tag>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
