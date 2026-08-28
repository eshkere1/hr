-- ============================================================================
-- РАСТИМ · Миграция 03. ОБЩЕНИЕ, СРОКИ, ОЦЕНКА
-- Телеграм-переписка, SLA и эскалация, антиспам, календарь и самозапись,
-- тесты и кейсы, интервью с ИИ-саммари, демо-урок, оффер.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ПЕРЕЧИСЛЕНИЯ
-- ---------------------------------------------------------------------------
create type public.channel_kind as enum ('telegram','email','phone','whatsapp','sms','in_app','hh');
create type public.message_direction as enum ('inbound','outbound');
create type public.author_kind  as enum ('candidate','staff','ai_assistant','system');

create type public.interview_kind as enum ('screening_call','interview','tech_interview','demo_lesson','final');
create type public.interview_status as enum ('scheduled','confirmed','done','no_show','cancelled','rescheduled');

create type public.assessment_kind as enum ('test','case','values_test','profiling','video_intro','audio_intro','text_intro');
create type public.assessment_status as enum ('assigned','opened','submitted','reviewed','expired','declined');

create type public.offer_status as enum ('draft','pending_approval','approved','sent','accepted','declined','expired','revoked');

create type public.sla_subject as enum ('manager_feedback','candidate_reply','stage_move','offer_response','document_upload');
create type public.sla_state   as enum ('running','met','breached','escalated','cancelled');

create type public.consent_kind as enum (
  'pd_processing',      -- обработка персональных данных
  'call_recording',     -- запись созвона (фишка 61) — без неё разбор встреч незаконен
  'third_party_share',  -- витрина для партнёрских школ (ДЗ 1, сценарий 7)
  'marketing'           -- сообщество и рассылки
);

create type public.document_kind as enum (
  'criminal_record',    -- справка об отсутствии судимости
  'medical_book',       -- медкнижка
  'diploma',            -- диплом
  'qualification',      -- категория, курсы
  'passport',
  'snils',
  'inn',
  'other'
);
create type public.document_state as enum ('missing','pending','valid','expiring','expired','rejected');

-- ---------------------------------------------------------------------------
-- 1. ПЕРЕПИСКА. Кандидат живёт в Телеграме и на сайт не заходит (фишка 11).
-- ---------------------------------------------------------------------------
create table public.conversations (
  id             uuid primary key default gen_random_uuid(),
  candidate_id   uuid not null references public.candidates(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  channel        public.channel_kind not null default 'telegram',
  external_chat_id text,
  is_ai_autopilot boolean not null default false,  -- ИИ ведёт диалог сам (фишка 12)
  last_message_at timestamptz,
  unread_for_staff int not null default 0,
  created_at     timestamptz not null default now(),
  unique (candidate_id, channel, application_id)
);
create index idx_conversations_app on public.conversations (application_id);
create index idx_conversations_last on public.conversations (last_message_at desc);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  direction       public.message_direction not null,
  author_kind     public.author_kind not null,
  author_id       uuid references public.profiles(id) on delete set null,
  body            text,
  attachments     jsonb not null default '[]'::jsonb,
  external_message_id text,
  ai_intent       text,          -- что ИИ распознал: вопрос о зарплате, отказ, перенос
  is_read         boolean not null default false,
  sent_at         timestamptz not null default now()
);
create index idx_messages_conv on public.messages (conversation_id, sent_at desc);

-- Антиспам: не больше N касаний в неделю по всем каналам сразу (фишка 41).
-- Дожим без лимитов убивает базу — это ваш собственный риск из ИТОГ 2.
create table public.candidate_touches (
  id           uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  channel      public.channel_kind not null,
  kind         text not null,     -- reminder, reactivation, invite, offer, nudge
  application_id uuid references public.applications(id) on delete set null,
  sent_at      timestamptz not null default now()
);
create index idx_touches_candidate on public.candidate_touches (candidate_id, sent_at desc);

create or replace function public.can_touch_candidate(_candidate_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $fn$
  select (
    select count(*) from public.candidate_touches t
    where t.candidate_id = _candidate_id
      and t.sent_at > now() - interval '7 days'
  ) < (select default_touch_limit_per_week from public.company_settings where id);
$fn$;

comment on function public.can_touch_candidate is
  'Антиспам. Проверять ПЕРЕД любой автоматической отправкой кандидату.';

-- ---------------------------------------------------------------------------
-- 2. СРОКИ И ЭСКАЛАЦИЯ (фишка 40).
--    «Руководитель молчит днями — кандидат уходит к тому, кто ответил».
--    Тишина — это ошибка, а не отсутствие событий.
-- ---------------------------------------------------------------------------
create table public.sla_timers (
  id             uuid primary key default gen_random_uuid(),
  subject        public.sla_subject not null,
  application_id uuid references public.applications(id) on delete cascade,
  vacancy_id     uuid references public.vacancies(id) on delete cascade,
  responsible_id uuid references public.profiles(id) on delete set null,
  started_at     timestamptz not null default now(),
  due_at         timestamptz not null,
  satisfied_at   timestamptz,
  reminded_at    timestamptz,
  escalated_at   timestamptz,
  escalated_to   uuid references public.profiles(id) on delete set null,
  state          public.sla_state not null default 'running'
);
create index idx_sla_running on public.sla_timers (due_at) where state = 'running';
create index idx_sla_responsible on public.sla_timers (responsible_id, state);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null,          -- sla_warning, escalation, new_application, approval_request
  title       text not null,
  body        text,
  entity_kind public.entity_kind,
  entity_id   uuid,
  is_read     boolean not null default false,
  delivered_channels public.channel_kind[] not null default '{}',
  created_at  timestamptz not null default now()
);
create index idx_notifications_user on public.notifications (user_id, is_read, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. КАЛЕНДАРЬ И САМОЗАПИСЬ (фишка 34).
--    Поиск слотов в переписке — крупнейший пожиратель времени HR.
-- ---------------------------------------------------------------------------
create table public.interview_slots (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  vacancy_id    uuid references public.vacancies(id) on delete cascade,
  kind          public.interview_kind not null default 'interview',
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  work_format   public.work_format not null default 'online',
  location      text,
  is_booked     boolean not null default false,
  booked_by_application_id uuid references public.applications(id) on delete set null,
  created_at    timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index idx_slots_free on public.interview_slots (starts_at) where not is_booked;

create table public.interviews (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  slot_id        uuid references public.interview_slots(id) on delete set null,
  kind           public.interview_kind not null default 'interview',
  status         public.interview_status not null default 'scheduled',
  scheduled_at   timestamptz not null,
  duration_min   int not null default 45,
  work_format    public.work_format not null default 'online',
  location       text,
  meeting_url    text,

  -- Запись и разбор встречи (фишка 5) — СИЛЬНОЕ ОТЛИЧИЕ.
  -- Разбираем и онлайн-звонок, и живую офлайн-встречу.
  recording_consent_id uuid,          -- FK на consents ниже
  recording_url  text,
  transcript     text,
  ai_summary     text,                -- саммари: о чём говорили
  ai_conclusions text,                -- выводы по критериям вакансии
  ai_generated_at timestamptz,

  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_interviews_app on public.interviews (application_id, scheduled_at desc);
create index idx_interviews_upcoming on public.interviews (scheduled_at) where status in ('scheduled','confirmed');

create table public.interview_participants (
  interview_id uuid not null references public.interviews(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  role         text not null default 'interviewer',   -- interviewer, observer, methodist
  primary key (interview_id, user_id)
);

-- Оценочная форма под конкретную роль по критериям вакансии (фишка 28).
-- «Не знает, какие вопросы задавать» — боль руководителя подразделения.
create table public.interview_scores (
  id           uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.interviews(id) on delete cascade,
  criterion_id uuid references public.vacancy_criteria(id) on delete set null,
  value_id     uuid references public.company_values(id) on delete set null,
  reviewer_id  uuid not null references public.profiles(id) on delete cascade,
  result       public.criterion_result not null default 'unknown',
  comment      text,
  created_at   timestamptz not null default now()
);

create table public.interview_questions (
  id           uuid primary key default gen_random_uuid(),
  vacancy_id   uuid references public.vacancies(id) on delete cascade,
  criterion_id uuid references public.vacancy_criteria(id) on delete cascade,
  question     text not null,
  good_answer  text,
  is_ai_generated boolean not null default true,
  order_index  int not null default 0
);

-- ---------------------------------------------------------------------------
-- 4. ТЕСТЫ, КЕЙСЫ, ДЕМО-УРОК
--    Тест на 10 минут с пользой самому кандидату (фишка 37).
--    Альтернатива видеовизитке: аудио или текст (фишка 36).
-- ---------------------------------------------------------------------------
create table public.assessment_templates (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,
  kind          public.assessment_kind not null,
  name          text not null,
  description   text,
  duration_min  int not null default 10,
  questions     jsonb not null default '[]'::jsonb,
  -- Кейсы на работу с детьми и родителями (фишка 53):
  -- конфликт с родителем, срыв урока, отставание ребёнка
  value_ids     uuid[] not null default '{}',   -- какие ценности проверяет
  criterion_hint text,
  is_active     boolean not null default true,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create table public.assessments (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  template_id    uuid not null references public.assessment_templates(id) on delete restrict,
  status         public.assessment_status not null default 'assigned',
  assigned_at    timestamptz not null default now(),
  assigned_by    uuid references public.profiles(id) on delete set null,
  is_auto_assigned boolean not null default false,   -- автовыдача при переходе (фишка 10)
  due_at         timestamptz,
  opened_at      timestamptz,
  submitted_at   timestamptz,
  answers        jsonb not null default '[]'::jsonb,
  media_url      text,                              -- аудио или видео ответ
  created_at     timestamptz not null default now()
);
create index idx_assessments_app on public.assessments (application_id, status);

-- ИИ пишет подробную обратную связь исходя из НАШИХ ценностей (фишка 24).
-- Самое сильное отличие: кандидат получает внятный ответ, HR — обоснование.
create table public.assessment_reviews (
  id             uuid primary key default gen_random_uuid(),
  assessment_id  uuid not null references public.assessments(id) on delete cascade,
  reviewer_id    uuid references public.profiles(id) on delete set null,
  is_ai          boolean not null default true,
  verdict        text check (verdict in ('strong','ok','weak','fail')),
  feedback_internal text,     -- обоснование для HR и руководителя
  feedback_for_candidate text, -- полезная обратная связь самому кандидату
  value_scores   jsonb not null default '{}'::jsonb,  -- {value_code: met|partial|not_met}
  approved_by    uuid references public.profiles(id) on delete set null,
  approved_at    timestamptz,
  created_at     timestamptz not null default now()
);

-- Демо-урок как этап отбора (фишка 51). Нет ни у одного конкурента.
create table public.demo_lessons (
  id             uuid primary key default gen_random_uuid(),
  interview_id   uuid unique not null references public.interviews(id) on delete cascade,
  topic          text,
  grade          text,
  audience       text,          -- реальные дети, коллеги, запись
  recording_url  text,
  methodist_id   uuid references public.profiles(id) on delete set null,
  methodist_verdict text,
  methodist_comment text,
  created_at     timestamptz not null default now()
);

create table public.demo_lesson_scores (
  id            uuid primary key default gen_random_uuid(),
  demo_lesson_id uuid not null references public.demo_lessons(id) on delete cascade,
  reviewer_id   uuid not null references public.profiles(id) on delete cascade,
  aspect        text not null,   -- контакт с классом, структура, объяснение, дисциплина
  result        public.criterion_result not null default 'unknown',
  comment       text,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 5. ОФФЕР И ДОГОВОР (фишка 39 + «подписание договора»)
-- ---------------------------------------------------------------------------
create table public.offer_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  body_md    text not null,      -- шаблон с подстановками {{candidate_name}} и т.д.
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.offers (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  template_id    uuid references public.offer_templates(id) on delete set null,
  status         public.offer_status not null default 'draft',
  salary         numeric(12,2),
  is_net         boolean not null default true,
  weekly_hours   numeric(5,1),
  start_date     date,
  probation_months int not null default 3,
  body_md        text,
  created_by     uuid references public.profiles(id) on delete set null,
  approved_by    uuid references public.profiles(id) on delete set null,
  approved_at    timestamptz,
  sent_at        timestamptz,
  respond_by     date,
  responded_at   timestamptz,
  decline_reason text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_offers_app on public.offers (application_id, status);

create table public.contracts (
  id           uuid primary key default gen_random_uuid(),
  offer_id     uuid unique references public.offers(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  number       text,
  signed_at    timestamptz,
  file_url     text,
  signing_provider text,      -- внешний сервис подписания
  external_id  text,
  status       text not null default 'draft',
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 6. СОГЛАСИЯ И ДОКУМЕНТЫ
--    Ниша: без справок педагога просто не допустят к детям (фишка 50).
-- ---------------------------------------------------------------------------
create table public.consents (
  id            uuid primary key default gen_random_uuid(),
  candidate_id  uuid references public.candidates(id) on delete cascade,
  profile_id    uuid references public.profiles(id) on delete cascade,
  kind          public.consent_kind not null,
  granted_at    timestamptz,
  revoked_at    timestamptz,
  text_version  text not null default 'v1',
  evidence      jsonb not null default '{}'::jsonb,  -- откуда: ТГ-кнопка, подпись, ip
  expires_at    timestamptz,
  created_at    timestamptz not null default now(),
  check (candidate_id is not null or profile_id is not null)
);
create index idx_consents_candidate on public.consents (candidate_id, kind);

alter table public.interviews
  add constraint interviews_consent_fk
  foreign key (recording_consent_id) references public.consents(id) on delete set null;

create table public.candidate_documents (
  id           uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  kind         public.document_kind not null,
  state        public.document_state not null default 'missing',
  number       text,
  issued_on    date,
  expires_on   date,
  file_url     text,
  verified_by  uuid references public.profiles(id) on delete set null,
  verified_at  timestamptz,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (candidate_id, kind)
);
create index idx_docs_expiring on public.candidate_documents (expires_on) where state in ('valid','expiring');

-- Статус документа считается из даты, а не проставляется руками
create or replace function public.refresh_document_state()
returns trigger language plpgsql set search_path = public
as $fn$
begin
  if new.file_url is null then
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

create trigger t_document_state
  before insert or update on public.candidate_documents
  for each row execute function public.refresh_document_state();

-- Право на забвение (фишка 62)
create table public.deletion_requests (
  id           uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  requested_at timestamptz not null default now(),
  source       public.channel_kind not null default 'telegram',
  processed_at timestamptz,
  processed_by uuid references public.profiles(id) on delete set null,
  note         text
);

-- ---------------------------------------------------------------------------
-- 7. ОЧЕРЕДЬ ЗАДАНИЙ ДЛЯ ИИ
--    Нулевой ручной ввод: система заполняется сама, HR только подтверждает.
-- ---------------------------------------------------------------------------
create table public.ai_jobs (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,   -- parse_resume, score_criteria, summarize_interview,
                               -- review_assessment, draft_reply, suggest_from_archive,
                               -- semantic_search, draft_vacancy
  entity_kind public.entity_kind,
  entity_id   uuid,
  payload     jsonb not null default '{}'::jsonb,
  result      jsonb,
  status      text not null default 'queued' check (status in ('queued','running','done','failed')),
  error       text,
  tokens_used int,
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index idx_ai_jobs_queue on public.ai_jobs (status, created_at) where status in ('queued','running');

-- ---------------------------------------------------------------------------
-- 8. ТРИГГЕРЫ
-- ---------------------------------------------------------------------------
create or replace function public.on_message_inserted()
returns trigger language plpgsql security definer set search_path = public
as $fn$
begin
  update public.conversations
  set last_message_at = new.sent_at,
      unread_for_staff = case
        when new.direction = 'inbound' then unread_for_staff + 1
        else 0 end
  where id = new.conversation_id;

  if new.direction = 'outbound' then
    insert into public.candidate_touches (candidate_id, channel, kind, application_id)
    select c.candidate_id, c.channel, coalesce(new.ai_intent,'message'), c.application_id
    from public.conversations c where c.id = new.conversation_id;
  end if;

  update public.candidates c
  set last_activity_at = new.sent_at
  from public.conversations conv
  where conv.id = new.conversation_id and c.id = conv.candidate_id;

  return new;
end;
$fn$;

create trigger t_on_message after insert on public.messages
  for each row execute function public.on_message_inserted();

create trigger t_interviews_touch before update on public.interviews for each row execute function public.touch_updated_at();
create trigger t_offers_touch     before update on public.offers     for each row execute function public.touch_updated_at();
create trigger t_docs_touch       before update on public.candidate_documents for each row execute function public.touch_updated_at();

create trigger t_audit_offers   after insert or update or delete on public.offers   for each row execute function public.audit_trigger();
create trigger t_audit_consents after insert or update or delete on public.consents for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------------
-- 9. RLS
-- ---------------------------------------------------------------------------
alter table public.conversations         enable row level security;
alter table public.messages              enable row level security;
alter table public.candidate_touches     enable row level security;
alter table public.sla_timers            enable row level security;
alter table public.notifications         enable row level security;
alter table public.interview_slots       enable row level security;
alter table public.interviews            enable row level security;
alter table public.interview_participants enable row level security;
alter table public.interview_scores      enable row level security;
alter table public.interview_questions   enable row level security;
alter table public.assessment_templates  enable row level security;
alter table public.assessments           enable row level security;
alter table public.assessment_reviews    enable row level security;
alter table public.demo_lessons          enable row level security;
alter table public.demo_lesson_scores    enable row level security;
alter table public.offer_templates       enable row level security;
alter table public.offers                enable row level security;
alter table public.contracts             enable row level security;
alter table public.consents              enable row level security;
alter table public.candidate_documents   enable row level security;
alter table public.deletion_requests     enable row level security;
alter table public.ai_jobs               enable row level security;
