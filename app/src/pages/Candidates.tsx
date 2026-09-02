import { useState } from "react";
import { Search, Sparkles } from "lucide-react";
import * as api from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import {
  Button, Card, Input, Skeleton, Table, TableWrap, Tag, Td, Th,
} from "@/components/ui";
import { CandidateLine, EmptyState, PageHeader } from "@/components/app/primitives";
import { describeQuery, parseQuery } from "@/lib/matching";
import { daysSince, daysWord } from "@/lib/utils";

/**
 * База кандидатов.
 *
 * Ради этого экрана всё и затевалось: «нет своей базы резюме, чтобы в любой
 * момент позвонить и пригласить человека». Поиск — на обычном языке,
 * а не набор фильтров: HR не должна собирать boolean-запрос.
 */
const EXAMPLES = [
  "python из Москвы",
  "продажи B2B",
  "аналитик, опыт от 5 лет",
  "готов выйти срочно",
];

export default function Candidates() {
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const candidates = useAsync(() => api.listCandidates(applied), [applied]);

  const list = candidates.data ?? [];

  // Что система поняла из фразы. Поиск без объяснения — чёрный ящик:
  // непонятно, пусто из-за отсутствия людей или из-за непонятого слова.
  const understood = applied.trim() ? describeQuery(parseQuery(applied)) : [];

  return (
    <>
      <PageHeader
        eyebrow="Наши данные, не hh"
        title="База кандидатов"
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
              placeholder="Например: опытный python, Москва, готов удалённо"
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
          description={
            understood.length
              ? `Искали по условиям: ${understood.join("; ")}. Попробуйте убрать одно из них — например, город.`
              : "Попробуйте назвать предмет или город отдельным словом — поиск смотрит и в резюме тоже."
          }
        />
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
            <span>
              Найдено: <span className="font-mono tabular-nums">{list.length}</span>
            </span>
            {understood.length > 0 && (
              <>
                <span>· поняли так:</span>
                {understood.map((u) => (
                  <span
                    key={u}
                    className="rounded-sm border border-border bg-surface-2 px-2 py-[1px] text-ink-2"
                  >
                    {u}
                  </span>
                ))}
              </>
            )}
          </div>
          <TableWrap>
            <Table className="min-w-[900px]">
              <thead>
                <tr>
                  <Th>Кандидат</Th>
                  <Th>Направление</Th>
                  <Th>Навыки</Th>
                  <Th>Город</Th>
                  <Th className="text-right">Всего опыт</Th>
                  <Th className="text-right">В направлении</Th>
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
                    <Td className="text-ink-2">{c.profile?.specialization ?? "—"}</Td>
                    <Td className="text-ink-2">{c.profile?.skills.join(", ") ?? "—"}</Td>
                    <Td className="text-ink-2">{c.city ?? "—"}</Td>
                    <Td className="text-right font-mono tabular-nums">
                      {c.profile?.total_experience_years ?? "—"}
                    </Td>
                    <Td className="text-right font-mono tabular-nums">
                      {c.profile?.years_in_specialty ?? "—"}
                    </Td>
                    <Td className="text-[12.5px] text-ink-3">
                      {!c.last_activity_at
                        ? "—"
                        : daysSince(c.last_activity_at) === 0
                          ? "сегодня"
                          : `${daysSince(c.last_activity_at)} ${daysWord(daysSince(c.last_activity_at))} назад`}
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
