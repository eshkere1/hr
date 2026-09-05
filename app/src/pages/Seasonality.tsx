import { useMemo } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import * as api from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { Card, Skeleton, Table, TableWrap, Td, Th } from "@/components/ui";
import { PageHeader } from "@/components/app/primitives";
import { cn } from "@/lib/utils";

/**
 * Сезонность найма (фишка 54).
 *
 * Набор обычно планируют «когда стало больно» — то есть всегда с опозданием
 * на срок закрытия вакансии. А он в разные месяцы разный: в сентябре человека
 * находят за месяц, в июле — за два.
 *
 * Экран отвечает на один вопрос: когда начинать искать, чтобы выйти вовремя.
 * Считается по фактам из базы, а не по ощущениям.
 */
const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

/**
 * Падежи. «Дольше всего закрываются в июль» — фраза, из-за которой текст
 * перестают читать: если система не умеет говорить по-русски, ей не верят
 * и в остальном.
 */
const MONTHS_IN = [
  "январе", "феврале", "марте", "апреле", "мае", "июне",
  "июле", "августе", "сентябре", "октябре", "ноябре", "декабре",
];

const MONTHS_FROM = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

export default function Seasonality() {
  const rows = useAsync(() => api.getSeasonality(), []);
  const data = rows.data ?? [];

  const insight = useMemo(() => {
    if (data.length === 0) return null;
    const withData = data.filter((d) => d.avg_days_to_close > 0);
    if (withData.length < 2) return null;

    const slowest = withData.reduce((a, b) => (b.avg_days_to_close > a.avg_days_to_close ? b : a));
    const fastest = withData.reduce((a, b) => (b.avg_days_to_close < a.avg_days_to_close ? b : a));
    const peakLeaving = data.reduce((a, b) => (b.left_company > a.left_company ? b : a));

    return { slowest, fastest, peakLeaving };
  }, [data]);

  const maxOpened = Math.max(1, ...data.map((d) => d.vacancies_opened));
  const maxDays = Math.max(1, ...data.map((d) => d.avg_days_to_close));

  if (rows.loading) return <Skeleton className="h-64 w-full" />;

  return (
    <>
      <PageHeader
        eyebrow="Итоги"
        title="Сезонность найма"
        description="Когда начинать искать, чтобы выйти вовремя. Набор обычно планируют «когда стало больно» — то есть всегда с опозданием на срок закрытия, а он в разные месяцы разный."
      />

      {insight && (
        <Card className="mb-5 border-l-[3px] border-l-primary">
          <p className="m-0 max-w-[80ch] text-[13.5px] text-ink-2">
            Дольше всего вакансии закрываются в{" "}
            <b className="text-ink">{MONTHS_IN[insight.slowest.month_no - 1]}</b> —
            в среднем {insight.slowest.avg_days_to_close} дней, против{" "}
            {insight.fastest.avg_days_to_close} в{" "}
            {MONTHS_IN[insight.fastest.month_no - 1]}. Больше всего людей
            уходит в <b className="text-ink">{MONTHS_IN[insight.peakLeaving.month_no - 1]}</b>.
          </p>
          <p className="m-0 mt-2 max-w-[80ch] text-[13.5px] text-ink-2">
            Значит, замену на этот отток стоит искать с{" "}
            <b className="text-ink">
              {/* Отсчёт назад на средний срок закрытия, а не «на глазок»:
                  чтобы выйти в нужный месяц, начинать надо настолько раньше,
                  сколько вакансия обычно висит. */}
              {MONTHS_FROM[
                (insight.peakLeaving.month_no - 1
                  - Math.max(1, Math.round(insight.slowest.avg_days_to_close / 30))
                  + 12) % 12
              ]}
            </b>
            : иначе вакансия откроется в самый медленный месяц и провисит вдвое дольше.
          </p>
        </Card>
      )}

      <div className="mb-5 flex flex-col gap-[6px]">
        {data.map((d) => {
          const slow = d.avg_days_to_close > 0 && d.avg_days_to_close >= maxDays * 0.85;
          return (
            <div key={d.month_no} className="flex items-center gap-3">
              <span className="w-[76px] shrink-0 text-[12.5px] text-ink-2">
                {MONTHS[d.month_no - 1]}
              </span>

              <span className="flex h-6 min-w-0 flex-1 items-center gap-2">
                <span
                  className="h-5 rounded-sm bg-primary"
                  style={{ width: `${Math.max(2, (d.vacancies_opened / maxOpened) * 100)}%` }}
                  aria-hidden="true"
                />
                <span className="shrink-0 font-mono text-[11.5px] text-ink-3">
                  {d.vacancies_opened} вак.
                </span>
              </span>

              <span
                className={cn(
                  "w-[92px] shrink-0 text-right font-mono text-[12px]",
                  slow ? "font-semibold text-warn" : "text-ink-3",
                )}
              >
                {d.avg_days_to_close > 0 ? `${d.avg_days_to_close} дн.` : "—"}
              </span>
            </div>
          );
        })}
      </div>

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th>Месяц</Th>
              <Th>Открыли вакансий</Th>
              <Th>Вышли на работу</Th>
              <Th>Уволились</Th>
              <Th>Средний срок закрытия</Th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month_no}>
                <Td>{MONTHS[d.month_no - 1]}</Td>
                <Td>{d.vacancies_opened}</Td>
                <Td>
                  <span className="inline-flex items-center gap-1">
                    <TrendingUp className="h-[13px] w-[13px] text-good" />
                    {d.hired}
                  </span>
                </Td>
                <Td>
                  <span className="inline-flex items-center gap-1">
                    <TrendingDown className="h-[13px] w-[13px] text-crit" />
                    {d.left_company}
                  </span>
                </Td>
                <Td>{d.avg_days_to_close > 0 ? `${d.avg_days_to_close} дн.` : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>

      <p className="mt-4 max-w-[80ch] text-[12.5px] text-ink-3">
        Цифры считаются по вашим данным: датам открытия и закрытия вакансий,
        выходам и увольнениям. Пока история короткая, выводы стоит читать
        осторожно — но чем дольше система работает, тем они точнее.
      </p>
    </>
  );
}
