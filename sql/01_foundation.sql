-- ============================================================================
-- РАСТИМ · платформа найма
-- Миграция 01. ФУНДАМЕНТ: расширения, роли, оргструктура, профили,
--              функции доступа, аудит, настройки компании.
-- PostgreSQL 15+ (Supabase / Lovable Cloud)
-- ============================================================================
-- ТРИ ПРАВИЛА, КОТОРЫЕ НЕЛЬЗЯ НАРУШАТЬ:
--   1. Роли НИКОГДА не хранятся в profiles и не приходят с клиента.
--      Только public.user_roles + функция has_role(). Иначе любой пользователь
--      сможет назначить себя суперпользователем через обычный UPDATE.
--   2. Все функции доступа — SECURITY DEFINER, STABLE, SET search_path = public.
--      Без этого RLS уходит в бесконечную рекурсию.
--   3. RLS включён на КАЖДОЙ таблице. Политики — в 05_rls.sql.
-- ============================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";    -- нечёткий поиск по ФИО
create extension if not exists "vector";     -- смысловой поиск по базе (фишки 15, 16)
-- Если Supabase ставит расширения в схему extensions и тип vector не находится,
-- выполните: create extension if not exists vector with schema extensions;
-- и объявите колонку как extensions.vector(1536) в миграции 02.

-- ---------------------------------------------------------------------------
-- 1. РОЛИ
-- ---------------------------------------------------------------------------
create type public.app_role as enum (
  'superuser',     -- Суперпользователь: настройки, роли, аудит, всё
  'director',      -- Руководитель (владелец): дашборд, согласование вакансий и офферов
  'hr_manager',    -- HR-менеджер: воронка, база, коммуникации. Основной пользователь
  'dept_head',     -- Руководитель подразделения: только свои вакансии и отклики
  'line_manager',  -- Непосредственный руководитель: интервью, фидбек, онбординг команды
  'employee',      -- Сотрудник: своя карточка, ИПР, наставничество, рефералы
  'candidate'      -- Кандидат: только свои отклики и свои документы
);

comment on type public.app_role is
  'Семь ролей платформы. Одному пользователю можно выдать несколько ролей.';

-- Ссылка на любую сущность системы: нужна уведомлениям и очереди заданий ИИ,
-- чтобы не заводить по колонке на каждый тип объекта.
create type public.entity_kind as enum (
  'vacancy','application','candidate','offer','interview','assessment','employee','document'
);

-- Уровень позиции. Заменяет отраслевые «ступени»: подходит любой роли.
create type public.grade_level as enum ('intern','junior','middle','senior','lead');

-- Документы для оформления. Первые четыре нужны почти везде, остальные —
-- отраслевые. Какие обязательны, решает вакансия (vacancies.required_documents),
-- а не зашитый в код список: у разработчика, бухгалтера и водителя он разный.
create type public.document_kind as enum (
  'passport','snils','inn','work_book','diploma','qualification',
  'medical_certificate','background_check','military_id','other'
);

-- ---------------------------------------------------------------------------
-- 2. ОРГАНИЗАЦИОННАЯ СТРУКТУРА
-- ---------------------------------------------------------------------------
create table public.departments (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  code              text unique,
  parent_id         uuid references public.departments(id) on delete set null,
  head_user_id      uuid,   -- FK на profiles добавляем ниже, после её создания
  cost_per_idle_day numeric(12,2) not null default 0,  -- цена простоя вакансии, руб/день (фишка 45)
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index idx_departments_parent on public.departments (parent_id);

-- ---------------------------------------------------------------------------
-- 3. ПРОФИЛИ (1:1 с auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  full_name        text not null default '',
  email            text,
  phone            text,
  avatar_url       text,
  position_title   text,
  department_id    uuid references public.departments(id) on delete set null,
  telegram_user_id bigint unique,     -- вход и уведомления через Телеграм
  timezone         text not null default 'Europe/Moscow',
  is_active        boolean not null default true,
  last_seen_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index idx_profiles_department on public.profiles (department_id);
create index idx_profiles_name_trgm on public.profiles using gin (full_name gin_trgm_ops);

alter table public.departments
  add constraint departments_head_fk
  foreign key (head_user_id) references public.profiles(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 4. РОЛИ ПОЛЬЗОВАТЕЛЕЙ — отдельная таблица, это принципиально
-- ---------------------------------------------------------------------------
create table public.user_roles (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  role          public.app_role not null,
  department_id uuid references public.departments(id) on delete cascade,
  -- Область действия роли. Для dept_head и line_manager роль действует только
  -- внутри указанного подразделения и всех его детей. NULL = вся компания.
  granted_by    uuid references public.profiles(id) on delete set null,
  granted_at    timestamptz not null default now(),
  expires_at    timestamptz,
  unique (user_id, role, department_id)
);
create index idx_user_roles_user on public.user_roles (user_id);
create index idx_user_roles_role on public.user_roles (role);

-- ---------------------------------------------------------------------------
-- 5. ФУНКЦИИ ДОСТУПА
-- ---------------------------------------------------------------------------
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $fn$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = _user_id
      and ur.role = _role
      and (ur.expires_at is null or ur.expires_at > now())
  );
$fn$;

create or replace function public.is_superuser()
returns boolean language sql stable security definer set search_path = public
as $fn$ select public.has_role(auth.uid(), 'superuser'); $fn$;

create or replace function public.is_director()
returns boolean language sql stable security definer set search_path = public
as $fn$ select public.has_role(auth.uid(),'director') or public.has_role(auth.uid(),'superuser'); $fn$;

create or replace function public.is_hr()
returns boolean language sql stable security definer set search_path = public
as $fn$ select public.has_role(auth.uid(),'hr_manager') or public.has_role(auth.uid(),'superuser'); $fn$;

-- Любой внутренний пользователь, то есть все, кроме кандидата
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public
as $fn$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('superuser','director','hr_manager','dept_head','line_manager','employee')
      and (ur.expires_at is null or ur.expires_at > now())
  );
$fn$;

-- Подразделения, которыми пользователь руководит, включая всё дерево вниз
create or replace function public.my_department_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $fn$
  with recursive roots as (
    select coalesce(ur.department_id, p.department_id) as id
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = auth.uid()
      and ur.role in ('dept_head','line_manager')
      and (ur.expires_at is null or ur.expires_at > now())
    union
    select d.id from public.departments d where d.head_user_id = auth.uid()
  ),
  tree as (
    select id from roots where id is not null
    union
    select d.id from public.departments d join tree t on d.parent_id = t.id
  )
  select id from tree;
$fn$;

-- Функция my_candidate_id() создаётся в миграции 02: она обращается к таблице
-- candidates, которой на этом шаге ещё нет, а тело SQL-функции проверяется
-- в момент создания.

-- Право видеть деньги: вилку, ожидания кандидата, стоимость найма (фишка 64).
-- Руководитель подразделения видит вилку только по своим вакансиям — это
-- дополнительно проверяется в политике конкретной таблицы.
create or replace function public.can_see_money()
returns boolean language sql stable security definer set search_path = public
as $fn$
  select public.is_director() or public.is_hr() or public.has_role(auth.uid(),'dept_head');
$fn$;

-- ---------------------------------------------------------------------------
-- 6. АВТОСОЗДАНИЕ ПРОФИЛЯ ПРИ РЕГИСТРАЦИИ
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $fn$
begin
  insert into public.profiles (id, full_name, email, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;

  -- Роль по умолчанию — самая безопасная. Повышает только суперпользователь.
  insert into public.user_roles (user_id, role)
  values (new.id, 'candidate')
  on conflict do nothing;

  return new;
end;
$fn$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 7. UPDATED_AT
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

create trigger t_departments_touch before update on public.departments
  for each row execute function public.touch_updated_at();
create trigger t_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 8. АУДИТ
-- «Меня будут по этой системе оценивать и наказывать» — возражение HR.
-- Поэтому журнал есть, но читать его может только суперпользователь.
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id             bigserial primary key,
  actor_id       uuid references public.profiles(id) on delete set null,
  action         text not null,       -- INSERT / UPDATE / DELETE / LOGIN / EXPORT
  table_name     text not null,
  record_id      uuid,
  old_data       jsonb,
  new_data       jsonb,
  changed_fields text[],
  created_at     timestamptz not null default now()
);
create index idx_audit_record on public.audit_log (table_name, record_id);
create index idx_audit_actor on public.audit_log (actor_id, created_at desc);

create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public
as $fn$
declare
  v_old jsonb;
  v_new jsonb;
  v_changed text[];
begin
  -- Ветки разделены намеренно: в PL/pgSQL обращение к NEW на DELETE (и к OLD
  -- на INSERT) вызывает ошибку «record is not assigned yet», а не NULL.
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);

    select array_agg(n.key) into v_changed
    from jsonb_each(v_new) n
    where n.value is distinct from v_old -> n.key;

    if v_changed is null then          -- реальных изменений нет, не шумим
      return new;
    end if;
  else
    v_old := to_jsonb(old);
  end if;

  insert into public.audit_log (actor_id, action, table_name, record_id, old_data, new_data, changed_fields)
  values (
    auth.uid(), tg_op, tg_table_name,
    coalesce((v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid),
    v_old, v_new, v_changed
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 9. НАСТРОЙКИ КОМПАНИИ (одна строка) и ЦЕННОСТИ
-- ---------------------------------------------------------------------------
create table public.company_settings (
  id                            boolean primary key default true check (id),
  company_name                  text not null default 'Растим',
  hr_hour_cost                  numeric(10,2) not null default 800,  -- для стоимости найма
  default_touch_limit_per_week  int not null default 3,              -- антиспам, фишка 41
  manager_sla_hours             int not null default 24,             -- SLA руководителя, фишка 40
  escalation_after_hours        int not null default 48,
  candidate_data_retention_days int not null default 1095,           -- 3 года, 152-ФЗ, фишка 62
  updated_at                    timestamptz not null default now()
);
insert into public.company_settings (id) values (true) on conflict do nothing;

-- Формализованные ценности. Без них ИИ-фидбек по кейсам (фишка 24) льёт воду,
-- а это самое сильное отличие платформы.
create table public.company_values (
  id           uuid primary key default gen_random_uuid(),
  code         text unique not null,
  name         text not null,
  description  text not null,
  good_example text,      -- эталонный ответ «так — да»
  bad_example  text,      -- «так — нет»
  order_index  int not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 10. RLS включаем сразу, политики — в 05_rls.sql
-- ---------------------------------------------------------------------------
alter table public.departments      enable row level security;
alter table public.profiles         enable row level security;
alter table public.user_roles       enable row level security;
alter table public.audit_log        enable row level security;
alter table public.company_settings enable row level security;
alter table public.company_values   enable row level security;
