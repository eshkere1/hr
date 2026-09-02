import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Phone, PhoneOff, Search, Send, SkipForward, Users } from "lucide-react";
import * as api from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/hooks/useAuth";
import {
  Button, Card, Input, Modal, Select, Skeleton, Table, TableWrap, Tag, Td, Textarea, Th,
} from "@/components/ui";
import { EmptyState, PageHeader, StageChip } from "@/components/app/primitives";
import { describeQuery, parseQuery } from "@/lib/matching";
import { GRADE_LABEL, type Application, type Candidate, type PipelineStage } from "@/lib/types";
import { cn, daysSince, daysWord, initials, money } from "@/lib/utils";

/**
 * Все люди.
 *
 * Воронка отвечает на вопрос «что происходит с этой вакансией». Этот экран
 * отвечает на другой, который HR задаёт чаще: «покажи мне всех — и дай
 * быстро с ними связаться». Без него база остаётся набором вакансий,
 * а не базой людей.
 *
 * Здесь же живёт обзвон: отобрал фильтром, нажал одну кнопку и идёшь
 * по очереди, отмечая результат. Иначе «позвонить двадцати» превращается
 * в двадцать раз «открыть карточку, скопировать номер, вернуться».
 */
const PER_PAGE = 40;

type StatusFilter = "all" | "active" | "archive" | "base";

interface Row {
  candidate: Candidate;
  current: Application | null;
  stage: PipelineStage | null;
}

export default function People() {
  const { profile } = useAuth();
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [spec, setSpec] = useState("");
  const [city, setCity] = useState("");
  const [vacancyId, setVacancyId] = useState("");
  const [page, setPage] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [calling, setCalling] = useState(false);

  const candidates = useAsync(() => api.listCandidates(applied), [applied]);
  const applications = useAsync(() => api.listApplications(), []);
  const stages = useAsync(() => api.listStages(), []);
  const vacancies = useAsync(() => api.listVacancies(), []);

  const understood = applied.trim() ? describeQuery(parseQuery(applied)) : [];

  // Для каждого человека находим, где он сейчас: активный отклик важнее
  // архивного, свежий важнее старого.
  const rows: Row[] = useMemo(() => {
    const apps = applications.data ?? [];
    const st = stages.data ?? [];
    const byCandidate = new Map<string, Application[]>();
    apps.forEach((a) => {
      const list = byCandidate.get(a.candidate_id) ?? [];
      list.push(a);
      byCandidate.set(a.candidate_id, list);
    });

    return (candidates.data ?? []).map((c) => {
      const mine = (byCandidate.get(c.id) ?? []).sort((a, b) => {
        const activeA = a.status === "active" ? 1 : 0;
        const activeB = b.status === "active" ? 1 : 0;
        if (activeA !== activeB) return activeB - activeA;
        return b.applied_at.localeCompare(a.applied_at);
      });
      const current = mine[0] ?? null;
      return {
        candidate: c,
        current,
        stage: current ? st.find((s) => s.id === current.stage_id) ?? null : null,
      };
    });
  }, [candidates.data, applications.data, stages.data]);

  const specs = useMemo(
    () => [...new Set(rows.map((r) => r.candidate.profile?.specialization).filter(Boolean))].sort() as string[],
    [rows],
  );
  const cities = useMemo(
    () => [...new Set(rows.map((r) => r.candidate.city).filter(Boolean))].sort() as string[],
    [rows],
  );

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (status === "active" && r.current?.status !== "active") return false;
        if (status === "archive" && !r.current?.archive_segment) return false;
        if (status === "base" && r.current) return false;
        if (spec && r.candidate.profile?.specialization !== spec) return false;
        if (city && r.candidate.city !== city) return false;
        if (vacancyId && r.current?.vacancy_id !== vacancyId) return false;
        return true;
      }),
    [rows, status, spec, city, vacancyId],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const shown = filtered.slice(safePage * PER_PAGE, (safePage + 1) * PER_PAGE);

  const pickedRows = filtered.filter((r) => picked.has(r.candidate.id));
  const callable = pickedRows.filter((r) => r.candidate.phones.length > 0);

  function toggle(id: string) {
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function reset() {
    setStatus("all");
    setSpec("");
    setCity("");
    setVacancyId("");
    setPage(0);
  }

  const loading = candidates.loading || applications.loading;

  return (
    <>
      <PageHeader
        eyebrow="Наши данные, не job-борд"
        title="Все люди"
        description="Каждый, кто когда-либо к нам приходил, в одном списке — независимо от вакансии и этапа. Отсюда звонят, пишут и поднимают архив."
        actions={
          callable.length > 0 && (
            <Button onClick={() => setCalling(true)}>
              <Phone className="h-4 w-4" /> Обзвонить выбранных: {callable.length}
            </Button>
          )
        }
      />

      <Card className="mb-4 flex flex-col gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setApplied(query);
            setPage(0);
          }}
          className="flex flex-wrap gap-2"
        >
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Спросите как человека: опытный python из Москвы, готов удалённо"
              aria-label="Поиск по базе"
              className="pl-9"
            />
          </div>
          <Button type="submit">Найти</Button>
        </form>

        <div className="flex flex-wrap gap-2">
          <Select
            aria-label="Где человек сейчас"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as StatusFilter);
              setPage(0);
            }}
            className="max-w-[190px]"
          >
            <option value="all">Все</option>
            <option value="active">В работе сейчас</option>
            <option value="archive">В архиве после отказа</option>
            <option value="base">Просто в базе</option>
          </Select>

          <Select
            aria-label="Направление"
            value={spec}
            onChange={(e) => {
              setSpec(e.target.value);
              setPage(0);
            }}
            className="max-w-[180px]"
          >
            <option value="">Все направления</option>
            {specs.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>

          <Select
            aria-label="Город"
            value={city}
            onChange={(e) => {
              setCity(e.target.value);
              setPage(0);
            }}
            className="max-w-[180px]"
          >
            <option value="">Все города</option>
            {cities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>

          <Select
            aria-label="Вакансия"
            value={vacancyId}
            onChange={(e) => {
              setVacancyId(e.target.value);
              setPage(0);
            }}
            className="max-w-[240px]"
          >
            <option value="">Любая вакансия</option>
            {(vacancies.data ?? []).map((v) => (
              <option key={v.id} value={v.id}>{v.title}</option>
            ))}
          </Select>

          {(status !== "all" || spec || city || vacancyId) && (
            <Button variant="ghost" size="sm" onClick={reset}>
              Сбросить
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-[12.5px] text-ink-3">
          <Users className="h-[14px] w-[14px]" />
          <span>
            Всего в базе <b className="font-mono tabular-nums text-ink-2">{rows.length}</b>
            {filtered.length !== rows.length && (
              <> · подходит под фильтр <b className="font-mono tabular-nums text-ink-2">{filtered.length}</b></>
            )}
          </span>
          {understood.length > 0 && (
            <>
              <span>· поняли так:</span>
              {understood.map((u) => (
                <span key={u} className="rounded-sm border border-border bg-surface-2 px-2 py-[1px] text-ink-2">
                  {u}
                </span>
              ))}
            </>
          )}
        </div>
      </Card>

      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Под эти условия никто не подходит"
          description="Снимите один из фильтров — например, город. Поиск смотрит и в резюме тоже."
        />
      ) : (
        <>
          <TableWrap>
            <Table className="min-w-[1000px]">
              <thead>
                <tr>
                  <Th className="w-[36px]">
                    <input
                      type="checkbox"
                      aria-label="Выбрать всю страницу"
                      checked={shown.every((r) => picked.has(r.candidate.id))}
                      onChange={(e) =>
                        setPicked((s) => {
                          const next = new Set(s);
                          shown.forEach((r) =>
                            e.target.checked ? next.add(r.candidate.id) : next.delete(r.candidate.id),
                          );
                          return next;
                        })
                      }
                    />
                  </Th>
                  <Th>Человек</Th>
                  <Th>Направление</Th>
                  <Th>Где сейчас</Th>
                  <Th className="text-right">Критерии</Th>
                  <Th className="text-right">Ожидания</Th>
                  <Th>Активность</Th>
                  <Th className="text-right">Связаться</Th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <PersonRow
                    key={r.candidate.id}
                    row={r}
                    checked={picked.has(r.candidate.id)}
                    onToggle={() => toggle(r.candidate.id)}
                  />
                ))}
              </tbody>
            </Table>
          </TableWrap>

          {pageCount > 1 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-[12.5px] text-ink-3">
                Показаны{" "}
                <span className="font-mono tabular-nums">
                  {safePage * PER_PAGE + 1}–{Math.min((safePage + 1) * PER_PAGE, filtered.length)}
                </span>{" "}
                из <span className="font-mono tabular-nums">{filtered.length}</span>
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={safePage === 0}
                  onClick={() => setPage(safePage - 1)}
                >
                  Назад
                </Button>
                <span className="font-mono text-[12.5px] tabular-nums text-ink-2">
                  {safePage + 1} / {pageCount}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage(safePage + 1)}
                >
                  Дальше
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <CallQueue
        open={calling}
        rows={callable}
        authorName={profile?.full_name ?? "—"}
        onClose={() => setCalling(false)}
        onDone={() => {
          setCalling(false);
          setPicked(new Set());
        }}
      />
    </>
  );
}

function PersonRow({
  row, checked, onToggle,
}: {
  row: Row;
  checked: boolean;
  onToggle: () => void;
}) {
  const { candidate: c, current, stage } = row;
  const t = c.profile;
  const phone = c.phones[0];

  return (
    <tr className="hover:bg-surface-2">
      <Td>
        <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Выбрать ${c.full_name}`} />
      </Td>
      <Td>
        <div className="flex items-center gap-[9px]">
          <span
            aria-hidden="true"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border bg-primary-soft text-[11px] font-bold text-primary"
          >
            {initials(c.full_name)}
          </span>
          <div className="min-w-0">
            {current ? (
              <Link to={`/applications/${current.id}`} className="block truncate font-medium">
                {c.full_name}
              </Link>
            ) : (
              <span className="block truncate font-medium">{c.full_name}</span>
            )}
            <span className="block truncate font-mono text-[11.5px] text-ink-3">{phone ?? "телефона нет"}</span>
          </div>
        </div>
        {c.is_blacklisted && <Tag tone="crit" className="mt-1">Стоп-лист</Tag>}
      </Td>
      <Td className="text-ink-2">
        {t?.specialization ?? "—"}
        {t?.grades.length ? (
          <div className="text-[11.5px] text-ink-3">{GRADE_LABEL[t.grades[0]]}</div>
        ) : null}
      </Td>
      <Td>
        {!current ? (
          <span className="text-[12.5px] text-ink-3">Только в базе</span>
        ) : current.status === "active" && stage ? (
          <>
            <StageChip stage={stage} />
            <div className="mt-1 truncate text-[11.5px] text-ink-3">{current.vacancy_title}</div>
          </>
        ) : (
          <>
            <Tag tone="mute">
              {current.archive_segment === "not_now"
                ? "Не сейчас"
                : current.archive_segment === "not_ready"
                  ? "Не готов"
                  : current.archive_segment === "stop_list"
                    ? "Стоп-лист"
                    : "Не наш профиль"}
            </Tag>
            <div className="mt-1 truncate text-[11.5px] text-ink-3">{current.vacancy_title}</div>
          </>
        )}
      </Td>
      <Td className="text-right font-mono tabular-nums text-ink-2">
        {current ? `${current.criteria_met} из ${current.criteria_total}` : "—"}
      </Td>
      <Td className="text-right font-mono tabular-nums text-ink-2">{money(t?.expected_salary)}</Td>
      <Td className="text-[12.5px] text-ink-3">
        {!c.last_activity_at
          ? "—"
          : daysSince(c.last_activity_at) === 0
            ? "сегодня"
            : `${daysSince(c.last_activity_at)} ${daysWord(daysSince(c.last_activity_at))} назад`}
      </Td>
      <Td>
        <div className="flex items-center justify-end gap-1">
          {phone && (
            <a
              href={`tel:${phone.replace(/[^\d+]/g, "")}`}
              title={`Позвонить: ${phone}`}
              className="grid h-8 w-8 place-items-center rounded-md text-primary hover:bg-primary-soft"
            >
              <Phone className="h-4 w-4" />
            </a>
          )}
          <Link
            to="/inbox"
            title="Написать в Телеграм"
            className="grid h-8 w-8 place-items-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink"
          >
            <Send className="h-4 w-4" />
          </Link>
        </div>
      </Td>
    </tr>
  );
}

/**
 * Обзвон по очереди.
 *
 * «Как мне быстро им позвонить» — это не кнопка на карточке, а режим:
 * список перед глазами, номер крупно, три исхода и сразу следующий.
 * Итог обзвона остаётся в системе, а не в блокноте.
 */
function CallQueue({
  open, rows, onClose, onDone, authorName,
}: {
  open: boolean;
  rows: Row[];
  onClose: () => void;
  onDone: () => void;
  authorName: string;
}) {
  const [i, setI] = useState(0);
  const [note, setNote] = useState("");
  const [log, setLog] = useState<Record<string, string>>({});

  const row = rows[i];
  const done = i >= rows.length;

  async function mark(result: string) {
    if (!row) return;
    // Пропуск — не событие: писать в карточку «мы до вас не дошли» незачем.
    if (result !== "Пропущен") {
      await api.logCall(
        row.candidate.id,
        row.current?.id ?? null,
        result,
        note,
        authorName,
      );
    }
    setLog((l) => ({ ...l, [row.candidate.id]: result }));
    setNote("");
    setI(i + 1);
  }

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={done ? "Обзвон закончен" : `Обзвон · ${i + 1} из ${rows.length}`}
      footer={
        done ? (
          <Button size="sm" onClick={onDone}>Закрыть</Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={onClose}>Прервать</Button>
        )
      }
    >
      {done ? (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-sm text-ink-2">
            Итог каждого разговора записан в карточку человека и попал в счётчик
            касаний — второй звонок в ту же неделю система уже не даст сделать.
            Пропущенных не записываем: «мы до вас не дошли» не событие.
          </p>
          <div className="flex flex-col gap-2">
            {rows.map((r) => (
              <div
                key={r.candidate.id}
                className="flex items-center justify-between gap-2 border-b border-border pb-2 text-[13px] last:border-0"
              >
                <span>{r.candidate.full_name}</span>
                <Tag tone={log[r.candidate.id] === "Дозвонились" ? "good" : "mute"}>
                  {log[r.candidate.id] ?? "пропущен"}
                </Tag>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <div className="font-display text-[20px] font-semibold tracking-[-0.01em]">
              {row.candidate.full_name}
            </div>
            <div className="mt-1 text-[13px] text-ink-3">
              {[
                row.candidate.profile?.specialization,
                row.candidate.profile?.grades.length ? GRADE_LABEL[row.candidate.profile.grades[0]] : null,
                row.candidate.city,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>

          <a
            href={`tel:${row.candidate.phones[0].replace(/[^\d+]/g, "")}`}
            className="flex items-center justify-center gap-3 rounded-md bg-primary px-4 py-4 font-mono text-[20px] font-medium tabular-nums text-primary-foreground no-underline hover:bg-primary-strong hover:no-underline"
          >
            <Phone className="h-5 w-5" />
            {row.candidate.phones[0]}
          </a>

          {row.current && (
            <div className="rounded-md bg-surface-2 p-3 text-[12.5px] text-ink-2">
              {row.current.status === "active"
                ? `Сейчас в отборе: ${row.current.vacancy_title}`
                : `Прошлый отказ по вакансии «${row.current.vacancy_title}». Закрыл ${row.current.criteria_met} из ${row.current.criteria_total} критериев.`}
            </div>
          )}

          <Textarea
            placeholder="Что сказал — одна фраза. Попадёт в карточку"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="min-h-[56px]"
          />

          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void mark("Дозвонились")}>
              <Phone className="h-4 w-4" /> Дозвонились
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void mark("Не берёт")}>
              <PhoneOff className="h-4 w-4" /> Не берёт
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void mark("Пропущен")}>
              <SkipForward className="h-4 w-4" /> Пропустить
            </Button>
          </div>

          <div className="h-[3px] w-full overflow-hidden rounded-full bg-surface-3">
            <div
              className={cn("h-full rounded-full bg-primary transition-[width]")}
              style={{ width: `${(i / rows.length) * 100}%` }}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
