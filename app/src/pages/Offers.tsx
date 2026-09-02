import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Send, X } from "lucide-react";
import * as api from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/hooks/useAuth";
import { Button, Card, Field, Input, Modal, Skeleton, Tag, Textarea } from "@/components/ui";
import { EmptyState, PageHeader } from "@/components/app/primitives";
import { renderTemplate } from "@/lib/matching";
import { offerTemplate } from "@/lib/demoData";
import { OFFER_STATUS_LABEL, type Offer, type OfferStatus } from "@/lib/types";
import { dateRu, money } from "@/lib/utils";

/**
 * Оффер внутри системы (фишка 39).
 *
 * Без этого воронка обрывается на самом дорогом шаге: оффер уходит письмом,
 * согласование теряется в переписке, а статус принятия никто не отслеживает.
 * Здесь у оффера есть состояние, срок ответа и видно, кто согласовал.
 */
const STATUS_TONE: Record<OfferStatus, "good" | "warn" | "info" | "mute" | "crit"> = {
  draft: "mute",
  pending_approval: "warn",
  approved: "info",
  sent: "info",
  accepted: "good",
  declined: "crit",
  expired: "crit",
  revoked: "mute",
};

export default function Offers() {
  const { profile, can } = useAuth();
  const offers = useAsync(() => api.listOffers(), []);
  const [creating, setCreating] = useState(false);

  const list = offers.data ?? [];
  const waiting = list.filter((o) => o.status === "pending_approval");
  const inFlight = list.filter((o) => ["approved", "sent"].includes(o.status));
  const closed = list.filter((o) => ["accepted", "declined", "expired", "revoked"].includes(o.status));

  async function act(offer: Offer, status: OfferStatus) {
    await api.setOfferStatus(offer.id, status, profile?.full_name ?? "—");
    offers.reload();
  }

  return (
    <>
      <PageHeader
        eyebrow="Финал воронки"
        title="Офферы"
        description="Шаблон, согласование, отправка и статус принятия в одном месте. Срок ответа виден всем, а не живёт в голове рекрутера."
        actions={
          can("hr_manager", "superuser") && (
            <Button onClick={() => setCreating(true)}>Подготовить оффер</Button>
          )
        }
      />

      {offers.loading ? (
        <Skeleton className="h-48 w-full" />
      ) : list.length === 0 ? (
        <EmptyState
          title="Офферов пока нет"
          description="Оффер готовится из карточки отклика, когда кандидат дошёл до последнего этапа."
          action={<Button size="sm" onClick={() => setCreating(true)}>Подготовить оффер</Button>}
        />
      ) : (
        <div className="flex flex-col gap-8">
          {waiting.length > 0 && (
            <Group title="Ждут согласования" hint="Пока оффер не согласован, кандидат его не видит.">
              {waiting.map((o) => (
                <OfferCard
                  key={o.id}
                  offer={o}
                  actions={
                    can("director", "superuser") ? (
                      <>
                        <Button size="sm" onClick={() => act(o, "approved")}>
                          <Check className="h-4 w-4" /> Согласовать
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => act(o, "draft")}>
                          Вернуть на доработку
                        </Button>
                      </>
                    ) : (
                      <Tag tone="warn">Ждём решения владельца</Tag>
                    )
                  }
                />
              ))}
            </Group>
          )}

          {inFlight.length > 0 && (
            <Group title="В работе" hint="Отправленный оффер — это обещание со сроком. Срок виден кандидату тоже.">
              {inFlight.map((o) => (
                <OfferCard
                  key={o.id}
                  offer={o}
                  actions={
                    o.status === "approved" ? (
                      <Button size="sm" onClick={() => act(o, "sent")}>
                        <Send className="h-4 w-4" /> Отправить в Телеграм
                      </Button>
                    ) : (
                      <>
                        <Button size="sm" onClick={() => act(o, "accepted")}>
                          <Check className="h-4 w-4" /> Принят
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => act(o, "declined")}>
                          <X className="h-4 w-4" /> Отказался
                        </Button>
                      </>
                    )
                  }
                />
              ))}
            </Group>
          )}

          {closed.length > 0 && (
            <Group title="Закрытые" hint="Отказы от оффера — самый дорогой отсев. По ним стоит смотреть отдельно.">
              {closed.map((o) => (
                <OfferCard key={o.id} offer={o} />
              ))}
            </Group>
          )}
        </div>
      )}

      <NewOfferModal
        open={creating}
        onClose={() => setCreating(false)}
        onDone={() => {
          setCreating(false);
          offers.reload();
        }}
      />
    </>
  );
}

function Group({
  title, hint, children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="m-0 font-display text-[20px] font-semibold tracking-[-0.01em]">{title}</h2>
      <p className="mb-3 mt-1 max-w-[64ch] text-[13px] text-ink-2">{hint}</p>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function OfferCard({ offer, actions }: { offer: Offer; actions?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="m-0 font-display text-[17px] font-semibold tracking-[-0.01em]">
            <Link to={`/applications/${offer.application_id}`}>{offer.candidate_name}</Link>
          </h3>
          <div className="mt-1 text-[12.5px] text-ink-3">{offer.vacancy_title}</div>
        </div>
        <Tag tone={STATUS_TONE[offer.status]}>{OFFER_STATUS_LABEL[offer.status]}</Tag>
      </div>

      <dl className="m-0 grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-3">
        <Pair label="Зарплата">
          <span className="font-mono tabular-nums">
            {money(offer.salary)} {offer.is_net ? "на руки" : "до вычета"}
          </span>
        </Pair>
        <Pair label="Нагрузка">
          {offer.weekly_hours ? `${offer.weekly_hours} ч в неделю` : "—"}
        </Pair>
        <Pair label="Выход">{dateRu(offer.start_date)}</Pair>
        <Pair label="Согласовал">{offer.approved_by_name ?? "—"}</Pair>
        <Pair label="Отправлен">{offer.sent_at ? dateRu(offer.sent_at) : "—"}</Pair>
        <Pair label="Ответ до">
          {offer.respond_by ? (
            <span className="font-medium text-warn">{dateRu(offer.respond_by)}</span>
          ) : (
            "—"
          )}
        </Pair>
      </dl>

      {offer.body_md && (
        <div>
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-[13px] text-primary hover:underline"
          >
            {open ? "Свернуть текст оффера" : "Показать текст оффера"}
          </button>
          {open && (
            <pre className="mt-2 whitespace-pre-wrap rounded-md bg-surface-2 p-3 font-sans text-[13px] leading-relaxed text-ink-2">
              {offer.body_md}
            </pre>
          )}
        </div>
      )}

      {actions && <div className="flex flex-wrap gap-2 border-t border-border pt-3">{actions}</div>}
    </Card>
  );
}

function Pair({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{label}</dt>
      <dd className="m-0 mt-[2px]">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Подготовка оффера. Текст собирается из шаблона — руками писать не нужно.
// ---------------------------------------------------------------------------
function NewOfferModal({
  open, onClose, onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { profile } = useAuth();
  const applications = useAsync(() => api.listApplications(), []);
  const vacancies = useAsync(() => api.listVacancies(), []);

  const [applicationId, setApplicationId] = useState("");
  const [salary, setSalary] = useState("");
  const [startDate, setStartDate] = useState("");
  const [respondBy, setRespondBy] = useState("");
  const [busy, setBusy] = useState(false);

  // На оффер имеет смысл звать тех, кто дошёл до последних этапов
  const eligible = (applications.data ?? []).filter(
    (a) => a.status === "active" && ["s5", "s6"].includes(a.stage_id),
  );
  const app = eligible.find((a) => a.id === applicationId) ?? eligible[0];
  const vacancy = (vacancies.data ?? []).find((v) => v.id === app?.vacancy_id);

  const band = vacancy?.compensation;
  const salaryNum = Number(salary) || band?.salary_max || 0;
  const overBand = band?.salary_max ? salaryNum - band.salary_max : 0;

  const body = app
    ? renderTemplate(offerTemplate, {
        candidate_name: app.candidate_name,
        position: vacancy?.title ?? "",
        department: vacancy?.department_name ?? "",
        salary: money(salaryNum),
        weekly_hours: String(vacancy?.weekly_hours ?? ""),
        work_format: vacancy?.city ? "в офисе" : "удалённо",
        start_date: startDate ? dateRu(startDate) : "",
        probation: "3",
        first_month: vacancy?.first_month_reality ?? "",
        respond_by: respondBy ? dateRu(respondBy) : "",
      })
    : "";

  async function submit() {
    if (!app) return;
    setBusy(true);
    await api.createOffer({
      application_id: app.id,
      candidate_name: app.candidate_name,
      vacancy_title: app.vacancy_title,
      salary: salaryNum,
      weekly_hours: vacancy?.weekly_hours ?? null,
      start_date: startDate,
      probation_months: 3,
      body_md: body,
      respond_by: respondBy,
      created_by_name: profile?.full_name ?? "—",
    });
    setBusy(false);
    onDone();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Подготовить оффер"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Отмена
          </Button>
          <Button size="sm" disabled={!app || !startDate || !respondBy || busy} onClick={submit}>
            Отправить на согласование
          </Button>
        </>
      }
    >
      {eligible.length === 0 ? (
        <p className="m-0 text-sm text-ink-2">
          Сейчас никто не дошёл до этапа, на котором готовят оффер. Двиньте
          кандидата на «Практическую проверку» или «Оффер» в воронке.
        </p>
      ) : (
        <>
          <Field label="Кому" htmlFor="app">
            <select
              id="app"
              className="w-full rounded-md border border-border-strong bg-surface px-3 py-[10px] text-sm"
              value={app?.id ?? ""}
              onChange={(e) => setApplicationId(e.target.value)}
            >
              {eligible.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.candidate_name} · {a.vacancy_title}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Зарплата на руки"
            htmlFor="salary"
            hint={
              band
                ? `Утверждённая вилка: ${money(band.salary_min)} — ${money(band.salary_max)}`
                : undefined
            }
            error={
              overBand > 0
                ? `Выше утверждённой вилки на ${money(overBand)}. Согласуйте с владельцем или снизьте предложение.`
                : undefined
            }
          >
            <Input
              id="salary"
              inputMode="numeric"
              value={salary}
              placeholder={String(band?.salary_max ?? "")}
              onChange={(e) => setSalary(e.target.value.replace(/\D/g, ""))}
              aria-invalid={overBand > 0}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Дата выхода" htmlFor="start">
              <Input
                id="start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            <Field label="Ответ ждём до" htmlFor="respond">
              <Input
                id="respond"
                type="date"
                value={respondBy}
                onChange={(e) => setRespondBy(e.target.value)}
              />
            </Field>
          </div>

          <Field
            label="Текст оффера"
            hint="Собран из шаблона. Поправьте, если по этому человеку есть что добавить."
          >
            <Textarea value={body} readOnly className="min-h-[180px] font-mono text-[12px]" />
          </Field>
        </>
      )}
    </Modal>
  );
}
