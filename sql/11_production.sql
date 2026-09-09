-- ============================================================================
-- РАСТИМ · платформа найма
-- Миграция 11. ГОТОВНОСТЬ К БОЕВОЙ РАБОТЕ.
--
-- До сих пор система умела собирать данные, но не умела с ними расставаться.
-- Для демонстрации это незаметно, для работы с живыми людьми — нарушение:
--
--   1. Поле retention_until никто не заполнял, и по нему никто не чистил.
--      152-ФЗ требует удалять данные по истечении заявленного срока.
--   2. Кнопка «удалить мои данные» создавала строку в deletion_requests —
--      и на этом всё. Кнопка, которая ничего не делает, хуже её отсутствия:
--      она обещает то, чего нет.
--
-- Здесь обе дыры закрыты, и закрыты обезличиванием, а не удалением строк.
-- Почему — объяснено ниже, у функции anonymize_candidate.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. СРОК ХРАНЕНИЯ ПРОСТАВЛЯЕТСЯ САМ
--    Считается от последней активности, а не от первого контакта: человек,
--    который откликался год назад и вернулся вчера, не должен исчезнуть
--    завтра.
-- ---------------------------------------------------------------------------
create or replace function public.set_candidate_retention()
returns trigger language plpgsql security definer set search_path = public
as $fn$
declare
  v_days int;
begin
  select candidate_data_retention_days into v_days
  from public.company_settings where id;

  new.retention_until := (
    coalesce(new.last_activity_at, new.first_seen_at, now())
    + make_interval(days => coalesce(v_days, 1095))
  )::date;

  return new;
end;
$fn$;

drop trigger if exists t_candidate_retention on public.candidates;
create trigger t_candidate_retention
  before insert or update of last_activity_at on public.candidates
  for each row execute function public.set_candidate_retention();

comment on function public.set_candidate_retention is
  'Срок хранения от последней активности. Вернувшийся кандидат не должен исчезнуть завтра.';

-- Проставляем задним числом тем, кто уже в базе.
update public.candidates c
set retention_until = (
  coalesce(c.last_activity_at, c.first_seen_at, now())
  + make_interval(days => (select candidate_data_retention_days from public.company_settings where id))
)::date
where c.retention_until is null;

-- ---------------------------------------------------------------------------
-- 2. ОБЕЗЛИЧИВАНИЕ
--
--    Удалять строку кандидата целиком — заманчиво и неправильно. Каскад
--    унесёт вместе с ней отклики, а с ними историю воронки: конверсия за
--    прошлый квартал изменится задним числом, и отчёты перестанут сходиться
--    сами с собой.
--
--    152-ФЗ требует, чтобы персональные данные перестали быть персональными.
--    Он не требует стирать факт «на эту вакансию был отклик, он дошёл до
--    интервью и закончился отказом». Поэтому убираем всё, по чему человека
--    можно узнать, и оставляем обезличенный след для статистики.
-- ---------------------------------------------------------------------------
create or replace function public.anonymize_candidate(_candidate_id uuid, _reason text default 'request')
returns void language plpgsql security definer set search_path = public
as $fn$
begin
  -- Переписка: тексты удаляем целиком. В них человек называет себя,
  -- работодателя, зарплату — обезличить их выборочно нельзя.
  delete from public.messages m
  using public.conversations c
  where m.conversation_id = c.id and c.candidate_id = _candidate_id;

  delete from public.conversations where candidate_id = _candidate_id;

  -- Документы: сами файлы и номера. Факт «документы были собраны» не нужен.
  delete from public.candidate_documents where candidate_id = _candidate_id;

  -- Заметки команды: свободный текст о человеке.
  delete from public.candidate_notes where candidate_id = _candidate_id;

  -- Ответы на задания: в них человек рассказывает о себе.
  update public.assessments a
  set answers = '[]'::jsonb, media_url = null
  from public.applications ap
  where a.application_id = ap.id and ap.candidate_id = _candidate_id;

  -- Опыт работы: названия компаний.
  delete from public.candidate_experience where candidate_id = _candidate_id;

  -- Профиль: навыки и уровень не персональны, зарплатные ожидания — уже да.
  update public.candidate_profiles
  set expected_salary = null, schedule_note = null, certifications = null, education = null
  where candidate_id = _candidate_id;

  -- Сама карточка. Имя заменяем на пометку, а не на пустоту: в интерфейсе
  -- должно быть видно, что человек не потерялся, а был обезличен по закону.
  update public.candidates
  set full_name = 'Данные удалены по запросу',
      phones = '{}',
      emails = '{}',
      telegram_user_id = null,
      telegram_username = null,
      city = null,
      birth_date = null,
      photo_url = null,
      current_employer = null,
      resume_text = null,
      resume_file_url = null,
      embedding = null,
      profile_id = null,
      consent_pd_granted = false,
      retention_until = null,
      deletion_requested_at = coalesce(deletion_requested_at, now())
  where id = _candidate_id;

  -- Согласия отзываем: обработка прекращена.
  update public.consents
  set revoked_at = coalesce(revoked_at, now())
  where candidate_id = _candidate_id and revoked_at is null;

  insert into public.audit_log (action, table_name, record_id, new_data)
  values ('ANONYMIZE', 'candidates', _candidate_id,
          jsonb_build_object('reason', _reason, 'at', now()));
end;
$fn$;

comment on function public.anonymize_candidate is
  'Убирает всё, по чему человека можно узнать, сохраняя обезличенный след для статистики найма.';

-- ---------------------------------------------------------------------------
-- 3. ОБРАБОТКА ЗАПРОСОВ НА УДАЛЕНИЕ
--    Закон даёт 30 дней. Мы не тянем: обрабатываем на следующие сутки —
--    ожидание тут никому не выгодно.
-- ---------------------------------------------------------------------------
create or replace function public.process_deletion_requests()
returns int language plpgsql security definer set search_path = public
as $fn$
declare
  r record;
  n int := 0;
begin
  for r in
    select id, candidate_id from public.deletion_requests
    where processed_at is null
  loop
    perform public.anonymize_candidate(r.candidate_id, 'deletion_request');
    update public.deletion_requests
    set processed_at = now(), note = coalesce(note, '') || ' [обработано автоматически]'
    where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 4. ЧИСТКА ПО СРОКУ ХРАНЕНИЯ
--    Тех, кто в стоп-листе, не трогаем: стоп-лист существует ровно для того,
--    чтобы человек не появился снова, и его обезличивание сделало бы список
--    бесполезным. Хранить в нём достаточно минимума, и это отдельное
--    законное основание.
-- ---------------------------------------------------------------------------
create or replace function public.purge_expired_candidates()
returns int language plpgsql security definer set search_path = public
as $fn$
declare
  r record;
  n int := 0;
begin
  for r in
    select id from public.candidates
    where retention_until is not null
      and retention_until < current_date
      and not is_blacklisted
  loop
    perform public.anonymize_candidate(r.id, 'retention_expired');
    n := n + 1;
  end loop;
  return n;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 5. РАСПИСАНИЕ
--    Обе задачи бесполезны, если их никто не запускает. Раз в сутки ночью.
-- ---------------------------------------------------------------------------
-- Расписание вынесено в блок с перехватом ошибки намеренно. Если pg_cron
-- на тарифе недоступен, важное — обезличивание и сроки хранения — всё равно
-- должно установиться. Задания тогда запускаются вручную или внешним
-- планировщиком, а миграция скажет об этом вслух, а не упадёт целиком.
do $cron$
begin
  create extension if not exists pg_cron;

  perform cron.unschedule('process-deletion-requests')
  from cron.job where jobname = 'process-deletion-requests';

  perform cron.unschedule('purge-expired-candidates')
  from cron.job where jobname = 'purge-expired-candidates';

  perform cron.schedule('process-deletion-requests', '17 3 * * *',
    'select public.process_deletion_requests();');

  perform cron.schedule('purge-expired-candidates', '42 3 * * *',
    'select public.purge_expired_candidates();');

  raise notice 'Расписание установлено: обработка удалений и чистка по сроку хранения — ночью.';
exception when others then
  raise warning 'pg_cron недоступен (%). Функции установлены, но сами не запустятся: вызывайте process_deletion_requests() и purge_expired_candidates() по расписанию извне.', sqlerrm;
end
$cron$;

-- ---------------------------------------------------------------------------
-- 6. УБРАТЬ ДЕМО-ДАННЫЕ
--    Отдельной функцией, а не автоматом: решение о том, что показательные
--    данные больше не нужны, принимает человек. Демо-кандидаты узнаются по
--    почте на example.ru — так их сгенерировал 07_demo_data.sql.
-- ---------------------------------------------------------------------------
create or replace function public.drop_demo_data()
returns text language plpgsql security definer set search_path = public
as $fn$
declare
  v_candidates int;
  v_vacancies int;
begin
  if not public.is_superuser() then
    raise exception 'Убирать демо-данные может только суперпользователь';
  end if;

  select count(*) into v_candidates
  from public.candidates where emails::text like '%@example.ru%';

  delete from public.candidates where emails::text like '%@example.ru%';

  select count(*) into v_vacancies
  from public.vacancies where id::text like '44444444-4444-4444-4444-4444444444%';

  delete from public.vacancies where id::text like '44444444-4444-4444-4444-4444444444%';

  return format('Удалено: кандидатов %s, вакансий %s. Справочники и настройки не тронуты.',
                v_candidates, v_vacancies);
end;
$fn$;

comment on function public.drop_demo_data is
  'Убирает показательные данные. Справочники, настройки компании и ценности остаются.';

commit;

-- ============================================================================
-- КАК ПОЛЬЗОВАТЬСЯ
--
-- Убрать демо-данные перед боевым запуском:
--   select public.drop_demo_data();
--
-- Обработать запросы на удаление прямо сейчас, не дожидаясь ночи:
--   select public.process_deletion_requests();
--
-- Посмотреть расписание:
--   select jobname, schedule, active from cron.job;
--
-- Обезличить одного человека вручную (например, по письменному требованию):
--   select public.anonymize_candidate('<id кандидата>', 'письменное требование');
-- ============================================================================
