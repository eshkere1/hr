import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, MessageSquare, X } from "lucide-react";
import * as api from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/hooks/useAuth";
import { Button, Card, Modal, Skeleton, Tag } from "@/components/ui";
import {
  CriteriaMeter, EmptyState, PageHeader, SlaIndicator,
} from "@/components/app/primitives";
import { SOURCE_LABEL } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Стартовый экран руководителя подразделения.
 *
 * Он открывает его с телефона между делами, поэтому: сначала мобильная
 * вёрстка, критерии развёрнуты сразу без клика, три кнопки и ровно одно
 * обязательное поле на весь экран — причина отказа одним тапом.
 */
export default function WaitingForMe() {
  const { userId, profile } = useAuth();
  const waiting = useAsync(
    () => api.getWaitingForMe(userId ?? ""),
    [userId],
  );
  const [rejectFor, setRejectFor] = useState<{ id: string; name: string } | null>(null);

  const list = waiting.data ?? [];

  return (
    <>
      <PageHeader
        eyebrow={profile?.full_name}
        title="Ждут меня"
        description="Кандидаты, по которым нужно ваше решение. Пока вы молчите, они уходят к тому, кто ответил первым."
      />

      {waiting.loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          title="Все решения приняты"
          description="Сейчас от вас ничего не ждут. Как только кандидат дойдёт до интервью, он появится здесь — со сроком ответа."
          action={
            <Link to="/vacancies">
              <Button size="sm" variant="secondary">Посмотреть мои вакансии</Button>
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {list.map((a) => (
            <WaitingCard
              key={a.id}
              applicationId={a.id}
              name={a.candidate_name}
              vacancy={a.vacancy_title}
              subtitle={a.subtitle}
              met={a.criteria_met}
              total={a.criteria_total}
              slaDueAt={a.sla_due_at}
              stageEnteredAt={a.stage_entered_at}
              onReject={() => setRejectFor({ id: a.id, name: a.candidate_name })}
              onAccept={async () => {
                const stages = await api.listStages();
                const current = await api.getApplication(a.id);
                const cur = stages.find((s) => s.id === current?.stage_id);
                const next = stages.find((s) => s.order_index === (cur?.order_index ?? 0) + 1);
                if (next) await api.moveApplication(a.id, next.id);
                waiting.reload();
              }}
            />
          ))}
        </div>
      )}

      <RejectSheet
        open={Boolean(rejectFor)}
        name={rejectFor?.name ?? ""}
        onClose={() => setRejectFor(null)}
        onPick={async (reasonId) => {
          if (rejectFor) await api.rejectApplication(rejectFor.id, reasonId);
          setRejectFor(null);
          waiting.reload();
        }}
      />
    </>
  );
}

function WaitingCard({
  applicationId, name, vacancy, subtitle, met, total,
  slaDueAt, stageEnteredAt, onAccept, onReject,
}: {
  applicationId: string;
  name: string;
  vacancy: string;
  subtitle: string | null;
  met: number;
  total: number;
  slaDueAt: string | null;
  stageEnteredAt: string;
  onAccept: () => Promise<void>;
  onReject: () => void;
}) {
  // Критерии развёрнуты сразу: руководитель не станет никуда кликать
  const results = useAsync(() => api.listCriteriaResults(applicationId), [applicationId]);
  const interviews = useAsync(() => api.listInterviews(applicationId), [applicationId]);
  const summary = (interviews.data ?? []).find((i) => i.ai_summary)?.ai_summary;
  const [busy, setBusy] = useState(false);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 font-display text-[18px] font-semibold leading-tight tracking-[-0.01em]">
            <Link to={`/applications/${applicationId}`}>{name}</Link>
          </h2>
          <div className="mt-1 text-[12.5px] text-ink-3">
            {vacancy}
            {subtitle ? ` · ${subtitle}` : ""}
          </div>
        </div>
        <SlaIndicator dueAt={slaDueAt} startedAt={stageEnteredAt} />
      </div>

      <CriteriaMeter met={met} total={total} />

      {/* Основание, а не балл: сразу видно, чем закрыт каждый критерий */}
      {!results.loading && (results.data ?? []).length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {(results.data ?? []).slice(0, 4).map((r) => (
            <li key={r.id} className="flex items-start gap-[10px] text-[13px]">
              <span
                className={cn(
                  "mt-[3px] h-2 w-2 shrink-0 rounded-full",
                  r.result === "met" ? "bg-good"
                    : r.result === "partial" ? "bg-warn"
                    : r.result === "not_met" ? "bg-crit"
                    : "bg-surface-3",
                )}
              />
              <span className="min-w-0">
                <b className="font-medium">{r.criterion_name}</b>
                {r.evidence && (
                  <span className="block text-ink-2">
                    {r.evidence}{" "}
                    <span className="text-ink-3">· {SOURCE_LABEL[r.source]}</span>
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {summary && (
        <div className="rounded-md bg-surface-2 p-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-3">
            Саммари интервью
          </div>
          <p className="m-0 line-clamp-3 text-[13px] text-ink-2">{summary}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onAccept();
            setBusy(false);
          }}
        >
          <Check className="h-4 w-4" /> Зову дальше
        </Button>
        <Button variant="secondary" onClick={onReject}>
          <X className="h-4 w-4" /> Не подходит
        </Button>
        <Link to={`/applications/${applicationId}`}>
          <Button variant="ghost">
            <MessageSquare className="h-4 w-4" /> Обсудить с HR
          </Button>
        </Link>
      </div>
    </Card>
  );
}

/**
 * Причина отказа — одним тапом из списка, без свободного текста.
 * Это единственное обязательное поле на всём экране: без него архив
 * превращается в свалку, а кандидат остаётся без ответа.
 */
function RejectSheet({
  open, name, onClose, onPick,
}: {
  open: boolean;
  name: string;
  onClose: () => void;
  onPick: (reasonId: string) => Promise<void>;
}) {
  const reasons = useAsync(() => api.listRejectionReasons(), []);
  return (
    <Modal open={open} onClose={onClose} title={`Почему не подходит · ${name}`}>
      <p className="m-0 text-sm text-ink-2">
        Один тап. Текст для кандидата подставится сам — вы его не пишете.
      </p>
      <div className="flex flex-col gap-2">
        {(reasons.data ?? [])
          .filter((r) => r.segment !== "stop_list")
          .map((r) => (
            <button
              key={r.id}
              onClick={() => void onPick(r.id)}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-3 text-left text-[13.5px] hover:border-border-strong hover:bg-surface-2"
            >
              <span>{r.name}</span>
              <Tag tone="info">
                {
                  {
                    not_now: "Не сейчас",
                    not_our_profile: "Не наш профиль",
                    not_ready: "Не готов",
                    stop_list: "Стоп-лист",
                  }[r.segment]
                }
              </Tag>
            </button>
          ))}
      </div>
    </Modal>
  );
}
