import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Check, Send, Sparkles } from "lucide-react";
import * as api from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, Button, Card, Select, Skeleton, Tag } from "@/components/ui";
import { EmptyState, PageHeader } from "@/components/app/primitives";
import { GRADE_LABEL } from "@/lib/types";
import type { ArchiveMatch } from "@/lib/types";
import { dateRu, daysSince, daysWord } from "@/lib/utils";

/**
 * Подбор из архива под открытую вакансию (фишка 9).
 *
 * «Открыли вакансию — система сама приносит пятерых из базы, с историей
 * общения и причиной прошлого отказа». Это то, ради чего вообще имеет
 * смысл держать свою базу, а не жить на hh.
 *
 * Каждое предложение объяснено словами, и рядом честно показано, что мешает.
 * Подбор без возражений — это реклама, а не подбор.
 */
const SEGMENT_VIEW = {
  not_now: { tone: "info" as const, label: "Не сейчас" },
  not_our_profile: { tone: "mute" as const, label: "Не наш профиль" },
  not_ready: { tone: "warn" as const, label: "Не готов" },
  stop_list: { tone: "crit" as const, label: "Стоп-лист" },
};

export default function Archive() {
  const { profile } = useAuth();
  const [vacancyId, setVacancyId] = useState("");
  const [invited, setInvited] = useState<Record<string, string>>({});

  const vacancies = useAsync(() => api.listVacancies(), []);
  const list = (vacancies.data ?? []).filter((v) =>
    ["published", "approved"].includes(v.status),
  );
  const vacancy = list.find((v) => v.id === vacancyId) ?? list[0];

  const matches = useAsync(
    () => (vacancy ? api.getArchiveMatches(vacancy.id, 6) : Promise.resolve([])),
    [vacancy?.id],
  );

  async function invite(m: ArchiveMatch) {
    // Приглашение — это касание. Лимит проверяем ещё раз перед отправкой:
    // между загрузкой экрана и нажатием могло пройти время.
    const ok = await api.canTouchCandidate(m.candidate.id);
    if (!ok) {
      setInvited((s) => ({
        ...s,
        [m.candidate.id]: "Лимит касаний исчерпан — на этой неделе писать нельзя",
      }));
      return;
    }
    setInvited((s) => ({
      ...s,
      [m.candidate.id]: `Приглашение ушло в Телеграм от имени «${profile?.full_name}». Ответ придёт во «Переписку».`,
    }));
  }

  return (
    <>
      <PageHeader
        eyebrow="Наша база, а не job-борд"
        title="Подбор из архива"
        description="Люди, которые уже проходили наш отбор. Закрытие отсюда дешевле: мы не платим за публикацию и не разбираем поток откликов заново."
        actions={
          <Select
            aria-label="Вакансия"
            className="max-w-[320px]"
            value={vacancy?.id ?? ""}
            onChange={(e) => setVacancyId(e.target.value)}
          >
            {list.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </Select>
        }
      />

      {matches.loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (matches.data ?? []).length === 0 ? (
        <EmptyState
          title="Под эту вакансию в базе никого"
          description="Совпадений по направлению, уровню и городу не нашлось — либо все подходящие уже в воронке этой вакансии. Для нового направления это нормально: база набирается за пару месяцев."
        />
      ) : (
        <>
          <Card className="mb-4 flex items-start gap-3 border-l-[3px] border-l-primary">
            <Sparkles className="mt-[2px] h-5 w-5 shrink-0 text-primary" />
            <p className="m-0 text-[13.5px] text-ink-2">
              Подбор идёт по направлению, уровню, городу, опыту и ожиданиям по
              деньгам, а сегмент прошлого отказа — отдельный вес: люди из «не сейчас»
              подходили нам и раньше, просто места не было. Стоп-лист исключён
              жёстко, кандидаты без согласия на обработку данных — тоже.
            </p>
          </Card>

          <div className="flex flex-col gap-4">
            {(matches.data ?? []).map((m) => (
              <MatchCard
                key={m.candidate.id}
                match={m}
                note={invited[m.candidate.id]}
                onInvite={() => invite(m)}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function MatchCard({
  match, note, onInvite,
}: {
  match: ArchiveMatch;
  note?: string;
  onInvite: () => void;
}) {
  const { candidate: c, reasons, blockers, lastRejection, canTouch } = match;
  const t = c.profile;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar name={c.full_name} size="lg" />
          <div className="min-w-0">
            <h2 className="m-0 font-display text-[18px] font-semibold leading-tight tracking-[-0.01em]">
              {c.full_name}
            </h2>
            <div className="mt-1 text-[12.5px] text-ink-3">
              {[
                t?.specialization,
                t?.grades.map((g) => GRADE_LABEL[g]).join(", "),
                c.city,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
            {lastRejection && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Tag tone={SEGMENT_VIEW[lastRejection.segment].tone}>
                  {SEGMENT_VIEW[lastRejection.segment].label}
                </Tag>
                <span className="text-[12px] text-ink-3">
                  {lastRejection.reason} · {dateRu(lastRejection.when)}, это{" "}
                  {daysSince(lastRejection.when)} {daysWord(daysSince(lastRejection.when))} назад
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-good">
            Почему предлагаем
          </div>
          <ul className="m-0 flex list-none flex-col gap-[6px] p-0">
            {reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] text-ink-2">
                <Check className="mt-[2px] h-[13px] w-[13px] shrink-0 text-good" />
                {r}
              </li>
            ))}
          </ul>
        </div>

        {blockers.length > 0 && (
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-warn">
              Что мешает
            </div>
            <ul className="m-0 flex list-none flex-col gap-[6px] p-0">
              {blockers.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-ink-2">
                  <AlertTriangle className="mt-[2px] h-[13px] w-[13px] shrink-0 text-warn" />
                  {b}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        {note ? (
          <Tag tone={canTouch ? "good" : "warn"}>{note}</Tag>
        ) : (
          <>
            <Button onClick={onInvite} disabled={!canTouch || !c.consent_pd_granted}>
              <Send className="h-4 w-4" /> Позвать на эту вакансию
            </Button>
            <Link to={`/candidates`}>
              <Button variant="ghost">Открыть карточку</Button>
            </Link>
            {!c.consent_pd_granted && (
              <span className="text-[12.5px] text-crit">
                Писать нельзя: нет согласия на обработку данных
              </span>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
