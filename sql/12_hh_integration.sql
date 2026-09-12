-- ============================================================================
-- РАСТИМ · платформа найма
-- Миграция 12. ИНТЕГРАЦИЯ С HH.RU (фишка 30).
--
-- Что она даёт: вакансия заводится один раз — здесь, — и уходит на hh
-- нажатием кнопки. Отклики приходят обратно в ту же воронку, где лежат
-- отклики из Телеграма и из базы. Рекрутер перестаёт вести две системы
-- и переносить людей копированием.
--
-- Токены доступа живут в базе, а не в переменных окружения: работодателей
-- может быть несколько (филиалы, юрлица), и доступ у каждого свой. Читать
-- их может только суперпользователь, функции ходят под служебным ключом.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. ПОДКЛЮЧЁННЫЕ РАБОТОДАТЕЛИ
--
--    hh выдаёт access_token на две недели и refresh_token к нему. Refresh
--    одноразовый: после обмена старый перестаёт работать, и новый нужно
--    сохранить сразу. Поэтому оба лежат здесь, а не в памяти функции.
-- ---------------------------------------------------------------------------
create table if not exists public.hh_accounts (
  id             uuid primary key default gen_random_uuid(),

  employer_id    text unique,          -- id работодателя на hh
  employer_name  text,
  manager_id     text,                 -- от чьего имени работаем
  manager_name   text,

  access_token   text not null,
  refresh_token  text not null,
  expires_at     timestamptz not null,

  is_active      boolean not null default true,
  last_error     text,
  last_sync_at   timestamptz,          -- когда последний раз забирали отклики

  connected_by   uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger t_hh_accounts_touch before update on public.hh_accounts
  for each row execute function public.touch_updated_at();

comment on table public.hh_accounts is
  'Доступы к hh по работодателям. Токены наружу не отдаются — для интерфейса есть v_hh_accounts.';

-- ---------------------------------------------------------------------------
-- 2. ЧТО ВИДИТ ПРИЛОЖЕНИЕ
--    Токены не покидают базу. Интерфейсу нужно имя работодателя, состояние
--    и когда последний раз синхронизировались.
-- ---------------------------------------------------------------------------
create or replace view public.v_hh_accounts
with (security_invoker = true) as
select
  a.id,
  a.employer_id,
  a.employer_name,
  a.manager_name,
  a.is_active,
  a.last_error,
  a.last_sync_at,
  a.created_at,
  -- Живой ли доступ. Токен протух — не поломка, его обновит первая же
  -- операция; но если протух и refresh, придётся подключаться заново.
  (a.expires_at > now()) as token_valid,
  a.expires_at,
  (select count(*) from public.vacancy_publications p
    where p.board = 'hh' and p.archived_at is null) as published_count
from public.hh_accounts a;

-- ---------------------------------------------------------------------------
-- 3. ЧЕГО НЕ ХВАТАЛО ВАКАНСИИ
--
--    hh не принимает город и направление словами: у него свои справочники
--    регионов и профессиональных ролей. Догадываться за пользователя нельзя —
--    ошибётся система, а объясняться с кандидатами придётся ему. Поэтому
--    идентификаторы хранятся явно: подставляются автоматически по названию,
--    но остаются видимыми и правимыми.
-- ---------------------------------------------------------------------------
alter table public.vacancies
  add column if not exists hh_area_id text,
  add column if not exists hh_professional_role_id text;

comment on column public.vacancies.hh_area_id is
  'Регион в справочнике hh. Подставляется по названию города, но правится вручную.';
comment on column public.vacancies.hh_professional_role_id is
  'Профессиональная роль в справочнике hh. Без неё вакансию не примут.';

-- ---------------------------------------------------------------------------
-- 4. СПРАВОЧНИКИ HH
--    Кэш, чтобы не тянуть дерево регионов при каждой публикации. Обновляется
--    функцией по требованию: у hh они меняются редко.
-- ---------------------------------------------------------------------------
create table if not exists public.hh_dictionaries (
  kind        text not null,      -- 'area' | 'professional_role'
  external_id text not null,
  name        text not null,
  parent_id   text,
  synced_at   timestamptz not null default now(),
  primary key (kind, external_id)
);

create index if not exists idx_hh_dict_name
  on public.hh_dictionaries using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 5. ОТКУДА ПРИШЁЛ ОТКЛИК
--    external_id у отклика уже есть. Добавляем ссылку на резюме: рекрутеру
--    нужно открыть его на hh, пока мы не научились забирать файл целиком.
-- ---------------------------------------------------------------------------
alter table public.applications
  add column if not exists external_url text;

-- ---------------------------------------------------------------------------
-- 6. ДОСТУП
--    Токен hh — ключ от вакансий и откликов компании. Настраивает
--    суперпользователь, смотрит HR.
-- ---------------------------------------------------------------------------
alter table public.hh_accounts     enable row level security;
alter table public.hh_dictionaries enable row level security;

drop policy if exists hh_su_all on public.hh_accounts;
create policy hh_su_all on public.hh_accounts
  for all using (public.is_superuser()) with check (public.is_superuser());

drop policy if exists hh_staff_read on public.hh_accounts;
create policy hh_staff_read on public.hh_accounts
  for select using (public.is_hr() or public.is_director());

drop policy if exists hh_dict_read on public.hh_dictionaries;
create policy hh_dict_read on public.hh_dictionaries
  for select using (public.is_staff());

commit;

-- ============================================================================
-- ЧТО ДАЛЬШЕ
--
-- Секреты приложения задаются один раз в Edge Functions → Secrets:
--   HH_CLIENT_ID      — из кабинета dev.hh.ru
--   HH_CLIENT_SECRET  — оттуда же
--   HH_REDIRECT_URI   — https://<домен>/auth/hh/callback
--
-- Дальше всё через интерфейс: Настройка → hh.ru → «Подключить».
-- ============================================================================
