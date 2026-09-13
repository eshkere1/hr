-- ============================================================================
-- 15. РЕКОМЕНДАЦИЯ ЗНАКОМОГО (фишка 60)
--
-- Экран «Мой профиль» предлагал сотруднику порекомендовать знакомого, но в
-- настоящей базе кнопка упиралась в RLS и приложение честно бросало ошибку:
-- «сначала кандидат, потом реферал на него». Завести кандидата обычный
-- сотрудник не может — и правильно, что не может: иначе базу кандидатов
-- пополнял бы кто угодно чем угодно.
--
-- Поэтому рекомендация — одна функция, которая делает три вещи разом и от
-- имени владельца: заводит (или находит) кандидата, вешает на него реферала
-- и сохраняет объяснение рекомендателя заметкой. Права проверяются внутри:
-- рекомендателем становится только тот, кто вошёл.
--
-- Контакт нужен обязательно. Рекомендация без способа связаться — это не
-- рекомендация, а имя, и HR потом ищет человека вручную.
-- ============================================================================

-- Бонус задаётся компанией, а не зашит в код.
alter table public.company_settings
  add column if not exists referral_bonus numeric(12,2) not null default 15000;

create or replace function public.submit_referral(
  _name          text,
  _contact       text,
  _why           text default null,
  _vacancy_title text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  _uid          uuid := auth.uid();
  _candidate_id uuid;
  _vacancy_id   uuid;
  _referral_id  uuid;
  _is_email     boolean := position('@' in coalesce(_contact, '')) > 0;
  _bonus        numeric(12,2);
begin
  if _uid is null then
    raise exception 'Рекомендацию может оставить только вошедший пользователь';
  end if;

  if coalesce(trim(_name), '') = '' or coalesce(trim(_contact), '') = '' then
    raise exception 'Нужны имя и контакт: без контакта с человеком не связаться';
  end if;

  select referral_bonus into _bonus from public.company_settings limit 1;

  -- Тот же человек мог уже приходить сам или его уже рекомендовали. Ищем
  -- по контакту: имена повторяются, телефоны и почта — почти нет.
  select c.id into _candidate_id
  from public.candidates c
  where (_is_email and trim(lower(_contact)) = any (
           select lower(e) from unnest(c.emails) e))
     or (not _is_email and regexp_replace(_contact, '\D', '', 'g') = any (
           select regexp_replace(p, '\D', '', 'g') from unnest(c.phones) p))
  limit 1;

  if _candidate_id is null then
    insert into public.candidates (full_name, phones, emails, primary_source)
    values (
      trim(_name),
      case when _is_email then '{}'::text[] else array[trim(_contact)] end,
      case when _is_email then array[trim(lower(_contact))] else '{}'::text[] end,
      'referral'
    )
    returning id into _candidate_id;
  end if;

  if coalesce(trim(_vacancy_title), '') <> '' then
    select v.id into _vacancy_id
    from public.vacancies v
    where v.title = trim(_vacancy_title)
      and v.status in ('approved', 'published')
    order by v.created_at desc
    limit 1;
  end if;

  insert into public.referrals (
    referrer_profile_id, referred_candidate_id, vacancy_id, status, bonus_amount
  )
  values (_uid, _candidate_id, _vacancy_id, 'submitted', coalesce(_bonus, 0))
  returning id into _referral_id;

  -- Почему рекомендуют — самое ценное в рекомендации, и теряться оно не должно.
  if coalesce(trim(_why), '') <> '' then
    insert into public.candidate_notes (candidate_id, author_id, body, visibility)
    values (
      _candidate_id,
      _uid,
      'Рекомендация: ' || trim(_why),
      'hiring_team'
    );
  end if;

  return _referral_id;
end;
$fn$;

-- Звать может вошедший пользователь. Анонимному тут делать нечего: функция
-- пишет в базу кандидатов, а публикуемый ключ лежит в браузере у всех.
revoke all on function public.submit_referral(text, text, text, text) from public, anon;
grant execute on function public.submit_referral(text, text, text, text) to authenticated;
