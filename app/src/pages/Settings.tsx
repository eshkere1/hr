import { useState } from "react";
import { ShieldOff, Trash2 } from "lucide-react";
import * as api from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import {
  Button, Card, Field, Skeleton, Table, TableWrap, Tabs, Tag, Td, Textarea, Th,
} from "@/components/ui";
import { CandidateLine, EmptyState, PageHeader } from "@/components/app/primitives";
import {
  CONSENT_LABEL, REFERRAL_STATUS_LABEL, type CompanyValue,
} from "@/lib/types";
import { dateRu, money } from "@/lib/utils";

const TABS = [
  { id: "values", label: "Ценности" },
  { id: "consents", label: "Согласия" },
  { id: "substitutions", label: "Срочные замены" },
  { id: "referrals", label: "Рекомендации" },
];

export default function Settings() {
  const [tab, setTab] = useState("values");
  return (
    <>
      <PageHeader
        eyebrow="Настройки и данные"
        title="Основания системы"
        description="Здесь лежит то, на чём держатся остальные экраны: ценности, по которым разбираются кейсы, и согласия, без которых базу нельзя ни хранить, ни использовать."
      />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <div className="pt-5">
        {tab === "values" && <Values />}
        {tab === "consents" && <Consents />}
        {tab === "substitutions" && <UrgentNeeds />}
        {tab === "referrals" && <Referrals />}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Ценности. Топливо фишки 24 — самого сильного отличия платформы.
// ---------------------------------------------------------------------------
function Values() {
  const values = useAsync(() => api.listValues(), []);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<CompanyValue | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <Card className="border-l-[3px] border-l-primary">
        <p className="m-0 text-[13.5px] text-ink-2">
          По этим формулировкам разбираются кейсы кандидатов, и из них же
          собирается обратная связь. Пока в них общие слова, разбор будет лить
          воду — и отличие, которого нет ни у одного конкурента, работать
          не начнёт. Эталонные ответы важнее описания: именно с ними
          сравнивается ответ человека.
        </p>
      </Card>

      {values.loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        (values.data ?? []).map((v) =>
          editing === v.id && draft ? (
            <Card key={v.id} className="flex flex-col gap-4">
              <div className="font-display text-[17px] font-semibold">{v.name}</div>
              <Field label="Что это значит" htmlFor={`d-${v.id}`}>
                <Textarea
                  id={`d-${v.id}`}
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  className="min-h-[60px]"
                />
              </Field>
              <Field
                label="Эталонный ответ — так да"
                htmlFor={`g-${v.id}`}
                hint="Конкретная ситуация и конкретное действие, а не лозунг"
              >
                <Textarea
                  id={`g-${v.id}`}
                  value={draft.good_example ?? ""}
                  onChange={(e) => setDraft({ ...draft, good_example: e.target.value })}
                  className="min-h-[60px]"
                />
              </Field>
              <Field label="Так нет" htmlFor={`b-${v.id}`}>
                <Textarea
                  id={`b-${v.id}`}
                  value={draft.bad_example ?? ""}
                  onChange={(e) => setDraft({ ...draft, bad_example: e.target.value })}
                  className="min-h-[60px]"
                />
              </Field>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    await api.saveValue(draft);
                    setEditing(null);
                    values.reload();
                  }}
                >
                  Сохранить
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>
                  Отмена
                </Button>
              </div>
            </Card>
          ) : (
            <Card key={v.id} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="m-0 font-display text-[17px] font-semibold tracking-[-0.01em]">
                    {v.name}
                  </h3>
                  <code className="font-mono text-[11px] text-ink-3">{v.code}</code>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setEditing(v.id);
                    setDraft(v);
                  }}
                >
                  Изменить
                </Button>
              </div>
              <p className="m-0 text-[13.5px] text-ink-2">{v.description}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md bg-good-soft p-3">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-good">
                    Так да
                  </div>
                  <p className="m-0 text-[12.5px] text-ink-2">{v.good_example}</p>
                </div>
                <div className="rounded-md bg-crit-soft p-3">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-crit">
                    Так нет
                  </div>
                  <p className="m-0 text-[12.5px] text-ink-2">{v.bad_example}</p>
                </div>
              </div>
            </Card>
          ),
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Журнал согласий (фишки 61, 62)
// ---------------------------------------------------------------------------
function Consents() {
  const consents = useAsync(() => api.listConsents(), []);
  const list = consents.data ?? [];

  const noRecording = list.filter((c) => c.kind === "call_recording" && !c.granted_at);

  return (
    <div className="flex flex-col gap-4">
      <Card className="border-l-[3px] border-l-warn">
        <p className="m-0 text-[13.5px] text-ink-2">
          Разбор собеседования без согласия на запись незаконен, а это второе
          по силе отличие платформы. Здесь видно, у кого согласия нет —
          с такими встречами придётся работать по заметкам вручную.
          {noRecording.length > 0 && (
            <>
              {" "}Сейчас без согласия на запись:{" "}
              <b className="font-mono">{noRecording.length}</b>.
            </>
          )}
        </p>
      </Card>

      {consents.loading ? (
        <Skeleton className="h-56 w-full" />
      ) : list.length === 0 ? (
        <EmptyState
          title="Журнал пуст"
          description="Согласия фиксируются автоматически: кандидат нажимает кнопку в боте, запись появляется здесь."
        />
      ) : (
        <TableWrap>
          <Table className="min-w-[720px]">
            <thead>
              <tr>
                <Th>Кандидат</Th>
                <Th>На что</Th>
                <Th>Дано</Th>
                <Th>Откуда</Th>
                <Th>Статус</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="hover:bg-surface-2">
                  <Td>
                    <CandidateLine name={c.candidate_name} />
                  </Td>
                  <Td className="text-ink-2">{CONSENT_LABEL[c.kind]}</Td>
                  <Td className="font-mono tabular-nums text-ink-2">
                    {c.granted_at ? dateRu(c.granted_at) : "—"}
                  </Td>
                  <Td className="text-ink-3">{c.source}</Td>
                  <Td>
                    {c.revoked_at ? (
                      <Tag tone="crit">Отозвано {dateRu(c.revoked_at)}</Tag>
                    ) : c.granted_at ? (
                      <Tag tone="good">Действует</Tag>
                    ) : (
                      <Tag tone="mute">Не дано</Tag>
                    )}
                  </Td>
                  <Td>
                    {c.granted_at && !c.revoked_at && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await api.revokeConsent(c.id);
                          consents.reload();
                        }}
                      >
                        <ShieldOff className="h-[14px] w-[14px]" /> Отозвать
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Пул подмен (фишка 55)
// ---------------------------------------------------------------------------
function UrgentNeeds() {
  const subs = useAsync(() => api.listUrgentNeeds(), []);
  const ready = useAsync(() => api.listCandidates("готов выйти срочно"), []);

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <p className="m-0 text-[13.5px] text-ink-2">
          Кто из базы готов выйти завтра и закрыть внезапную дыру: смену,
          дежурство, подхват сделок. Это и решает операционную задачу, и даёт
          человеку показать себя делом — фактически платный испытательный срок,
          который снижает цену ошибки найма.
        </p>
      </Card>

      <section>
        <h3 className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
          Нужен человек срочно
        </h3>
        {subs.loading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(subs.data ?? []).map((s) => (
              <Card key={s.id} className="flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <b className="text-[14px]">{s.role ?? "Без названия"}</b>
                    <div className="mt-[2px] text-[12px] text-ink-3">{s.department_name}</div>
                  </div>
                  <Tag tone={s.status === "open" ? "warn" : "good"}>
                    {s.status === "open" ? "Ищем" : "Закрыто"}
                  </Tag>
                </div>
                <div className="font-mono text-[12.5px] tabular-nums text-ink-2">
                  {dateRu(s.needed_on)} · {s.hours} ч · {money(s.rate)}/ч
                </div>
                {s.filled_by_name && (
                  <div className="text-[12.5px] text-good">Выходит: {s.filled_by_name}</div>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-3 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
          Готовы выйти срочно
        </h3>
        {ready.loading ? (
          <Skeleton className="h-32 w-full" />
        ) : (ready.data ?? []).length === 0 ? (
          <EmptyState
            title="Пул срочных замен пуст"
            description="Отметку «готов выйти срочно» кандидат ставит сам в боте. Спрашивать об этом стоит на отказе — тогда согласие даёт каждый третий."
          />
        ) : (
          <TableWrap>
            <Table className="min-w-[620px]">
              <thead>
                <tr>
                  <Th>Кандидат</Th>
                  <Th>Направление</Th>
                  <Th>Город</Th>
                  <Th>Когда может</Th>
                </tr>
              </thead>
              <tbody>
                {(ready.data ?? []).map((c) => (
                  <tr key={c.id} className="hover:bg-surface-2">
                    <Td>
                      <CandidateLine name={c.full_name} />
                    </Td>
                    <Td className="text-ink-2">{c.profile?.specialization}</Td>
                    <Td className="text-ink-2">{c.city}</Td>
                    <Td className="text-ink-3">{c.profile?.schedule_note ?? "по договорённости"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Реферальная программа (фишка 60)
// ---------------------------------------------------------------------------
function Referrals() {
  const referrals = useAsync(() => api.listReferrals(), []);
  const list = referrals.data ?? [];
  const paid = list.filter((r) => r.status === "bonus_paid").length;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <p className="m-0 text-[13.5px] text-ink-2">
          Самый дешёвый канал найма. Бонус платится после испытательного срока,
          а не в день выхода: иначе программа превращается в поставку случайных
          людей. Проверять её надо одним числом — стоимость найма по рефералу
          против обычной. Не дешевле — программу закрывать.
        </p>
      </Card>

      {referrals.loading ? (
        <Skeleton className="h-40 w-full" />
      ) : list.length === 0 ? (
        <EmptyState
          title="Рекомендаций пока нет"
          description="Сотрудник рекомендует знакомого в два клика из своего профиля."
        />
      ) : (
        <TableWrap>
          <Table className="min-w-[720px]">
            <thead>
              <tr>
                <Th>Кто рекомендовал</Th>
                <Th>Кого</Th>
                <Th>Вакансия</Th>
                <Th>Статус</Th>
                <Th className="text-right">Бонус</Th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2">
                  <Td className="font-medium">{r.referrer_name}</Td>
                  <Td className="text-ink-2">{r.referred_name}</Td>
                  <Td className="text-ink-2">{r.vacancy_title ?? "—"}</Td>
                  <Td>
                    <Tag
                      tone={
                        r.status === "bonus_paid" || r.status === "passed_probation"
                          ? "good"
                          : r.status === "rejected"
                            ? "mute"
                            : "info"
                      }
                    >
                      {REFERRAL_STATUS_LABEL[r.status]}
                    </Tag>
                  </Td>
                  <Td className="text-right font-mono tabular-nums">
                    {r.bonus_amount ? money(r.bonus_amount) : "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}

      {paid === 0 && list.length > 0 && (
        <p className="m-0 text-[12.5px] text-ink-3">
          <Trash2 className="mr-1 inline h-3 w-3" />
          Ни одного выплаченного бонуса: пока считать экономию канала не из чего.
        </p>
      )}
    </div>
  );
}
