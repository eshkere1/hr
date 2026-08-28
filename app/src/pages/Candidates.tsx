import { useState } from "react";
import { Search, Sparkles } from "lucide-react";
import * as api from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import {
  Button, Card, Input, Skeleton, Table, TableWrap, Tag, Td, Th,
} from "@/components/ui";
import { CandidateLine, EmptyState, PageHeader } from "@/components/app/primitives";
import { daysSince, daysWord } from "@/lib/utils";

/**
 * База педагогов.
 *
 * Ради этого экрана всё и затевалось: «нет своей базы резюме, чтобы в любой
 * момент позвонить и пригласить человека». Поиск — на обычном языке,
 * а не набор фильтров: HR не должна собирать boolean-запрос.
 */
const EXAMPLES = [
  "математика Краснодар",
  "программирование",
  "начальная школа",
  "физика ЕГЭ",
];

export default function Candidates() {
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const candidates = useAsync(() => api.listCandidates(applied), [applied]);

  const list = candidates.data ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Наши данные, не hh"
        title="База педагогов"
        description="Все, кто когда-либо к нам приходил, с историей общения и причиной прошлого отказа. Отсюда закрывается вакансия без публикации."
      />

      <Card className="mb-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setApplied(query);
          }}
          className="flex flex-wrap gap-2"
        >
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Например: математика, 5–9 класс, Краснодар"
              aria-label="Поиск по базе"
              className="pl-9"
            />
          </div>
          <Button type="submit">Найти</Button>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
          <Sparkles className="h-3 w-3" />
          Спросите как человека:
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => {
                setQuery(ex);
                setApplied(ex);
              }}
              className="rounded-sm border border-border bg-surface-2 px-2 py-[2px] hover:border-border-strong hover:text-ink"
            >
              {ex}
            </button>
          ))}
        </div>
      </Card>

      {candidates.loading ? (
        <Skeleton className="h-56 w-full" />
      ) : list.length === 0 ? (
        <EmptyState
          title="По этому запросу никого нет"
          description="Попробуйте назвать предмет или город отдельным словом — поиск смотрит и в резюме тоже."
        />
      ) : (
        <>
          <div className="mb-2 text-[12.5px] text-ink-3">
            Найдено: <span className="font-mono tabular-nums">{list.length}</span>
          </div>
          <TableWrap>
            <Table className="min-w-[760px]">
              <thead>
                <tr>
                  <Th>Педагог</Th>
                  <Th>Предметы</Th>
                  <Th>Город</Th>
                  <Th className="text-right">Опыт</Th>
                  <Th className="text-right">С детьми</Th>
                  <Th>Активность</Th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-2">
                    <Td>
                      <CandidateLine
                        name={c.full_name}
                        subtitle={c.current_employer ? `сейчас: ${c.current_employer}` : undefined}
                      />
                      {c.is_blacklisted && (
                        <Tag tone="crit" className="mt-1">Стоп-лист</Tag>
                      )}
                      {c.hide_from_current_employer && (
                        <Tag tone="info" className="mt-1">Скрыт от работодателя</Tag>
                      )}
                    </Td>
                    <Td className="text-ink-2">{c.teacher?.subjects.join(", ") ?? "—"}</Td>
                    <Td className="text-ink-2">{c.city ?? "—"}</Td>
                    <Td className="text-right font-mono tabular-nums">
                      {c.teacher?.total_experience_years ?? "—"}
                    </Td>
                    <Td className="text-right font-mono tabular-nums">
                      {c.teacher?.years_with_children ?? "—"}
                    </Td>
                    <Td className="text-[12.5px] text-ink-3">
                      {c.last_activity_at
                        ? `${daysSince(c.last_activity_at)} ${daysWord(daysSince(c.last_activity_at))} назад`
                        : "—"}
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
