-- ============================================================================
-- РАСТИМ · Миграция 02. ЯДРО НАЙМА
-- Заявка → вакансия → воронка → кандидат → отклик.
-- Это фундамент: ошибка здесь дороже всего (вывод по пункту 19 таблицы).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ПЕРЕЧИСЛЕНИЯ
-- ---------------------------------------------------------------------------
create type public.requisition_status as enum (
  'draft','pending_approval','approved','rejected','cancelled'
);

create type public.vacancy_status as enum (
  'draft','pending_approval','approved','published','on_hold','closed','cancelled'
);

create type public.vacancy_priority as enum ('low','normal','high','critical');

create type public.employment_type as enum ('full_time','part_time','hourly','project','contract');
create type public.work_format    as enum ('onsite','remote','hybrid');

create type public.application_status as enum (
  'active','on_hold','rejected','withdrawn','hired'
);

-- Четыре сегмента архива вместо слова «отказ» (ДЗ 1, сценарий 1).
-- Без сегментации архив — свалка, а не ресурс.
create type public.archive_segment as enum (
  'not_now',           -- подходит, но нет места
  'not_our_profile',   -- сильный, но не под нашу роль
  'not_ready',         -- не хватает конкретного навыка
  'stop_list'          -- стоп-лист
);

create type public.criterion_result as enum ('met','partial','not_met','unknown');
create type public.evidence_source  as enum ('resume','screening','interview','test','case','practical_check','documents','reference','manual');

create type public.candidate_source as enum (
  'hh','avito','superjob','telegram','referral','archive','direct','website','other'
);

-- ---------------------------------------------------------------------------
-- 1. ВОРОНКИ. У разных должностей свои воронки — отдельное требование.
-- ---------------------------------------------------------------------------
create table public.pipelines (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  is_default  boolean not null default false,
  is_active   boolean not null default true,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.pipeline_stages (
  id           uuid primary key default gen_random_uuid(),
  pipeline_id  uuid not null references public.pipelines(id) on delete cascade,
  code         text not null,               -- new, screening, interview, assessment, demo, offer, hired
  name         text not null,               -- подпись на канбане
  order_index  int  not null,
  color_token  text not null default 'stage-3',  -- ТОЛЬКО токен дизайн-системы, не hex
  sla_hours    int,                         -- норма ответа на этапе; NULL = без срока
  is_terminal  boolean not null default false,
  auto_actions jsonb not null default '[]'::jsonb,
  -- Автовыдача заданий при переходе (фишка 10):
  -- [{"type":"assign_assessment","template_code":"test_10min"},
  --  {"type":"send_message","template_code":"invite_demo"}]
  unique (pipeline_id, code),
  unique (pipeline_id, order_index)
);
create index idx_stages_pipeline on public.pipeline_stages (pipeline_id, order_index);

-- ---------------------------------------------------------------------------
-- 2. ЗАЯВКА НА ПОДБОР. Три минуты, пять вопросов (фишка 25).
-- ---------------------------------------------------------------------------
create table public.requisitions (
  id             uuid primary key default gen_random_uuid(),
  requested_by   uuid not null references public.profiles(id) on delete restrict,
  department_id  uuid not null references public.departments(id) on delete restrict,
  status         public.requisition_status not null default 'draft',
  -- Пять вопросов руководителю, ответы как есть
  q_who_needed   text,   -- кого нужно и зачем
  q_tasks        text,   -- что человек будет делать в первый месяц
  q_must_have    text,   -- без чего точно не возьмём
  q_deadline     text,   -- к какой дате нужен
  q_budget       text,   -- сколько готовы платить
  -- ИИ достраивает профиль вакансии из ответов
  ai_draft       jsonb,
  ai_generated_at timestamptz,
  approved_by    uuid references public.profiles(id) on delete set null,
  approved_at    timestamptz,
  rejection_note text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_requisitions_dept on public.requisitions (department_id, status);

-- ---------------------------------------------------------------------------
-- 3. ВАКАНСИЯ
-- ---------------------------------------------------------------------------
create table public.vacancies (
  id                uuid primary key default gen_random_uuid(),
  requisition_id    uuid references public.requisitions(id) on delete set null,
  pipeline_id       uuid not null references public.pipelines(id) on delete restrict,
  title             text not null,
  department_id     uuid not null references public.departments(id) on delete restrict,
  hiring_manager_id uuid references public.profiles(id) on delete set null,  -- руководитель подразделения
  line_manager_id   uuid references public.profiles(id) on delete set null,  -- непосредственный руководитель
  recruiter_id      uuid references public.profiles(id) on delete set null,  -- HR-менеджер
  status            public.vacancy_status not null default 'draft',
  priority          public.vacancy_priority not null default 'normal',
  headcount         int not null default 1,
  hired_count       int not null default 0,

  -- Профиль позиции. Поля отраслево-нейтральные: направление и уровень
  -- подходят и разработчику, и бухгалтеру, и мастеру участка.
  specialization    text,                           -- «Разработка», «Продажи»
  grade             public.grade_level,             -- уровень позиции
  employment_type   public.employment_type not null default 'full_time',
  work_format       public.work_format not null default 'onsite',
  weekly_hours      numeric(5,1),                   -- честная нагрузка в часах (фишка 29)
  city              text,
  address           text,

  -- Какие документы обязательны именно для этой вакансии (фишка 50).
  -- Пока они не закрыты, перевод на оффер блокируется.
  required_documents public.document_kind[] not null default '{passport,snils,inn}',

  -- Честные условия: что реально будет в первый месяц (фишка 29)
  description       text,
  first_month_reality text,
  requirements      text,
  conditions        text,

  target_close_date date,                           -- к 1 сентября и т.п.
  opened_at         timestamptz,
  closed_at         timestamptz,
  close_reason      text,

  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_vacancies_dept   on public.vacancies (department_id, status);
create index idx_vacancies_hm     on public.vacancies (hiring_manager_id);
create index idx_vacancies_rec    on public.vacancies (recruiter_id);
create index idx_vacancies_status on public.vacancies (status) where status in ('published','approved');

-- ДЕНЬГИ ОТДЕЛЬНОЙ ТАБЛИЦЕЙ.
-- В PostgreSQL RLS работает построчно, а не по колонкам. Чтобы «кто какие поля
-- видит» (фишка 64) было настоящим ограничением, а не сокрытием в интерфейсе,
-- зарплатные поля вынесены в отдельную таблицу со своей политикой.
create table public.vacancy_compensation (
  vacancy_id      uuid primary key references public.vacancies(id) on delete cascade,
  salary_min      numeric(12,2),
  salary_max      numeric(12,2),
  is_net          boolean not null default true,   -- на руки
  currency        char(3) not null default 'RUB',
  bonus_scheme    text,
  budget_approved boolean not null default false,
  market_p25      numeric(12,2),   -- зарплатная аналитика (фишка 23)
  market_p50      numeric(12,2),
  market_p75      numeric(12,2),
  market_updated_at timestamptz,
  updated_at      timestamptz not null default now()
);

-- Критерии вакансии: 5–6 штук. Основание вместо балла (фишка 1).
create table public.vacancy_criteria (
  id           uuid primary key default gen_random_uuid(),
  vacancy_id   uuid not null references public.vacancies(id) on delete cascade,
  name         text not null,          -- «Коммерческий опыт на Python от 3 лет»
  description  text,
  weight       int not null default 1 check (weight between 1 and 5),
  is_required  boolean not null default false,
  how_verified public.evidence_source not null default 'resume',
  order_index  int not null default 0,
  created_at   timestamptz not null default now()
);
create index idx_criteria_vacancy on public.vacancy_criteria (vacancy_id, order_index);

-- Версии требований: что, кто и когда поменял (фишка 27).
-- Закрывает боль HR «требования меняются на ходу, работа обесценивается».
create table public.vacancy_versions (
  id          uuid primary key default gen_random_uuid(),
  vacancy_id  uuid not null references public.vacancies(id) on delete cascade,
  version_no  int not null,
  snapshot    jsonb not null,
  changed_by  uuid references public.profiles(id) on delete set null,
  change_note text,
  created_at  timestamptz not null default now(),
  unique (vacancy_id, version_no)
);

-- Согласование вакансии (фишка 26)
create table public.vacancy_approvals (
  id          uuid primary key default gen_random_uuid(),
  vacancy_id  uuid not null references public.vacancies(id) on delete cascade,
  approver_id uuid not null references public.profiles(id) on delete restrict,
  decision    text not null check (decision in ('pending','approved','rejected')),
  comment     text,
  decided_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index idx_vac_approvals on public.vacancy_approvals (vacancy_id, decision);

-- Публикация на job-бордах (фишка 30)
create table public.vacancy_publications (
  id            uuid primary key default gen_random_uuid(),
  vacancy_id    uuid not null references public.vacancies(id) on delete cascade,
  board         public.candidate_source not null,
  external_id   text,
  external_url  text,
  published_at  timestamptz,
  archived_at   timestamptz,
  last_sync_at  timestamptz,
  sync_error    text,
  cost          numeric(12,2) not null default 0,   -- идёт в стоимость найма
  unique (vacancy_id, board, external_id)
);

-- ---------------------------------------------------------------------------
-- 4. КАНДИДАТ. Единая карточка человека на всю его историю с нами.
--    «Общался два года назад — переписки нет» закрывается здесь.
-- ---------------------------------------------------------------------------
create table public.candidates (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid unique references public.profiles(id) on delete set null,
  full_name      text not null,
  phones         text[] not null default '{}',
  emails         text[] not null default '{}',
  telegram_user_id bigint unique,
  telegram_username text,
  city           text,
  birth_date     date,
  photo_url      text,

  primary_source public.candidate_source not null default 'other',
  first_seen_at  timestamptz not null default now(),
  last_activity_at timestamptz,

  -- Приватный отклик (фишка 35): не палить перед текущим работодателем
  hide_from_current_employer boolean not null default false,
  current_employer text,

  -- Стоп-лист (фишка 7) — явная сущность, а не тег
  is_blacklisted    boolean not null default false,
  blacklist_reason  text,
  blacklisted_by    uuid references public.profiles(id) on delete set null,
  blacklisted_at    timestamptz,

  -- 152-ФЗ (фишки 61–62)
  consent_pd_granted boolean not null default false,
  retention_until    date,
  deletion_requested_at timestamptz,

  resume_text    text,                  -- распознанный текст резюме
  resume_file_url text,
  embedding      vector(1536),          -- смысловой поиск по базе (фишки 15, 16)
  search_tsv     tsvector,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_candidates_name_trgm on public.candidates using gin (full_name gin_trgm_ops);
create index idx_candidates_city on public.candidates (city);
create index idx_candidates_tsv on public.candidates using gin (search_tsv);
create index idx_candidates_blacklist on public.candidates (is_blacklisted) where is_blacklisted;

-- Теперь, когда таблица candidates существует, создаём функцию доступа,
-- отложенную из миграции 01.
create or replace function public.my_candidate_id()
returns uuid language sql stable security definer set search_path = public
as $fn$ select c.id from public.candidates c where c.profile_id = auth.uid() limit 1; $fn$;

-- Профессиональный профиль кандидата. Без этих полей поиск по базе
-- («опытный python из Москвы») не работает вообще: искать не по чему.
create table public.candidate_profiles (
  candidate_id     uuid primary key references public.candidates(id) on delete cascade,
  specialization   text,                            -- «Разработка», «Продажи»
  skills           text[] not null default '{}',    -- инструменты и навыки
  grades           public.grade_level[] not null default '{}',
  years_in_specialty int,
  total_experience_years int,
  education        text,
  certifications   text,
  expected_salary  numeric(12,2),
  available_from   date,
  schedule_note    text,                            -- «готов выйти через две недели»
  ready_for_urgent_start boolean not null default false,  -- срочные замены (фишка 55)
  work_formats     public.work_format[] not null default '{}',
  updated_at       timestamptz not null default now()
);
create index idx_profiles_specialization on public.candidate_profiles (specialization);
create index idx_profiles_skills on public.candidate_profiles using gin (skills);
create index idx_profiles_grades on public.candidate_profiles using gin (grades);
create index idx_profiles_urgent on public.candidate_profiles (ready_for_urgent_start) where ready_for_urgent_start;

-- Заметки о кандидате с уровнем видимости.
-- «Не хочу, чтобы моя активность стала поводом для оценки» — видимость явная.
create type public.note_visibility as enum ('private','hr_only','hiring_team','all_staff');

create table public.candidate_notes (
  id           uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  application_id uuid,   -- FK ниже, после создания applications
  author_id    uuid not null references public.profiles(id) on delete cascade,
  body         text not null,
  visibility   public.note_visibility not null default 'hiring_team',
  is_ai        boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_notes_candidate on public.candidate_notes (candidate_id, created_at desc);

create table public.candidate_tags (
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  tag          text not null,
  added_by     uuid references public.profiles(id) on delete set null,
  added_at     timestamptz not null default now(),
  primary key (candidate_id, tag)
);

-- Опыт работы, распарсенный из резюме (фишка 3)
create table public.candidate_experience (
  id           uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  employer     text,
  position     text,
  started_on   date,
  ended_on     date,
  description  text,
  is_teaching  boolean not null default false,
  order_index  int not null default 0
);

-- ---------------------------------------------------------------------------
-- 5. СПРАВОЧНИК ПРИЧИН ОТКАЗА (фишка 33).
--    Структурная причина, а не свободный текст. 10–12 штук.
-- ---------------------------------------------------------------------------
create table public.rejection_reasons (
  id                uuid primary key default gen_random_uuid(),
  code              text unique not null,
  name              text not null,
  segment           public.archive_segment not null,
  candidate_wording text not null,        -- что увидит кандидат: внятно и без обид
  reactivate_after_months int,            -- когда вернуться к человеку
  is_active         boolean not null default true,
  order_index       int not null default 0
);

-- ---------------------------------------------------------------------------
-- 6. ОТКЛИК — центральная сущность.
--    Человек откликается на несколько вакансий, каждый раз новый отклик,
--    а история остаётся в карточке кандидата (фишки 6, 19, 22).
-- ---------------------------------------------------------------------------
create table public.applications (
  id             uuid primary key default gen_random_uuid(),
  candidate_id   uuid not null references public.candidates(id) on delete cascade,
  vacancy_id     uuid not null references public.vacancies(id) on delete cascade,
  stage_id       uuid not null references public.pipeline_stages(id) on delete restrict,
  status         public.application_status not null default 'active',
  source         public.candidate_source not null default 'other',
  external_id    text,                       -- id отклика на hh/avito

  applied_at     timestamptz not null default now(),
  stage_entered_at timestamptz not null default now(),
  sla_due_at     timestamptz,                -- срок ответа на текущем этапе
  last_contact_at timestamptz,
  closed_at      timestamptz,

  -- Итог отбора
  rejection_reason_id uuid references public.rejection_reasons(id) on delete set null,
  archive_segment public.archive_segment,
  rejection_note text,
  rejected_by    uuid references public.profiles(id) on delete set null,
  reactivate_after date,                     -- «вернуться в июне»

  -- Сколько критериев закрыто. Денормализация ради канбана и таблицы.
  criteria_met   int not null default 0,
  criteria_total int not null default 0,

  is_private     boolean not null default false,   -- приватный отклик (фишка 35)
  referral_id    uuid,                             -- FK ниже
  reactivated_from_application_id uuid references public.applications(id) on delete set null,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (candidate_id, vacancy_id)
);
create index idx_applications_vacancy on public.applications (vacancy_id, stage_id) where status = 'active';
create index idx_applications_candidate on public.applications (candidate_id, applied_at desc);
create index idx_applications_sla on public.applications (sla_due_at) where status = 'active';
create index idx_applications_segment on public.applications (archive_segment) where archive_segment is not null;

alter table public.candidate_notes
  add constraint notes_application_fk
  foreign key (application_id) references public.applications(id) on delete cascade;

-- Деньги по отклику — снова отдельной таблицей
create table public.application_compensation (
  application_id    uuid primary key references public.applications(id) on delete cascade,
  expected_salary   numeric(12,2),
  negotiated_salary numeric(12,2),
  is_net            boolean not null default true,
  note              text,
  -- Разговор с руководителем на языке денег (фишка 23): вилка X, рынок Y,
  -- переплата Z. Переплата считается в представлении v_salary_gap (файл 04),
  -- а не хранится: вилка вакансии может измениться.
  updated_at        timestamptz not null default now()
);

-- Результат по каждому критерию: «5 из 6» и главное — чем подтверждено.
-- Это и есть принцип «показываем основание, а не балл».
create table public.application_criteria_results (
  id           uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  criterion_id uuid not null references public.vacancy_criteria(id) on delete cascade,
  result       public.criterion_result not null default 'unknown',
  evidence     text,                                  -- цитата или ссылка на источник
  source       public.evidence_source not null default 'resume',
  confidence   numeric(3,2) check (confidence between 0 and 1),
  is_ai        boolean not null default true,
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz,
  updated_at   timestamptz not null default now(),
  unique (application_id, criterion_id)
);

-- История движения по этапам: где ломается воронка (фишка 48)
create table public.application_stage_history (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  from_stage_id  uuid references public.pipeline_stages(id) on delete set null,
  to_stage_id    uuid references public.pipeline_stages(id) on delete set null,
  moved_by       uuid references public.profiles(id) on delete set null,
  is_ai          boolean not null default false,
  reason         text,
  hours_in_prev_stage numeric(10,2),
  created_at     timestamptz not null default now()
);
create index idx_stage_history_app on public.application_stage_history (application_id, created_at);

-- Мнение команды о кандидате прямо в карточке отклика (фишка 38)
create table public.team_opinions (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  author_id      uuid not null references public.profiles(id) on delete cascade,
  verdict        text not null check (verdict in ('yes','doubt','no')),
  comment        text,
  created_at     timestamptz not null default now(),
  unique (application_id, author_id)
);

-- ---------------------------------------------------------------------------
-- 7. ТРИГГЕРЫ ЯДРА
-- ---------------------------------------------------------------------------

-- Пересчёт «N из M» при любом изменении результата по критерию
create or replace function public.recalc_application_criteria()
returns trigger language plpgsql security definer set search_path = public
as $fn$
declare
  v_app uuid;
begin
  -- На DELETE переменной NEW не существует, обращение к ней — ошибка,
  -- поэтому ветки разделены явно.
  if tg_op = 'DELETE' then
    v_app := old.application_id;
  else
    v_app := new.application_id;
  end if;

  update public.applications a
  set criteria_met = (
        select count(*) from public.application_criteria_results r
        where r.application_id = v_app and r.result = 'met'
      ),
      criteria_total = (
        select count(*) from public.vacancy_criteria c where c.vacancy_id = a.vacancy_id
      ),
      updated_at = now()
  where a.id = v_app;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$fn$;

create trigger t_recalc_criteria
  after insert or update or delete on public.application_criteria_results
  for each row execute function public.recalc_application_criteria();

-- Запись истории этапов и пересчёт SLA при переводе отклика
create or replace function public.on_application_stage_change()
returns trigger language plpgsql security definer set search_path = public
as $fn$
declare
  v_sla int;
begin
  if new.stage_id is distinct from old.stage_id then
    insert into public.application_stage_history
      (application_id, from_stage_id, to_stage_id, moved_by, reason,
       hours_in_prev_stage)
    values
      (new.id, old.stage_id, new.stage_id, auth.uid(), new.rejection_note,
       extract(epoch from (now() - old.stage_entered_at)) / 3600.0);

    new.stage_entered_at := now();

    select sla_hours into v_sla from public.pipeline_stages where id = new.stage_id;
    new.sla_due_at := case when v_sla is null then null else now() + make_interval(hours => v_sla) end;
  end if;

  if new.status = 'hired' and old.status <> 'hired' then
    new.closed_at := now();
    update public.vacancies set hired_count = hired_count + 1 where id = new.vacancy_id;
  end if;

  if new.status in ('rejected','withdrawn') and old.status not in ('rejected','withdrawn') then
    new.closed_at := now();
  end if;

  return new;
end;
$fn$;

create trigger t_application_stage_change
  before update on public.applications
  for each row execute function public.on_application_stage_change();

-- Подготовка нового отклика: первый этап, срок ответа, число критериев,
-- предупреждение о стоп-листе (фишка 7).
-- Принцип «ноль ручного ввода» действует и на API: клиенту достаточно передать
-- кандидата и вакансию, всё остальное система проставляет сама.
create or replace function public.prepare_new_application()
returns trigger language plpgsql security definer set search_path = public
as $fn$
declare
  v_blacklisted boolean;
  v_sla int;
begin
  -- Первый этап воронки той вакансии, на которую откликнулись
  if new.stage_id is null then
    select s.id, s.sla_hours into new.stage_id, v_sla
    from public.pipeline_stages s
    join public.vacancies v on v.pipeline_id = s.pipeline_id
    where v.id = new.vacancy_id
    order by s.order_index
    limit 1;
  else
    select sla_hours into v_sla from public.pipeline_stages where id = new.stage_id;
  end if;

  if new.sla_due_at is null and v_sla is not null then
    new.sla_due_at := now() + make_interval(hours => v_sla);
  end if;

  -- Сколько критериев предстоит закрыть
  select count(*) into new.criteria_total
  from public.vacancy_criteria c where c.vacancy_id = new.vacancy_id;

  -- Стоп-лист: отклик создаём, но сразу останавливаем. HR должен увидеть
  -- предупреждение, а не молча потерять человека.
  select is_blacklisted into v_blacklisted from public.candidates where id = new.candidate_id;
  if v_blacklisted then
    new.status := 'on_hold';
  end if;

  return new;
end;
$fn$;

create trigger t_prepare_application
  before insert on public.applications
  for each row execute function public.prepare_new_application();

-- Поисковый вектор кандидата
create or replace function public.candidates_search_tsv()
returns trigger language plpgsql set search_path = public
as $fn$
begin
  new.search_tsv :=
      setweight(to_tsvector('russian', coalesce(new.full_name,'')), 'A')
   || setweight(to_tsvector('russian', coalesce(new.city,'')), 'B')
   || setweight(to_tsvector('russian', coalesce(new.resume_text,'')), 'C');
  return new;
end;
$fn$;

create trigger t_candidates_tsv
  before insert or update of full_name, city, resume_text on public.candidates
  for each row execute function public.candidates_search_tsv();

-- updated_at
create trigger t_vacancies_touch    before update on public.vacancies    for each row execute function public.touch_updated_at();
create trigger t_candidates_touch   before update on public.candidates   for each row execute function public.touch_updated_at();
create trigger t_applications_touch before update on public.applications for each row execute function public.touch_updated_at();
create trigger t_requisitions_touch before update on public.requisitions for each row execute function public.touch_updated_at();

-- Аудит на чувствительном
create trigger t_audit_vacancies   after insert or update or delete on public.vacancies            for each row execute function public.audit_trigger();
create trigger t_audit_applications after insert or update or delete on public.applications        for each row execute function public.audit_trigger();
create trigger t_audit_vac_comp    after insert or update or delete on public.vacancy_compensation for each row execute function public.audit_trigger();
create trigger t_audit_user_roles  after insert or update or delete on public.user_roles           for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------------
-- 8. RLS
-- ---------------------------------------------------------------------------
alter table public.pipelines                    enable row level security;
alter table public.pipeline_stages              enable row level security;
alter table public.requisitions                 enable row level security;
alter table public.vacancies                    enable row level security;
alter table public.vacancy_compensation         enable row level security;
alter table public.vacancy_criteria             enable row level security;
alter table public.vacancy_versions             enable row level security;
alter table public.vacancy_approvals            enable row level security;
alter table public.vacancy_publications         enable row level security;
alter table public.candidates                   enable row level security;
alter table public.candidate_profiles           enable row level security;
alter table public.candidate_notes              enable row level security;
alter table public.candidate_tags               enable row level security;
alter table public.candidate_experience         enable row level security;
alter table public.rejection_reasons            enable row level security;
alter table public.applications                 enable row level security;
alter table public.application_compensation     enable row level security;
alter table public.application_criteria_results enable row level security;
alter table public.application_stage_history    enable row level security;
alter table public.team_opinions                enable row level security;
