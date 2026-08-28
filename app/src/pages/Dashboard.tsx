import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import * as api from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { Card, Select, Skeleton, Tag } from "@/components/ui";
import { Kpi, PageHeader } from "@/components/app/primitives";
import { daysWord, plural } from "@/lib/utils";

/**
 * Дашборд руководителя: две минуты утром, часто с телефона.
 * Сначала итог, потом детали. Каждое число отвечает на вопрос,
 * который руководитель задал бы вслух.
 */
export default function Dashboard() {
  const stats = useAsync(() => api.getDashboardStats(), []);
  const breaches = useAsync(() => api.getSlaBreaches(), []);
  const vacancies = useAsync(() => api.listVacancies(), []);
  const [funnelVacancy, setFunnelVacancy] = useState("");

  const list = vacancies.data ?? [];
  const selected = list.find((v) => v.id === funnelVacancy) ?? list[0];

  return (
    <>
      <PageHeader
        eyebrow="Найм по компании"
        title="Дашборд"
        description="Что происходит с наймом прямо сейчас и где он тормозит."
      />

      {stats.loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[120px]" />
          ))}
        </div>
      ) : (
        stats.data && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="Срок закрытия"
              value={stats.data.days_to_hire}
              unit={daysWord(stats.data.days_to_hire)}
              delta={
                stats.data.days_to_hire_delta
                  ? `▼ ${Math.abs(stats.data.days_to_hire_delta)} ${daysWord(Math.abs(stats.data.days_to_hire_delta))} к прошлому кварталу`
                  : "без изменений"
              }
              deltaTone={stats.data.days_to_hire_delta < 0 ? "good" : "mute"}
            />
            <Kpi
              label="Стоимость найма"
              value={stats.data.cost_per_hire}
              unit="тыс ₽"
              delta={stats.data.cost_per_hire_delta ? `▲ ${stats.data.cost_per_hire_delta}` : "без изменений"}
              deltaTone="mute"
            />
            <Kpi
              label="Открытых вакансий"
              value={stats.data.open_vacancies}
              delta={
                stats.data.burning_vacancies
                  ? `${stats.data.burning_vacancies} ${plural(stats.data.burning_vacancies, "горит", "горят", "горят")} к 1 сентября`
                  : "все в срок"
              }
              deltaTone={stats.data.burning_vacancies ? "warn" : "good"}
            />
            <Kpi
              label="Отсев на испытательном"
              value={stats.data.probation_dropout}
              unit="%"
              delta={
                stats.data.probation_dropout_delta
                  ? `▲ ${stats.data.probation_dropout_delta} пункта`
                  : "без изменений"
              }
              deltaTone={stats.data.probation_dropout_delta > 0 ? "crit" : "good"}
            />
          </div>
        )
      )}

      {/* Требует внимания. Тишина — это ошибка, и у неё есть имя ответственного. */}
      <section className="mt-8">
        <h2 className="mb-3 font-display text-[20px] font-semibold tracking-[-0.01em]">
          Требует внимания
        </h2>
        {breaches.loading ? (
          <Skeleton className="h-24 w-full" />
        ) : (breaches.data ?? []).length === 0 ? (
          <Card>
            <p className="m-0 text-[13.5px] text-ink-2">
              Просроченных решений нет. Все сроки по откликам в норме.
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {(breaches.data ?? []).map((b) => (
              <Card key={b.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <AlertTriangle className="mt-[2px] h-4 w-4 shrink-0 text-crit" />
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold">
                      <Link to={`/applications/${b.application_id}`}>{b.candidate_name}</Link>
                      <span className="font-normal text-ink-3"> · {b.vacancy_title}</span>
                    </div>
                    <div className="mt-[2px] text-[12.5px] text-ink-2">
                      Ждёт решения от «{b.responsible_name}». Кандидат уходит к тому, кто ответил первым.
                    </div>
                  </div>
                </div>
                <Tag tone="crit">
                  просрочено на {Math.round(b.hours_overdue)} ч · эскалация
                </Tag>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Где ломается воронка */}
      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="m-0 font-display text-[20px] font-semibold tracking-[-0.01em]">
            Где ломается воронка
          </h2>
          <Select
            aria-label="Вакансия для разбора воронки"
            className="max-w-[300px]"
            value={selected?.id ?? ""}
            onChange={(e) => setFunnelVacancy(e.target.value)}
          >
            {list.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </Select>
        </div>
        {selected && <Funnel vacancyId={selected.id} />}
      </section>
    </>
  );
}

/**
 * Каждая полоса подписана числом и долей, поэтому график читается и без цвета.
 * Под графиком — вывод словами: сам по себе он ничего не решает.
 */
export function Funnel({ vacancyId }: { vacancyId: string }) {
  const funnel = useAsync(() => api.getFunnel(vacancyId), [vacancyId]);
  if (funnel.loading) return <Skeleton className="h-56 w-full" />;

  const rows = funnel.data ?? [];
  const top = rows[0]?.ever_reached ?? 0;
  if (!top) {
    return (
      <Card>
        <p className="m-0 text-[13.5px] text-ink-2">
          По этой вакансии ещё нет движения — считать конверсию не из чего.
        </p>
      </Card>
    );
  }

  // Самый резкий обрыв ищем по абсолютной потере: она важнее процента
  let worst = { name: "", lost: 0, from: "" };
  rows.forEach((r, i) => {
    if (i === 0) return;
    const lost = rows[i - 1].ever_reached - r.ever_reached;
    if (lost > worst.lost) worst = { name: r.stage_name, lost, from: rows[i - 1].stage_name };
  });

  return (
    <Card>
      <div className="flex flex-col gap-[7px]">
        {rows.map((r) => {
          const share = (r.ever_reached / top) * 100;
          return (
            <div
              key={r.stage_id}
              className="grid grid-cols-[100px_minmax(0,1fr)_86px] items-center gap-3 sm:grid-cols-[132px_minmax(0,1fr)_96px]"
            >
              <span className="truncate text-[13px] text-ink-2">{r.stage_name}</span>
              <div className="h-[22px] overflow-hidden rounded-sm bg-surface-2">
                <div
                  className="h-full rounded-r-sm border-r-2 border-surface"
                  style={{
                    width: `${Math.max(share, 0.6)}%`,
                    background: `hsl(var(--${r.color_token}))`,
                  }}
                />
              </div>
              <span className="text-right font-mono text-[12.5px] tabular-nums text-ink-2">
                {r.ever_reached} · {share.toFixed(share < 10 ? 1 : 0)}%
              </span>
            </div>
          );
        })}
      </div>

      {worst.lost > 0 && (
        <p className="m-0 mt-[18px] text-[13px] text-ink-2">
          Самый резкий обрыв — между этапами «{worst.from}» и «{worst.name}»:{" "}
          {worst.lost} {plural(worst.lost, "человек не дошёл", "человека не дошли", "человек не дошли")}.
        </p>
      )}
    </Card>
  );
}
