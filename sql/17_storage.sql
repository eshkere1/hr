-- ============================================================================
-- 17. ХРАНИЛИЩЕ ФАЙЛОВ
--
-- До этой миграции документы существовали как отметки: «паспорт — принесён»,
-- «диплом — просрочен». Самих файлов нигде не было. Рекрутер видел галочку,
-- но не мог открыть скан, а кандидат, приславший резюме в Телеграм, отправлял
-- его в пустоту: бот честно говорил «пришлите сюда», и на этом всё кончалось.
--
-- Здесь появляется место, где файлы лежат, и правила, кто их видит.
--
-- Ключевое решение: путь к файлу начинается с id кандидата.
--
--     candidate-docs/<id кандидата>/<что это>/<файл>
--
-- Не потому что так красивее, а потому что права на файл должны совпадать
-- с правами на карточку. Первая папка в пути — это и есть кандидат, и
-- политика читает её напрямую. Иначе пришлось бы держать вторую таблицу
-- соответствий и следить, чтобы она не разъезжалась с первой.
-- ============================================================================

-- Резюме — самый частый файл в подборе, а вида под него не было: приходилось
-- класть в «прочее» рядом со справками.
alter type public.document_kind add value if not exists 'resume';

-- ---------------------------------------------------------------------------
-- 1. КОРЗИНА
--
--    Закрытая. Публичная корзина означает, что ссылку на скан паспорта можно
--    переслать кому угодно, и она откроется — для персональных данных это
--    недопустимо. Файлы отдаются только по временной ссылке, которую система
--    выписывает тому, кто уже имеет право видеть карточку.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'candidate-docs',
  'candidate-docs',
  false,
  15728640,                    -- 15 МБ: скан паспорта телефоном ~3 МБ, запас есть
  array[
    'application/pdf',
    'image/jpeg','image/png','image/heic','image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/rtf','application/vnd.oasis.opendocument.text','text/plain',
    -- Голосовые и видео из Телеграма: кандидату часто проще наговорить,
    -- чем набрать, а ответ на задание бывает записью.
    'audio/ogg','audio/mpeg','audio/mp4','video/mp4','video/quicktime'
  ]
)
on conflict (id) do update
set public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 2. ЧТО ЗНАЕТ КАРТОЧКА ДОКУМЕНТА
--
--    file_url остаётся для внешних ссылок — например, на резюме, которое
--    живёт на hh и к нам не копируется. storage_path — для того, что лежит
--    у нас.
-- ---------------------------------------------------------------------------
alter table public.candidate_documents
  add column if not exists storage_path text,
  add column if not exists file_name    text,
  add column if not exists file_size    int,
  add column if not exists mime_type    text,
  add column if not exists uploaded_by  uuid references public.profiles(id) on delete set null,
  add column if not exists uploaded_at  timestamptz;

-- ---------------------------------------------------------------------------
-- 3. КТО ВИДИТ ФАЙЛ
--
--    Ровно те же, кто видит карточку документа: кадровик, руководитель
--    вакансии, на которую человек откликнулся, и сам кандидат. Правило
--    повторено, а не сослано на политику таблицы, потому что storage — это
--    отдельная таблица с отдельными политиками; сослаться там не на что.
--
--    Путь может оказаться не тем, что мы ждём (файл положили руками, папка
--    названа словом). Тогда функция отвечает «нет», а не падает: ошибка
--    в политике превращается в отказ всему бакету.
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

  return public.is_hr()
      or public.is_director()
      or v_id = public.my_candidate_id()
      or exists (
        select 1 from public.applications a
        where a.candidate_id = v_id
          and public.can_see_vacancy(a.vacancy_id)
      );
end
$fn$;

-- Класть и убирать — уже, чем смотреть. Руководитель вакансии читает
-- документы кандидата, но не правит их: за состав папки отвечает кадровик,
-- а за свои файлы — сам человек.
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

  return public.is_hr() or v_id = public.my_candidate_id();
end
$fn$;

-- Урок предыдущей миграции: функция без слова о правах раздаётся всем.
-- Здесь право нужно вошедшему — политики storage проверяются от его имени, —
-- но не анониму.
revoke all on function public.can_see_candidate_files(text)  from public, anon;
revoke all on function public.can_edit_candidate_files(text) from public, anon;
grant execute on function public.can_see_candidate_files(text)  to authenticated;
grant execute on function public.can_edit_candidate_files(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. ПОЛИТИКИ ХРАНИЛИЩА
-- ---------------------------------------------------------------------------
drop policy if exists "файлы кандидатов: смотрит тот, кто видит карточку" on storage.objects;
create policy "файлы кандидатов: смотрит тот, кто видит карточку"
on storage.objects for select to authenticated
using (
  bucket_id = 'candidate-docs'
  and public.can_see_candidate_files((storage.foldername(name))[1])
);

drop policy if exists "файлы кандидатов: кладёт кадровик или сам человек" on storage.objects;
create policy "файлы кандидатов: кладёт кадровик или сам человек"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'candidate-docs'
  and public.can_edit_candidate_files((storage.foldername(name))[1])
);

drop policy if exists "файлы кандидатов: заменяет кадровик или сам человек" on storage.objects;
create policy "файлы кандидатов: заменяет кадровик или сам человек"
on storage.objects for update to authenticated
using (
  bucket_id = 'candidate-docs'
  and public.can_edit_candidate_files((storage.foldername(name))[1])
);

drop policy if exists "файлы кандидатов: убирает кадровик или сам человек" on storage.objects;
create policy "файлы кандидатов: убирает кадровик или сам человек"
on storage.objects for delete to authenticated
using (
  bucket_id = 'candidate-docs'
  and public.can_edit_candidate_files((storage.foldername(name))[1])
);

-- ---------------------------------------------------------------------------
-- 5. ПРАВО НА ЗАБВЕНИЕ РАСПРОСТРАНЯЕТСЯ НА ФАЙЛЫ
--
--    Обезличивание, которое стирает переписку и заметки, но оставляет скан
--    паспорта, — это не обезличивание. Дополняем функцию.
--
--    Честно про границу: удаление строки из storage.objects закрывает доступ
--    к файлу — платформа отдаёт файлы только через эту таблицу. Сами байты
--    в объектном хранилище убирает уже уборщик платформы, и момент этой
--    уборки не в нашей власти. Полное стирание по нашей команде появится
--    вместе с собственным хранилищем.
-- ---------------------------------------------------------------------------
create or replace function public.forget_candidate_files(_candidate_id uuid)
returns int
language plpgsql security definer set search_path = public
as $fn$
declare
  v_count int := 0;
begin
  begin
    delete from storage.objects
    where bucket_id = 'candidate-docs'
      and name like _candidate_id::text || '/%';
    get diagnostics v_count = row_count;
  exception when insufficient_privilege then
    raise warning 'Нет прав на удаление файлов кандидата %. Файлы остались в хранилище.', _candidate_id;
    return -1;
  end;

  return v_count;
end
$fn$;

revoke all on function public.forget_candidate_files(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. ОБЕЗЛИЧИВАНИЕ ТЕПЕРЬ УБИРАЕТ И ФАЙЛЫ
--    Определение целиком, потому что тело функции дописать нельзя. Отличие
--    от версии из миграции 11 — одна строка: perform forget_candidate_files.
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

  -- Документы: сначала файлы в хранилище, потом карточки. Порядок важен:
  -- путь к файлу строится от id кандидата, так что карточки тут не нужны, но если
  -- уборка файлов упадёт, у нас останется хотя бы запись о том, что где лежало.
  perform public.forget_candidate_files(_candidate_id);
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

revoke all on function public.anonymize_candidate(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. СОСТОЯНИЕ ДОКУМЕНТА ЗНАЕТ ПРО ФАЙЛ В ХРАНИЛИЩЕ
--
--    Триггер из миграции 03 считал документ отсутствующим, если пуст
--    file_url. Он писался, когда файлы жили только внешними ссылками.
--    Теперь их два источника, и «нет файла» означает, что пусты оба —
--    иначе загруженный скан немедленно помечался бы как непринесённый.
--
--    Само правило не меняется: состояние считается, а не проставляется
--    руками. Загрузили — «на проверке». Кадровик подтвердил — «в порядке»
--    или «истекает», смотря по дате.
-- ---------------------------------------------------------------------------
create or replace function public.refresh_document_state()
returns trigger language plpgsql set search_path = public
as $fn$
begin
  if new.file_url is null and new.storage_path is null then
    new.state := 'missing';
  elsif new.verified_at is null then
    new.state := 'pending';
  elsif new.expires_on is null then
    new.state := 'valid';
  elsif new.expires_on < current_date then
    new.state := 'expired';
  elsif new.expires_on < current_date + 30 then
    new.state := 'expiring';
  else
    new.state := 'valid';
  end if;
  return new;
end;
$fn$;
