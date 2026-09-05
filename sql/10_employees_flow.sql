-- ============================================================================
-- РАСТИМ · платформа найма
-- Миграция 10. ЖИЗНЬ ПОСЛЕ НАЙМА.
--
-- Таблицы под онбординг, ИПР, наставничество и оценку на испытательном
-- лежали с самого начала, но ими никто не пользовался: не было ни одного
-- способа завести сотрудника. Найм заканчивался этапом «Вышел» и обрывался.
--
-- Это дорого стоит именно найму, а не «развитию»: пока нет оценки на
-- испытательном, качество подбора нечем измерить. Срок закрытия вакансии
-- показывает скорость, но не показывает, тех ли мы берём.
--
-- Здесь: мост «отклик → сотрудник», типовой план 30/60/90 и связь оценки
-- с теми же критериями, по которым человека отбирали.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. ТИПОВОЙ ПЛАН ОНБОРДИНГА (фишка 56)
--    Задачи одинаковы для всех, конкретика — в материалах и владельцах.
-- ---------------------------------------------------------------------------
create table if not exists public.onboarding_templates (
  code        text primary key,
  name        text not null,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists public.onboarding_template_tasks (
  id            uuid primary key default gen_random_uuid(),
  template_code text not null references public.onboarding_templates(code) on delete cascade,
  horizon       int not null check (horizon in (30,60,90)),
  title         text not null,
  description   text,
  order_index   int not null default 0
);

insert into public.onboarding_templates (code, name, is_default)
values ('standard_30_60_90', 'Стандартный 30/60/90', true)
on conflict (code) do nothing;

insert into public.onboarding_template_tasks (template_code, horizon, title, description, order_index) values
-- Первые 30 дней: не «показать себя», а «понять, куда попал».
('standard_30_60_90', 30, 'Познакомиться с командой',
 'Встречи один на один с теми, с кем предстоит работать каждый день. Не для галочки: цель — понять, кто чем занят и к кому идти с вопросом.', 1),
('standard_30_60_90', 30, 'Разобраться в продукте и процессах',
 'Пройти материалы для новичка. Если что-то в них устарело — сказать, это ценнее, чем промолчать.', 2),
('standard_30_60_90', 30, 'Сделать первую самостоятельную задачу',
 'Маленькую и до конца. Смысл не в результате, а в том, чтобы пройти весь путь: постановка, работа, проверка, выпуск.', 3),
('standard_30_60_90', 30, 'Обратная связь через месяц',
 'Разговор с руководителем: что получается, что мешает, совпало ли ожидание с реальностью.', 4),

-- 60 дней: самостоятельность.
('standard_30_60_90', 60, 'Вести свой участок без напоминаний',
 'Задачи приходят и закрываются без того, чтобы кто-то стоял рядом.', 1),
('standard_30_60_90', 60, 'Разобрать один сложный случай',
 'То, что не решается по инструкции. Показывает, как человек думает, когда готового ответа нет.', 2),
('standard_30_60_90', 60, 'Оценка по критериям отбора',
 'Те же критерии, по которым отбирали. Расхождение здесь — сигнал не сотруднику, а нам: значит, отбор проверял не то.', 3),

-- 90 дней: решение.
('standard_30_60_90', 90, 'Взять зону ответственности',
 'Участок, за который отвечает он, а не наставник.', 1),
('standard_30_60_90', 90, 'Предложить одно улучшение',
 'Свежий взгляд живёт три месяца. Дальше замыленный глаз, и то, что резало, перестанет замечаться.', 2),
('standard_30_60_90', 90, 'Решение по испытательному сроку',
 'Итог по тем же критериям плюс оценка руководителя. Решение принимается на данных, а не на общем впечатлении.', 3)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. МОСТ «ОТКЛИК → СОТРУДНИК»
--    Перевод на терминальный этап заводит сотрудника и план сам. Иначе этот
--    шаг делали бы руками, а значит, не делали бы вовсе.
-- ---------------------------------------------------------------------------
create or replace function public.hire_from_application()
returns trigger language plpgsql security definer set search_path = public
as $fn$
declare
  v_employee_id uuid;
  v_plan_id     uuid;
  v_dept        uuid;
  v_manager     uuid;
  v_title       text;
  v_months      int;
  v_task        record;
begin
  if new.status <> 'hired' or coalesce(old.status, '') = 'hired' then
    return new;
  end if;

  -- Уже заводили — второй раз не нужно.
  if exists (select 1 from public.employees where candidate_id = new.candidate_id) then
    return new;
  end if;

  select v.department_id, v.line_manager_id, v.title
    into v_dept, v_manager, v_title
  from public.vacancies v where v.id = new.vacancy_id;

  -- Длительность испытательного берём из оффера, если он был: обещание
  -- кандидату и срок в системе должны совпадать.
  select o.probation_months into v_months
  from public.offers o
  where o.application_id = new.id
  order by o.created_at desc limit 1;

  insert into public.employees
    (candidate_id, application_id, department_id, position_title, status,
     hired_on, probation_ends_on, line_manager_id)
  values
    (new.candidate_id, new.id, v_dept, v_title, 'probation',
     current_date,
     current_date + make_interval(months => coalesce(v_months, 3)),
     v_manager)
  returning id into v_employee_id;

  insert into public.onboarding_plans (employee_id, template_code, starts_on)
  values (v_employee_id, 'standard_30_60_90', current_date)
  returning id into v_plan_id;

  for v_task in
    select * from public.onboarding_template_tasks
    where template_code = 'standard_30_60_90'
    order by horizon, order_index
  loop
    insert into public.onboarding_tasks
      (plan_id, horizon, title, description, owner_id, due_on, order_index)
    values
      (v_plan_id, v_task.horizon, v_task.title, v_task.description,
       v_manager, current_date + v_task.horizon, v_task.order_index);
  end loop;

  return new;
end;
$fn$;

drop trigger if exists t_hire_from_application on public.applications;
create trigger t_hire_from_application
  after update of status on public.applications
  for each row execute function public.hire_from_application();

comment on function public.hire_from_application is
  'Перевод отклика в «принят» заводит сотрудника и план 30/60/90. Вручную этот шаг не делали бы.';

-- ---------------------------------------------------------------------------
-- 3. КОГО ПОРА СПРОСИТЬ (фишки 43, 59)
--    Список того, что назрело по календарю: контрольные точки испытательного
--    и опрос заказчика через 1, 3 и 6 месяцев. Без такого списка обе фишки
--    остаются намерением: спросить через три месяца некому и нечем.
-- ---------------------------------------------------------------------------
create or replace view public.v_people_checkpoints
with (security_invoker = true) as
with base as (
  select
    e.id as employee_id,
    coalesce(p.full_name, c.full_name, 'Сотрудник') as full_name,
    e.position_title,
    e.hired_on,
    e.probation_ends_on,
    e.status,
    e.line_manager_id,
    (current_date - e.hired_on) as days_worked
  from public.employees e
  left join public.candidates c on c.id = e.candidate_id
  left join public.profiles p on p.id = e.profile_id
  where e.status in ('probation', 'active')
)
-- Контрольная точка испытательного: наступила, а оценки на неё нет
select
  b.employee_id, b.full_name, b.position_title, b.line_manager_id,
  'probation'::text as kind,
  h.horizon as mark,
  (b.hired_on + h.horizon) as due_on,
  b.days_worked
from base b
cross join (values (30), (60), (90)) as h(horizon)
where b.days_worked >= h.horizon
  and not exists (
    select 1 from public.probation_reviews r
    where r.employee_id = b.employee_id and r.checkpoint = h.horizon
  )
union all
-- Опрос руководителя о качестве найма: месяц, три, полгода
select
  b.employee_id, b.full_name, b.position_title, b.line_manager_id,
  'satisfaction'::text,
  m.mark,
  (b.hired_on + (m.mark * 30)),
  b.days_worked
from base b
cross join (values (1), (3), (6)) as m(mark)
where b.days_worked >= m.mark * 30
  and not exists (
    select 1 from public.hiring_satisfaction s
    where s.employee_id = b.employee_id and s.month_mark = m.mark
  );

-- ---------------------------------------------------------------------------
-- 4. СЕЗОННОСТЬ НАЙМА (фишка 54)
--    Планировать набор «когда стало больно» — значит всегда опаздывать.
--    Здесь видно, в какие месяцы люди уходят и в какие приходят.
-- ---------------------------------------------------------------------------
create or replace view public.v_hiring_seasonality
with (security_invoker = true) as
select
  m.month_no,
  coalesce(hired.n, 0)   as hired,
  coalesce(left_.n, 0)   as left_company,
  coalesce(opened.n, 0)  as vacancies_opened,
  coalesce(avg_days.d, 0)::int as avg_days_to_close
from generate_series(1, 12) as m(month_no)
left join (
  select extract(month from hired_on)::int as mn, count(*) as n
  from public.employees group by 1
) hired on hired.mn = m.month_no
left join (
  select extract(month from left_on)::int as mn, count(*) as n
  from public.employees where left_on is not null group by 1
) left_ on left_.mn = m.month_no
left join (
  select extract(month from opened_at)::int as mn, count(*) as n
  from public.vacancies where opened_at is not null group by 1
) opened on opened.mn = m.month_no
left join (
  select extract(month from opened_at)::int as mn,
         avg(extract(epoch from (closed_at - opened_at)) / 86400) as d
  from public.vacancies where closed_at is not null and opened_at is not null
  group by 1
) avg_days on avg_days.mn = m.month_no;

-- ---------------------------------------------------------------------------
-- 5. ДОСТУП
-- ---------------------------------------------------------------------------
alter table public.onboarding_templates      enable row level security;
alter table public.onboarding_template_tasks enable row level security;

drop policy if exists onb_tpl_read on public.onboarding_templates;
create policy onb_tpl_read on public.onboarding_templates
  for select using (public.is_staff());

drop policy if exists onb_tpl_write on public.onboarding_templates;
create policy onb_tpl_write on public.onboarding_templates
  for all using (public.is_hr()) with check (public.is_hr());

drop policy if exists onb_tsk_read on public.onboarding_template_tasks;
create policy onb_tsk_read on public.onboarding_template_tasks
  for select using (public.is_staff());

drop policy if exists onb_tsk_write on public.onboarding_template_tasks;
create policy onb_tsk_write on public.onboarding_template_tasks
  for all using (public.is_hr()) with check (public.is_hr());

commit;
