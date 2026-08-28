-- ============================================================================
-- РАСТИМ · Миграция 04. СОТРУДНИКИ, ОНБОРДИНГ, РЕФЕРАЛЫ, ЭКОНОМИКА
-- Замыкает петлю: качество найма становится измеримой цифрой.
-- ============================================================================

create type public.employee_status as enum ('probation','active','on_leave','left');
create type public.referral_status as enum ('submitted','in_progress','hired','passed_probation','rejected','bonus_paid');
create type public.cost_kind as enum ('job_board','agency','referral_bonus','hr_hours','ads','other');

-- ---------------------------------------------------------------------------
-- 1. СОТРУДНИК. Мост «кандидат → сотрудник».
-- ---------------------------------------------------------------------------
create table public.employees (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid unique references public.profiles(id) on delete set null,
  candidate_id   uuid unique references public.candidates(id) on delete set null,
  application_id uuid references public.applications(id) on delete set null,
  department_id  uuid references public.departments(id) on delete set null,
  position_title text,
  status         public.employee_status not null default 'probation',
  hired_on       date not null,
  probation_ends_on date,
  mentor_id      uuid references public.profiles(id) on delete set null,
  line_manager_id uuid references public.profiles(id) on delete set null,
  left_on        date,
  leave_reason   text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_employees_dept on public.employees (department_id, status);
create index idx_employees_probation on public.employees (probation_ends_on) where status = 'probation';

-- ---------------------------------------------------------------------------
-- 2. ОНБОРДИНГ 30/60/90 (фишка 56)
-- ---------------------------------------------------------------------------
create table public.onboarding_plans (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  template_code text,
  starts_on   date not null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.onboarding_tasks (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.onboarding_plans(id) on delete cascade,
  horizon     int not null check (horizon in (30,60,90)),
  title       text not null,
  description text,
  owner_id    uuid references public.profiles(id) on delete set null,
  due_on      date,
  done_at     timestamptz,
  material_id uuid,        -- FK ниже
  order_index int not null default 0
);

-- «Материалы всё равно устареют, никто их не обновит» — возражение снимается
-- механикой: у каждого материала есть владелец и дата актуализации (фишка 58).
create table public.learning_materials (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  url           text,
  body_md       text,
  owner_id      uuid not null references public.profiles(id) on delete restrict,
  actualized_on date not null default current_date,
  review_every_days int not null default 180,
  tags          text[] not null default '{}',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index idx_materials_stale on public.learning_materials (actualized_on);

alter table public.onboarding_tasks
  add constraint onboarding_material_fk
  foreign key (material_id) references public.learning_materials(id) on delete set null;

-- Наставничество видно и учитывается (фишка 57)
create table public.mentorships (
  id          uuid primary key default gen_random_uuid(),
  mentor_id   uuid not null references public.profiles(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  started_on  date not null default current_date,
  ended_on    date,
  hours_logged numeric(6,1) not null default 0,
  bonus_amount numeric(12,2) not null default 0,
  bonus_paid_at timestamptz,
  unique (mentor_id, employee_id)
);

-- ---------------------------------------------------------------------------
-- 3. ИПР (фишка 14). Мост «кандидат → сотрудник → развитие».
--    Работает и для сегмента «не готов»: отказ звучит как «нет пока».
-- ---------------------------------------------------------------------------
create table public.idp_plans (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid references public.employees(id) on delete cascade,
  candidate_id uuid references public.candidates(id) on delete cascade,
  goal         text not null,
  horizon_months int not null default 6,
  created_by   uuid references public.profiles(id) on delete set null,
  is_ai_generated boolean not null default true,
  created_at   timestamptz not null default now(),
  check (employee_id is not null or candidate_id is not null)
);

create table public.idp_items (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.idp_plans(id) on delete cascade,
  what_to_learn text not null,
  where_to_learn text,
  expected_result text,
  why         text,
  material_id uuid references public.learning_materials(id) on delete set null,
  due_on      date,
  done_at     timestamptz,
  order_index int not null default 0
);

-- ---------------------------------------------------------------------------
-- 4. ИСПЫТАТЕЛЬНЫЙ СРОК И ФИДБЕК ЗАКАЗЧИКА (фишки 59, 43)
--    Оценка по ТЕМ ЖЕ критериям, что были на отборе. Так качество найма
--    превращается в цифру, а не в мнение.
-- ---------------------------------------------------------------------------
create table public.probation_reviews (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  reviewer_id  uuid not null references public.profiles(id) on delete cascade,
  checkpoint   int not null check (checkpoint in (30,60,90)),
  criterion_id uuid references public.vacancy_criteria(id) on delete set null,
  result       public.criterion_result not null default 'unknown',
  comment      text,
  created_at   timestamptz not null default now()
);

create table public.hiring_satisfaction (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  manager_id   uuid not null references public.profiles(id) on delete cascade,
  month_mark   int not null check (month_mark in (1,3,6)),
  score        int not null check (score between 1 and 5),
  would_hire_again boolean,
  comment      text,
  created_at   timestamptz not null default now(),
  unique (employee_id, manager_id, month_mark)
);

-- ---------------------------------------------------------------------------
-- 5. РЕФЕРАЛЫ (фишка 60 + ДЗ 1, сценарий 4: «кандидат как агент»)
-- ---------------------------------------------------------------------------
create table public.referrals (
  id                  uuid primary key default gen_random_uuid(),
  referrer_profile_id uuid references public.profiles(id) on delete set null,
  referrer_candidate_id uuid references public.candidates(id) on delete set null,
  referred_candidate_id uuid not null references public.candidates(id) on delete cascade,
  vacancy_id          uuid references public.vacancies(id) on delete set null,
  referral_code       text unique,           -- персональная ссылка в боте
  status              public.referral_status not null default 'submitted',
  bonus_amount        numeric(12,2) not null default 0,
  bonus_paid_at       timestamptz,
  created_at          timestamptz not null default now(),
  check (referrer_profile_id is not null or referrer_candidate_id is not null)
);

alter table public.applications
  add constraint applications_referral_fk
  foreign key (referral_id) references public.referrals(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 6. СООБЩЕСТВО И ПОДМЕНЫ (ДЗ 1, сценарии 3 и 5)
-- ---------------------------------------------------------------------------
create table public.substitution_offers (
  id           uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments(id) on delete set null,
  subject      text,
  needed_on    date not null,
  hours        numeric(5,1),
  rate         numeric(12,2),
  status       text not null default 'open' check (status in ('open','filled','cancelled')),
  filled_by_candidate_id uuid references public.candidates(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table public.community_members (
  candidate_id uuid primary key references public.candidates(id) on delete cascade,
  joined_at    timestamptz not null default now(),
  left_at      timestamptz,
  last_active_at timestamptz,
  segment      public.archive_segment
);

-- ---------------------------------------------------------------------------
-- 7. ЭКОНОМИКА НАЙМА (фишка 45)
-- ---------------------------------------------------------------------------
create table public.hiring_costs (
  id          uuid primary key default gen_random_uuid(),
  vacancy_id  uuid references public.vacancies(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  kind        public.cost_kind not null,
  amount      numeric(12,2) not null,
  hours       numeric(8,2),
  note        text,
  incurred_on date not null default current_date,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index idx_costs_vacancy on public.hiring_costs (vacancy_id);

-- Обезличенный бенчмарк рынка (ДЗ 1, сценарий 8).
-- Правило: не публиковать срезы меньше 5 наблюдений — иначе на малой выборке
-- вычисляется конкретный человек.
create table public.salary_benchmarks (
  id           uuid primary key default gen_random_uuid(),
  subject      text not null,
  education_stage public.education_stage,
  city         text,
  period_month date not null,
  sample_size  int not null,
  p25          numeric(12,2),
  p50          numeric(12,2),
  p75          numeric(12,2),
  created_at   timestamptz not null default now(),
  check (sample_size >= 5)
);

-- ---------------------------------------------------------------------------
-- 8. ПРЕДСТАВЛЕНИЯ ДЛЯ ДАШБОРДА
--    security_invoker = on: представление уважает RLS того, кто его читает.
--    Без этого руководитель подразделения увидит чужие вакансии.
-- ---------------------------------------------------------------------------

-- Воронка по вакансии: где именно ломается (фишка 48)
create or replace view public.v_funnel_by_vacancy
with (security_invoker = on) as
select
  v.id                       as vacancy_id,
  v.title,
  v.department_id,
  s.id                       as stage_id,
  s.code                     as stage_code,
  s.name                     as stage_name,
  s.order_index,
  s.color_token,
  count(distinct a.id) filter (where a.status = 'active' and a.stage_id = s.id) as active_now,
  count(distinct h.application_id)                                             as ever_reached
from public.vacancies v
join public.pipeline_stages s on s.pipeline_id = v.pipeline_id
left join public.applications a on a.vacancy_id = v.id
left join public.application_stage_history h
       on h.application_id = a.id and h.to_stage_id = s.id
group by v.id, v.title, v.department_id, s.id, s.code, s.name, s.order_index, s.color_token;

-- Срок закрытия вакансии
create or replace view public.v_time_to_hire
with (security_invoker = on) as
select
  v.id as vacancy_id,
  v.title,
  v.department_id,
  v.opened_at,
  v.closed_at,
  extract(day from (coalesce(v.closed_at, now()) - v.opened_at))::int as days_open,
  d.cost_per_idle_day,
  (extract(day from (coalesce(v.closed_at, now()) - v.opened_at))::numeric
     * coalesce(d.cost_per_idle_day,0))                                as idle_cost
from public.vacancies v
left join public.departments d on d.id = v.department_id
where v.opened_at is not null;

-- Стоимость найма (CPH)
create or replace view public.v_cost_per_hire
with (security_invoker = on) as
select
  v.id as vacancy_id,
  v.title,
  v.department_id,
  coalesce(sum(hc.amount), 0)                                 as direct_costs,
  coalesce(sum(hc.hours), 0) * (select hr_hour_cost from public.company_settings where id) as hr_cost,
  greatest(v.hired_count, 0)                                  as hired,
  case when v.hired_count > 0
    then (coalesce(sum(hc.amount),0)
          + coalesce(sum(hc.hours),0) * (select hr_hour_cost from public.company_settings where id))
         / v.hired_count
  end                                                          as cost_per_hire
from public.vacancies v
left join public.hiring_costs hc on hc.vacancy_id = v.id
group by v.id, v.title, v.department_id, v.hired_count;

-- Просроченные сроки: кто именно молчит
create or replace view public.v_sla_breaches
with (security_invoker = on) as
select
  t.id, t.subject, t.application_id, t.vacancy_id,
  t.responsible_id, p.full_name as responsible_name,
  t.due_at,
  extract(epoch from (now() - t.due_at)) / 3600.0 as hours_overdue,
  t.state
from public.sla_timers t
left join public.profiles p on p.id = t.responsible_id
where t.state in ('running','breached','escalated')
  and t.due_at < now();

-- Разрыв «ожидания кандидата против вилки и рынка» (фишка 23)
create or replace view public.v_salary_gap
with (security_invoker = on) as
select
  a.id as application_id,
  a.vacancy_id,
  ac.expected_salary,
  vc.salary_min,
  vc.salary_max,
  vc.market_p50,
  ac.expected_salary - vc.salary_max                        as over_band_by,
  ac.expected_salary - vc.market_p50                        as over_market_by
from public.applications a
join public.application_compensation ac on ac.application_id = a.id
join public.vacancy_compensation vc on vc.vacancy_id = a.vacancy_id;

-- Архив как ресурс: сколько людей в каком сегменте и кого пора реактивировать
create or replace view public.v_talent_pool
with (security_invoker = on) as
select
  c.id as candidate_id,
  c.full_name,
  c.city,
  tp.subjects,
  tp.education_stages,
  a.archive_segment,
  a.reactivate_after,
  a.criteria_met,
  a.criteria_total,
  max(a.applied_at) over (partition by c.id) as last_application_at,
  c.is_blacklisted
from public.candidates c
left join public.teacher_profiles tp on tp.candidate_id = c.id
left join public.applications a on a.candidate_id = c.id
where a.archive_segment is not null and a.archive_segment <> 'stop_list';

-- ---------------------------------------------------------------------------
-- 9. RLS
-- ---------------------------------------------------------------------------
alter table public.employees           enable row level security;
alter table public.onboarding_plans    enable row level security;
alter table public.onboarding_tasks    enable row level security;
alter table public.learning_materials  enable row level security;
alter table public.mentorships         enable row level security;
alter table public.idp_plans           enable row level security;
alter table public.idp_items           enable row level security;
alter table public.probation_reviews   enable row level security;
alter table public.hiring_satisfaction enable row level security;
alter table public.referrals           enable row level security;
alter table public.substitution_offers enable row level security;
alter table public.community_members   enable row level security;
alter table public.hiring_costs        enable row level security;
alter table public.salary_benchmarks   enable row level security;

create trigger t_employees_touch before update on public.employees for each row execute function public.touch_updated_at();
