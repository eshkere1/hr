-- ============================================================================
-- 18. ОЧЕРЕДЬ НА УДАЛЕНИЕ ФАЙЛОВ
--
-- Проверил предыдущую миграцию на живой базе и получил отказ:
--
--   ERROR: Direct deletion from storage tables is not allowed.
--          Use the Storage API instead.
--
-- Платформа защищается триггером, и защищается правильно: строку в таблице
-- удалить легко, а байты в объектном хранилище останутся навсегда, и никто
-- уже не узнает, чьи они. Значит, удалять файлы обязан тот, кто умеет
-- обращаться к хранилищу, — серверная функция, а не SQL.
--
-- База при обезличивании больше не удаляет файлы, а называет их: кладёт
-- пути в очередь. Разбирает очередь функция storage-purge, у неё есть
-- служебный ключ и доступ к API хранилища.
--
-- Почему очередь, а не прямой вызов из базы: чтобы позвать функцию из SQL,
-- служебный ключ пришлось бы вписать в текст задания и оставить в базе
-- навсегда. Очередь этого не требует и вдобавок переживает сбой — если
-- уборщик не пришёл сегодня, записи дождутся его завтра.
-- ============================================================================

create table if not exists public.storage_purge_queue (
  id           uuid primary key default gen_random_uuid(),
  bucket       text not null,
  path         text not null,
  candidate_id uuid,
  reason       text,
  queued_at    timestamptz not null default now(),
  purged_at    timestamptz,
  last_error   text,
  unique (bucket, path)
);

create index if not exists idx_purge_pending
  on public.storage_purge_queue (queued_at) where purged_at is null;

-- Ни одной политики: очередь не для интерфейса. Читает и чистит её только
-- служебная роль, а RLS без политик означает «никому».
alter table public.storage_purge_queue enable row level security;

comment on table public.storage_purge_queue is
  'Файлы, которые нужно убрать из хранилища. Наполняется обезличиванием, разбирается функцией storage-purge.';

-- ---------------------------------------------------------------------------
-- Обезличивание теперь ставит файлы в очередь, а не пытается их удалить.
--
-- Возвращает число поставленных в очередь. Ноль означает «файлов не было»,
-- а не «не получилось»: отличать одно от другого важно, когда через полгода
-- кто-то спросит, что именно стёрли по запросу человека.
-- ---------------------------------------------------------------------------
create or replace function public.forget_candidate_files(_candidate_id uuid)
returns int
language plpgsql security definer set search_path = public
as $fn$
declare
  v_count int := 0;
begin
  insert into public.storage_purge_queue (bucket, path, candidate_id, reason)
  select o.bucket_id, o.name, _candidate_id, 'anonymize'
  from storage.objects o
  where o.bucket_id = 'candidate-docs'
    and o.name like _candidate_id::text || '/%'
  on conflict (bucket, path) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end
$fn$;

revoke all on function public.forget_candidate_files(uuid) from public, anon, authenticated;

comment on function public.forget_candidate_files is
  'Ставит файлы кандидата в очередь на удаление из хранилища. Сама не удаляет: платформа запрещает удаление из storage напрямую.';

-- ---------------------------------------------------------------------------
-- Строгое «нет» вместо «неизвестно»
--
-- Проверил функции доступа из-под постороннего вошедшего пользователя, и они
-- ответили не false, а null: у человека без профиля my_candidate_id() пуст,
-- сравнение с ним даёт неизвестность, и вся цепочка ИЛИ становится null.
--
-- Для политики это тот же отказ — RLS пускает только по true. Но правило
-- «нас спасает то, что null не равен true» слишком тонкое, чтобы на нём
-- стоять: достаточно кому-нибудь написать not can_see_...(x) — и получится
-- дыра, потому что not null это снова null, а не «да».
--
-- Функция обязана отвечать «да» или «нет».
-- ---------------------------------------------------------------------------
create or replace function public.can_see_candidate_files(_folder text)
returns boolean
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_id uuid;
begin
  begin
    v_id := _folder::uuid;
  exception when others then
    return false;
  end;

  return coalesce(public.is_hr(), false)
      or coalesce(public.is_director(), false)
      or coalesce(v_id = public.my_candidate_id(), false)
      or exists (
        select 1 from public.applications a
        where a.candidate_id = v_id
          and public.can_see_vacancy(a.vacancy_id)
      );
end
$fn$;

create or replace function public.can_edit_candidate_files(_folder text)
returns boolean
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_id uuid;
begin
  begin
    v_id := _folder::uuid;
  exception when others then
    return false;
  end;

  return coalesce(public.is_hr(), false)
      or coalesce(v_id = public.my_candidate_id(), false);
end
$fn$;

revoke all on function public.can_see_candidate_files(text)  from public, anon;
revoke all on function public.can_edit_candidate_files(text) from public, anon;
grant execute on function public.can_see_candidate_files(text)  to authenticated;
grant execute on function public.can_edit_candidate_files(text) to authenticated;
