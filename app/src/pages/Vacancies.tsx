import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import * as api from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/hooks/useAuth";
import {
  Card, Skeleton, Table, TableWrap, Tabs, Tag, Td, Th,
} from "@/components/ui";
import { EmptyState, PageHeader, StageChip } from "@/components/app/primitives";
import { Funnel } from "./Dashboard";
import {
  PRIORITY_LABEL, VACANCY_STATUS_LABEL, type VacancyPriority, type VacancyStatus,
} from "@/lib/types";
import { daysSince, daysWord, dateRu, money } from "@/lib/utils";

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
          description="Здесь появятся вакансии, как только их согласуют и опубликуют."
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
                      {v.grades && <div className="text-xs text-ink-3">{v.grades}</div>}
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
          { id: "funnel", label: "Воронка" },
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
                <Info label="Классы">{v.grades ?? "—"}</Info>
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
