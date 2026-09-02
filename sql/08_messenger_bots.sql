-- ============================================================================
-- РАСТИМ · платформа найма
-- Миграция 08. НЕСКОЛЬКО БОТОВ.
--
-- Один бот на компанию — это допущение, которое ломается почти сразу.
-- Разные бренды, разные регионы, массовый подбор отдельно от точечного,
-- отдельный бот под кампанию — везде нужен свой аккаунт в Телеграме, своё
-- имя и свой тон. Поэтому бот становится строкой в таблице, а не
-- переменной окружения.
--
-- Диалог помнит, через какого бота он идёт: отвечать нужно из того же
-- аккаунта, в который написал человек. Ответ «не от того бота» кандидат
-- либо не получит, либо примет за спам.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. БОТЫ
-- ---------------------------------------------------------------------------
create table if not exists public.messenger_bots (
  id           uuid primary key default gen_random_uuid(),
  channel      public.channel_kind not null default 'telegram',

  name         text not null,           -- как называем внутри: «Массовый подбор»
  username     text,                    -- @rastim_hr_bot, для ссылки t.me/...
  external_id  text,                    -- id бота в Телеграме, из getMe

  -- Токен доступа. Лежит здесь, потому что ботов много и добавляются они
  -- на ходу — в переменные окружения такое не положишь. Строку защищает
  -- RLS: читать её может только суперпользователь, а функции доставки
  -- ходят под служебным ключом, минуя клиент. В приложение токен не
  -- отдаётся никогда — для интерфейса есть представление ниже.
  token        text not null,

  -- Секрет вебхука. Телеграм присылает его заголовком при каждом вызове;
  -- по нему функция понимает, что запрос настоящий. У каждого бота свой:
  -- утечка одного не открывает остальных.
  webhook_secret text not null,

  -- Ограничение области. NULL — бот общий для всей компании.
  department_id uuid references public.departments(id) on delete set null,

  is_active    boolean not null default true,
  is_default   boolean not null default false,  -- через него уходят исходящие, если диалог новый

  last_error   text,                    -- что ответил Телеграм в последний раз, если ответил плохо
  last_seen_at timestamptz,             -- когда через бота проходило сообщение

  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (channel, external_id)
);

create index if not exists idx_bots_active on public.messenger_bots (is_active) where is_active;

-- Ровно один бот по умолчанию на канал. Частичный уникальный индекс —
-- проверка на стороне базы, а не на стороне доброй воли приложения.
create unique index if not exists idx_bots_one_default
  on public.messenger_bots (channel) where is_default;

create trigger t_bots_touch before update on public.messenger_bots
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. ДИАЛОГ ЗНАЕТ СВОЕГО БОТА
-- ---------------------------------------------------------------------------
alter table public.conversations
  add column if not exists bot_id uuid references public.messenger_bots(id) on delete set null;

create index if not exists idx_conversations_bot on public.conversations (bot_id);

comment on column public.conversations.bot_id is
  'Через какого бота идёт диалог. Отвечать нужно из того же аккаунта, в который написал человек.';

-- ---------------------------------------------------------------------------
-- 3. ЧТО ВИДИТ ПРИЛОЖЕНИЕ
--    Токен и секрет вебхука не покидают базу. Интерфейсу нужно имя,
--    состояние и статистика — их и отдаём.
-- ---------------------------------------------------------------------------
create or replace view public.v_messenger_bots
with (security_invoker = true) as
select
  b.id,
  b.channel,
  b.name,
  b.username,
  b.department_id,
  d.name as department_name,
  b.is_active,
  b.is_default,
  b.last_error,
  b.last_seen_at,
  b.created_at,
  -- Токен наружу не отдаём. Показываем только хвост, чтобы человек
  -- узнал свой бот в списке и не перепутал два похожих.
  '…' || right(b.token, 6) as token_hint,
  (select count(*) from public.conversations c where c.bot_id = b.id) as conversations_count
from public.messenger_bots b
left join public.departments d on d.id = b.department_id;

-- ---------------------------------------------------------------------------
-- 4. ДОСТУП
--    Токен — это ключ от переписки с кандидатами. Настраивать ботов может
--    только суперпользователь; HR видит их через представление выше.
-- ---------------------------------------------------------------------------
alter table public.messenger_bots enable row level security;

drop policy if exists bots_su_all on public.messenger_bots;
create policy bots_su_all on public.messenger_bots
  for all using (public.is_superuser()) with check (public.is_superuser());

-- Представление объявлено с security_invoker, то есть проверяет права
-- вызывающего по таблице. Чтобы HR видел список ботов, но не токены,
-- даём отдельную политику на чтение — она нужна именно представлению.
drop policy if exists bots_staff_read on public.messenger_bots;
create policy bots_staff_read on public.messenger_bots
  for select using (public.is_hr() or public.is_director());

commit;

-- ============================================================================
-- ПОСЛЕ ЭТОЙ МИГРАЦИИ
--
-- Бот добавляется через интерфейс: Настройка → Боты. Там же показывается
-- адрес вебхука, который нужно зарегистрировать у Телеграма — по одному
-- на бота:
--
--   https://<проект>.supabase.co/functions/v1/telegram-webhook/<id бота>
--
-- Регистрация выполняется приложением автоматически при добавлении бота:
-- функция bot-register сама вызывает setWebhook. Руками ничего вводить
-- не нужно — принцип «ноль ручного ввода» касается и настройки.
-- ============================================================================
