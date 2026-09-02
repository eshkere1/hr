import { useMemo, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import * as api from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { Button, CardSkeleton, Select, Tag } from "@/components/ui";
import {
  CriteriaMeter, EmptyState, PageHeader, SlaIndicator,
} from "@/components/app/primitives";
import type { Application, PipelineStage } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Канбан по вакансии.
 *
 * Колонки читаются из базы, а не заданы в коде: у разных должностей свои
 * воронки. Цвет этапа идёт полосой сверху колонки, карточки внутри остаются
 * белыми — иначе доска превращается в светофор и перестаёт читаться.
 */
export default function Pipeline() {
  const [vacancyId, setVacancyId] = useState<string>("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);

  const vacancies = useAsync(() => api.listVacancies(), []);
  const activeVacancy = useMemo(() => {
    const list = vacancies.data ?? [];
    return list.find((v) => v.id === vacancyId) ?? list.find((v) => v.status === "published") ?? list[0];
  }, [vacancies.data, vacancyId]);

  const stages = useAsync(
    () => (activeVacancy ? api.listStages(activeVacancy.pipeline_id) : Promise.resolve([])),
    [activeVacancy?.pipeline_id],
  );
  const applications = useAsync(
    () => (activeVacancy ? api.listApplications(activeVacancy.id) : Promise.resolve([])),
    [activeVacancy?.id],
  );

  const [toast, setToast] = useState<string | null>(null);

  /**
   * Перетаскивание не просто меняет колонку: у этапа есть автодействия
   * (фишка 10). Тестовое и кейс уходят сами — «отправляю вручную» было
   * отдельной строкой в списке болей HR.
   */
  async function drop(stageId: string) {
    setOverStage(null);
    if (!dragId) return;
    const id = dragId;
    setDragId(null);

    await api.moveApplication(id, stageId);
    const done = await api.runStageAutoActions(id, stageId);
    if (done.length) setToast(done.join(". "));
    applications.reload();
  }

  const byStage = (stageId: string) =>
    (applications.data ?? []).filter(
      (a) => a.stage_id === stageId && a.status !== "rejected" && a.status !== "withdrawn",
    );

  const total = (applications.data ?? []).filter((a) => a.status === "active").length;

  return (
    <>
      <PageHeader
        eyebrow="Воронка отбора"
        title={activeVacancy?.title ?? "Воронка"}
        description={
          activeVacancy
            ? `${activeVacancy.department_name} · ${total} активных откликов. Перетащите карточку, чтобы двинуть человека по этапу.`
            : undefined
        }
        actions={
          <Select
            aria-label="Вакансия"
            className="max-w-[320px]"
            value={activeVacancy?.id ?? ""}
            onChange={(e) => setVacancyId(e.target.value)}
          >
            {(vacancies.data ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.title} · {v.department_name}
              </option>
            ))}
          </Select>
        }
      />

      {toast && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-border border-l-[3px] border-l-good bg-surface px-4 py-3 shadow-sh-1">
          <p className="m-0 text-[13.5px] text-ink-2">{toast}</p>
          <button
            onClick={() => setToast(null)}
            className="shrink-0 text-[12px] text-ink-3 hover:text-ink"
          >
            Понятно
          </button>
        </div>
      )}

      {applications.loading || stages.loading ? (
        <div className="flex gap-3">
          {[0, 1, 2, 3].map((i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : total === 0 ? (
        <EmptyState
          title="Откликов пока нет"
          description="Вакансия опубликована недавно. Обычно первые отклики приходят в течение дня — а пока можно поднять архив."
          action={<Button size="sm">Подобрать 5 кандидатов из базы</Button>}
        />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {(stages.data ?? []).map((stage) => (
            <Column
              key={stage.id}
              stage={stage}
              apps={byStage(stage.id)}
              isOver={overStage === stage.id}
              onDragOver={(e) => {
                e.preventDefault();
                setOverStage(stage.id);
              }}
              onDragLeave={() => setOverStage((s) => (s === stage.id ? null : s))}
              onDrop={() => drop(stage.id)}
              onDragStart={setDragId}
            />
          ))}
        </div>
      )}
    </>
  );
}

function Column({
  stage, apps, isOver, onDragOver, onDragLeave, onDrop, onDragStart,
}: {
  stage: PipelineStage;
  apps: Application[];
  isOver: boolean;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onDragStart: (id: string) => void;
}) {
  return (
    <section
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      aria-label={stage.name}
      className={cn(
        "w-[268px] shrink-0 overflow-hidden rounded-lg border bg-surface-2 transition-colors",
        isOver ? "border-primary bg-primary-soft" : "border-border",
      )}
    >
      <header
        className="flex items-center justify-between border-t-[3px] bg-surface px-[13px] py-[11px]"
        style={{ borderTopColor: `hsl(var(--${stage.color_token}))` }}
      >
        <b className="text-[13px]">{stage.name}</b>
        <span className="font-mono text-xs tabular-nums text-ink-3">{apps.length}</span>
      </header>

      <div className="flex flex-col gap-[9px] p-[10px]">
        {apps.length === 0 ? (
          <p className="px-1 py-3 text-center text-[12px] text-ink-3">
            {stage.code === "new"
              ? "Новых откликов нет"
              : "Пусто. Перетащите сюда карточку"}
          </p>
        ) : (
          apps.map((a) => (
            <MiniCard key={a.id} app={a} onDragStart={() => onDragStart(a.id)} />
          ))
        )}
      </div>
    </section>
  );
}

/**
 * Карточка на доске несёт ровно четыре вещи: кто, по какой роли,
 * сколько критериев закрыто и сколько осталось до срока ответа.
 * Всё остальное — в карточке отклика.
 */
function MiniCard({ app, onDragStart }: { app: Application; onDragStart: () => void }) {
  return (
    <Link
      to={`/applications/${app.id}`}
      draggable
      onDragStart={onDragStart}
      className="flex cursor-grab flex-col gap-2 rounded-md border border-border bg-surface p-[11px] text-ink no-underline hover:border-border-strong hover:no-underline active:cursor-grabbing"
    >
      <div>
        <div className="text-[13.5px] font-semibold leading-tight">{app.candidate_name}</div>
        {app.subtitle && <div className="mt-[2px] text-xs text-ink-3">{app.subtitle}</div>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <CriteriaMeter met={app.criteria_met} total={app.criteria_total} />
        {app.status === "on_hold" ? (
          <Tag tone="crit">Стоп-лист</Tag>
        ) : (
          <SlaIndicator dueAt={app.sla_due_at} startedAt={app.stage_entered_at} compact />
        )}
      </div>
    </Link>
  );
}
