import { Check, Circle, Clock, Download, Trash2 } from "lucide-react";
import * as api from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/hooks/useAuth";
import { Button, Card, Skeleton, Tag } from "@/components/ui";
import { EmptyState, PageHeader } from "@/components/app/primitives";
import { DOCUMENT_LABEL } from "@/lib/types";
import { cn, dateRu, dateTimeRu } from "@/lib/utils";

/**
 * Кабинет кандидата.
 *
 * В жизни он живёт в Телеграме — сюда заходит редко. Поэтому экран отвечает
 * ровно на три вопроса: где я сейчас, сколько ждать и что от меня нужно.
 * Тишина после отклика — главная боль кандидата, и мы её закрываем сроком.
 */
export default function MyStatus() {
  const { profile } = useAuth();
  const applications = useAsync(() => api.listApplications(), []);
  const stages = useAsync(() => api.listStages(), []);

  // В настоящей базе RLS вернёт только свои отклики. В демо показываем
  // отклики Ирины Ковалёвой — под этой ролью мы и входим.
  const mine = (applications.data ?? []).filter(
    (a) => a.candidate_name === profile?.full_name,
  );
  const list = mine.length ? mine : (applications.data ?? []).slice(0, 1);

  if (applications.loading) return <Skeleton className="h-64 w-full" />;

  return (
    <>
      <PageHeader
        eyebrow="Ваш отклик"
        title="Мой статус"
        description="Здесь всегда видно, на каком вы этапе и сколько ждать ответа. Если срок вышел — это наша проблема, не ваша."
      />

      {list.length === 0 ? (
        <EmptyState
          title="Откликов пока нет"
          description="Как только вы откликнетесь на вакансию, статус появится здесь и продублируется в Телеграме."
        />
      ) : (
        <div className="flex flex-col gap-5">
          {list.map((a) => {
            const all = stages.data ?? [];
            const current = all.find((s) => s.id === a.stage_id);
            const currentIndex = current?.order_index ?? 1;

            return (
              <Card key={a.id} className="flex flex-col gap-5">
                <div>
                  <h2 className="m-0 font-display text-[19px] font-semibold tracking-[-0.01em]">
                    {a.vacancy_title}
                  </h2>
                  <div className="mt-1 text-[12.5px] text-ink-3">
                    Отклик от {dateRu(a.applied_at)}
                  </div>
                </div>

                {/* Путь целиком: сколько этапов всего и где я на них */}
                <ol className="m-0 flex list-none flex-col gap-0 p-0">
                  {all.map((s) => {
                    const passed = s.order_index < currentIndex;
                    const isNow = s.id === a.stage_id;
                    return (
                      <li key={s.id} className="flex items-start gap-3">
                        <div className="flex flex-col items-center self-stretch">
                          <span
                            className={cn(
                              "grid h-6 w-6 shrink-0 place-items-center rounded-full border",
                              passed
                                ? "border-good bg-good text-white"
                                : isNow
                                  ? "border-primary bg-primary text-white"
                                  : "border-border bg-surface text-ink-3",
                            )}
                          >
                            {passed ? (
                              <Check className="h-[13px] w-[13px]" />
                            ) : isNow ? (
                              <Clock className="h-[13px] w-[13px]" />
                            ) : (
                              <Circle className="h-[7px] w-[7px]" />
                            )}
                          </span>
                          {s.order_index < all.length && (
                            <span
                              className={cn(
                                "w-px flex-1",
                                passed ? "bg-good" : "bg-border",
                              )}
                            />
                          )}
                        </div>

                        <div className={cn("pb-4", isNow ? "" : "opacity-80")}>
                          <div className={cn("text-[14px]", isNow && "font-semibold")}>
                            {s.name}
                          </div>
                          {isNow && (
                            <div className="mt-1 text-[13px] text-ink-2">
                              Вы здесь сейчас.
                              {a.sla_due_at && (
                                <> Ответ обещаем до {dateTimeRu(a.sla_due_at)}.</>
                              )}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

/**
 * Документы и права на свои данные.
 *
 * Кнопка «удалить мои данные» стоит здесь, а не мелким шрифтом в письме:
 * без права на забвение базу нельзя ни хранить, ни тем более использовать.
 */
export function MyDocuments() {
  const { profile } = useAuth();
  const candidates = useAsync(() => api.listCandidates(profile?.full_name ?? ""), [profile?.full_name]);
  const me = (candidates.data ?? [])[0];
  const docs = useAsync(
    () => (me ? api.listDocuments(me.id) : Promise.resolve([])),
    [me?.id],
  );

  return (
    <>
      <PageHeader
        eyebrow="Допуск к работе с детьми"
        title="Мои документы"
        description="Что уже принято, а что нужно донести. Файлы можно прислать прямо в чат бота — сюда заходить не обязательно."
      />

      {docs.loading ? (
        <Skeleton className="h-40 w-full" />
      ) : (docs.data ?? []).length === 0 ? (
        <EmptyState
          title="Пока ничего не загружено"
          description="Нужны справка об отсутствии судимости и медкнижка. Без них к детям не допустят — это закон, а не наше требование."
        />
      ) : (
        <Card className="mb-6 flex flex-col gap-3">
          {(docs.data ?? []).map((d) => (
            <div
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 last:border-0 last:pb-0"
            >
              <div>
                <div className="text-[14px] font-medium">{DOCUMENT_LABEL[d.kind]}</div>
                {d.expires_on && (
                  <div className="font-mono text-[11.5px] text-ink-3">
                    действует до {dateRu(d.expires_on)}
                  </div>
                )}
              </div>
              {d.state === "valid" && <Tag tone="good">Принят</Tag>}
              {d.state === "expiring" && <Tag tone="warn">Скоро истечёт — продлите</Tag>}
              {d.state === "expired" && <Tag tone="crit">Просрочен</Tag>}
              {d.state === "missing" && <Button size="sm" variant="secondary">Загрузить</Button>}
              {d.state === "pending" && <Tag tone="info">Проверяем</Tag>}
            </div>
          ))}
        </Card>
      )}

      <section>
        <h2 className="mb-3 font-display text-[19px] font-semibold tracking-[-0.01em]">
          Ваши данные
        </h2>
        <Card className="flex flex-col gap-4">
          <p className="m-0 text-[13.5px] text-ink-2">
            Мы храним ваше резюме, переписку и результаты заданий, чтобы вернуться
            к вам, когда появится подходящая вакансия. Согласие можно отозвать
            в любой момент — это не повлияет на текущий отбор.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm">
              <Download className="h-4 w-4" /> Скачать мои данные
            </Button>
            <Button variant="ghost" size="sm">Отозвать согласие</Button>
            <Button variant="danger" size="sm">
              <Trash2 className="h-4 w-4" /> Удалить мои данные
            </Button>
          </div>
        </Card>
      </section>
    </>
  );
}
