-- ============================================================================
-- 19. УЧЁТНЫЕ ЗАПИСИ И РОЛИ ИЗ ИНТЕРФЕЙСА
--
-- Раньше выдать роль сотруднику можно было только запросом в базу. Роли и
-- так защищены политикой «меняет только суперпользователь», но двух вещей
-- через обычные таблицы не сделать:
--
--   1. Подтверждена ли почта — это знает только auth.users, наружу она не
--      открыта. А встроенная почта Supabase шлёт несколько писем в час, и
--      «письмо не пришло» — обычная история первого дня.
--   2. Защита от того, чтобы суперпользователь снял роль с самого себя и
--      оставил систему без администратора. Восстанавливать такое можно
--      только руками в базе.
-- ============================================================================

-- Список учётных записей с ролями и состоянием почты. Только суперпользователю.
create or replace function public.admin_list_accounts()
returns table (
  id            uuid,
  email         text,
  full_name     text,
  roles         public.app_role[],
  confirmed     boolean,
  created_at    timestamptz,
  last_sign_in  timestamptz
)
language plpgsql stable security definer set search_path = public
as $fn$
begin
  if not public.is_superuser() then
    raise exception 'Список учётных записей доступен только суперпользователю';
  end if;

  return query
  select
    u.id,
    u.email::text,
    coalesce(nullif(p.full_name, ''), u.email::text),
    coalesce(array_agg(r.role order by r.role) filter (where r.role is not null), '{}'),
    u.email_confirmed_at is not null,
    u.created_at,
    u.last_sign_in_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.user_roles r on r.user_id = u.id
  group by u.id, u.email, p.full_name, u.email_confirmed_at, u.created_at, u.last_sign_in_at
  order by u.created_at desc;
end
$fn$;

-- Подтвердить почту вручную, когда письмо не дошло.
create or replace function public.admin_confirm_account(_user_id uuid)
returns void
language plpgsql security definer set search_path = public
as $fn$
begin
  if not public.is_superuser() then
    raise exception 'Подтверждать учётные записи может только суперпользователь';
  end if;

  update auth.users
  set email_confirmed_at = coalesce(email_confirmed_at, now())
  where id = _user_id;
end
$fn$;

revoke all on function public.admin_list_accounts()        from public, anon;
revoke all on function public.admin_confirm_account(uuid)  from public, anon;
grant execute on function public.admin_list_accounts()       to authenticated;
grant execute on function public.admin_confirm_account(uuid) to authenticated;

-- Последнего суперпользователя снять нельзя.
create or replace function public.keep_last_superuser()
returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  if old.role = 'superuser'
     and not exists (
       select 1 from public.user_roles
       where role = 'superuser' and user_id <> old.user_id
     )
  then
    raise exception 'Это последний суперпользователь. Сначала выдайте эту роль кому-то ещё — иначе управлять системой станет некому.';
  end if;
  return old;
end
$fn$;

drop trigger if exists t_keep_last_superuser on public.user_roles;
create trigger t_keep_last_superuser
  before delete on public.user_roles
  for each row execute function public.keep_last_superuser();
