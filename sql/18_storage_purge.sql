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
