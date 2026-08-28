import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import * as api from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/hooks/useAuth";
import {
  Avatar, Button, Card, Skeleton, Table, TableWrap, Tag, Td, Th,
} from "@/components/ui";
import { Kpi, PageHeader } from "@/components/app/primitives";
import { Funnel } from "./Dashboard";
import { ROLE_LABEL, type AppRole } from "@/lib/types";
import { daysSince, daysWord, money } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Аналитика
// ---------------------------------------------------------------------------
export function Analytics() {
  const vacancies = useAsync(() => api.listVacancies(), []);
  const applications = useAsync(() => api.listApplications(), []);
  const stats = useAsync(() => api.getDashboardStats(), []);

  const open = (vacancies.data ?? []).filter((v) => v.status === "published");
  const apps = applications.data ?? [];

  // Стоимость простоя: цена вопроса в рублях, а не «вакансия долго висит»
  const idleCost = open.reduce((sum, v) => {
    const days = v.opened_at ? daysSince(v.opened_at) : 0;
    return sum + days * 3000;
  }, 0);

  const rejected = apps.filter((a) => a.status === "rejected");
  const bySegment = ["not_now", "not_our_profile", "not_ready", "stop_list"] as const;
  const SEGMENT_LABEL = {
    not_now: "Не сейчас",
    not_our_profile: "Не наш профиль",
    not_ready: "Не готов",
    stop_list: "Стоп-лист",
  };

  return (
    <>
      <PageHeader
        eyebrow="Найм в цифрах"
        title="Аналитика"
        description="Два числа, которыми меряется работа: срок закрытия и отсев на испытательном. Остальное объясняет, почему они такие."
      />

      {stats.loading ? (
        <Skeleton className="h-28 w-full" />
      ) : (
        stats.data && (
          <div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Срок закрытия" value={stats.data.days_to_hire} unit={daysWord(stats.data.days_to_hire)} />
            <Kpi label="Стоимость найма" value={stats.data.cost_per_hire} unit="тыс ₽" />
            <Kpi
              label="Простой открытых вакансий"
              value={Math.round(idleCost / 1000)}
              unit="тыс ₽"
              delta="накоплено с даты открытия"
              deltaTone="warn"
            />
            <Kpi label="В архиве после отказа" value={rejected.length} unit="чел" />
          </div>
        )
      )}

      <section className="mb-8">
        <h2 className="mb-3 font-display text-[20px] font-semibold tracking-[-0.01em]">
          Сколько дней открыта каждая вакансия
        </h2>
        <TableWrap>
          <Table className="min-w-[680px]">
            <thead>
              <tr>
                <Th>Вакансия</Th>
                <Th>Подразделение</Th>
                <Th className="text-right">Дней открыта</Th>
                <Th className="text-right">Стоимость простоя</Th>
              </tr>
            </thead>
            <tbody>
              {open.map((v) => {
                const days = v.opened_at ? daysSince(v.opened_at) : 0;
                return (
                  <tr key={v.id} className="hover:bg-surface-2">
                    <Td>
                      <Link to={`/vacancies/${v.id}`}>{v.title}</Link>
                    </Td>
                    <Td className="text-ink-2">{v.department_name}</Td>
                    <Td className="text-right font-mono tabular-nums">{days}</Td>
                    <Td className="text-right font-mono tabular-nums text-warn">
                      {money(days * 3000)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </TableWrap>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 font-display text-[20px] font-semibold tracking-[-0.01em]">
          Архив по сегментам
        </h2>
        <p className="mb-4 max-w-[64ch] text-[13.5px] text-ink-2">
          Отказ — не конец, а сегмент. По сегментам работает реактивация: людям
          из «не сейчас» пишут при открытии часов, из «не готов» — после плана
          развития. Без этого архив был бы свалкой.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {bySegment.map((seg) => (
            <Card key={seg}>
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                {SEGMENT_LABEL[seg]}
              </div>
              <div className="mt-2 font-display text-[28px] font-bold tabular-nums leading-none">
                {rejected.filter((a) => a.archive_segment === seg).length}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {open[0] && (
        <section>
          <h2 className="mb-3 font-display text-[20px] font-semibold tracking-[-0.01em]">
            Конверсия по этапам · {open[0].title}
          </h2>
          <Funnel vacancyId={open[0].id} />
        </section>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Кабинет сотрудника
// ---------------------------------------------------------------------------
export function MyProfile() {
  const { profile, roles } = useAuth();
  return (
    <>
      <PageHeader eyebrow="Сотрудник" title="Мой профиль" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex items-start gap-4">
          <Avatar name={profile?.full_name ?? "?"} size="lg" />
          <div>
            <h2 className="m-0 font-display text-[18px] font-semibold">{profile?.full_name}</h2>
            <div className="mt-1 text-[13px] text-ink-3">{profile?.position_title}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {roles.map((r) => (
                <Tag key={r} tone="info">{ROLE_LABEL[r]}</Tag>
              ))}
            </div>
          </div>
        </Card>

        <Card className="flex flex-col gap-3">
          <h3 className="m-0 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
            Что я могу сделать для найма
          </h3>
          <p className="m-0 text-[13.5px] text-ink-2">
            Оставить мнение о кандидате, с которым пересекались, и порекомендовать
            знакомого. Рекомендация — самый дешёвый канал найма, и бонус за неё
            платится после испытательного срока.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm">Порекомендовать знакомого</Button>
            <Link to="/pipeline">
              <Button size="sm" variant="secondary">Посмотреть кандидатов</Button>
            </Link>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <h3 className="m-0 mb-2 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
            Мой план развития
          </h3>
          <p className="m-0 text-[13.5px] text-ink-2">
            ИПР, онбординг и наставничество вынесены во второй продукт: таблицы
            под них в базе уже есть, интерфейс появится после того, как найм
            начнёт давать измеримый результат. Тащить их в первую версию значит
            размыть продукт.
          </p>
        </Card>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Пользователи и роли — только суперпользователь
// ---------------------------------------------------------------------------
export function Admin() {
  const { roles } = useAuth();
  return (
    <>
      <PageHeader
        eyebrow="Администрирование"
        title="Пользователи и роли"
        description="Роль выдаёт только суперпользователь. Она хранится в отдельной таблице и никогда не приходит с клиента."
      />

      <Card className="mb-5 flex items-start gap-3 border-l-[3px] border-l-primary">
        <ShieldCheck className="mt-[2px] h-5 w-5 shrink-0 text-primary" />
        <p className="m-0 text-[13.5px] text-ink-2">
          Если бы роль лежала в профиле пользователя, любой мог бы сделать себя
          суперпользователем обычным запросом на обновление своей строки. Поэтому
          роли живут в <code className="font-mono text-[12px]">user_roles</code>,
          а проверка идёт через функцию <code className="font-mono text-[12px]">has_role()</code>{" "}
          в политиках доступа.
        </p>
      </Card>

      <TableWrap>
        <Table className="min-w-[620px]">
          <thead>
            <tr>
              <Th>Роль</Th>
              <Th>Что видит</Th>
              <Th>Ваша</Th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["superuser", "Всё. Единственный, кто раздаёт роли и читает журнал аудита"],
                ["director", "Дашборд по компании, согласование вакансий и офферов, деньги"],
                ["hr_manager", "Воронка, база педагогов, переписка, документы"],
                ["dept_head", "Только свои вакансии и отклики по ним. Вилку — по своим"],
                ["line_manager", "Свои вакансии, свои интервью, своя команда. Вилку не видит"],
                ["employee", "Своя карточка, мнение о кандидате, рекомендации"],
                ["candidate", "Только свои отклики, свои документы, своя переписка"],
              ] as [AppRole, string][]
            ).map(([role, what]) => (
              <tr key={role} className="hover:bg-surface-2">
                <Td className="font-medium">{ROLE_LABEL[role]}</Td>
                <Td className="text-ink-2">{what}</Td>
                <Td>{roles.includes(role) && <Tag tone="good">да</Tag>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </>
  );
}

// ---------------------------------------------------------------------------
export function NotFound() {
  return (
    <Card className="mx-auto max-w-[430px] text-center">
      <b className="mb-2 block font-display text-[19px] font-semibold">Такой страницы нет</b>
      <p className="m-0 mb-4 text-[13.5px] text-ink-2">
        Возможно, ссылка устарела или у вашей роли нет доступа к этому разделу.
      </p>
      <Link to="/">
        <Button size="sm">На главный экран</Button>
      </Link>
    </Card>
  );
}
