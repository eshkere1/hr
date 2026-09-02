-- ============================================================================
-- РАСТИМ · Миграция 05. ПОЛИТИКИ ДОСТУПА (RLS)
-- ============================================================================
-- Здесь живёт фишка 64 «роли и права доступа: кто какие поля видит».
-- Это не украшение интерфейса: если данные скрыты только на фронте, их видно
-- в сетевом запросе. Ограничение должно стоять в базе.
--
-- ЛОГИКА ПО РОЛЯМ:
--   superuser    — всё, плюс единственный, кто читает журнал аудита
--   director     — читает всё по компании, согласует вакансии и офферы
--   hr_manager   — полный рабочий доступ к найму: воронка, база, переписка
--   dept_head    — ТОЛЬКО свои вакансии и отклики по ним. Видит вилку по своим
--   line_manager — свои вакансии, свои интервью, своя команда. Вилку не видит
--   employee     — своя карточка, свой ИПР, материалы, рефералы, мнение о кандидате
--   candidate    — только свои отклики, свои документы, своя переписка
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. МИГРАЦИЯ ПОВТОРЯЕМАЯ: снимаем прежние политики схемы public.
--    Без этого повторный запуск падает на «policy already exists».
-- ---------------------------------------------------------------------------
do $cleanup$
declare r record;
begin
  for r in
    select pol.polname, cls.relname
    from pg_policy pol
    join pg_class cls on cls.oid = pol.polrelid
    join pg_namespace ns on ns.oid = cls.relnamespace
    where ns.nspname = 'public'
  loop
    execute format('drop policy if exists %I on public.%I', r.polname, r.relname);
  end loop;
end;
$cleanup$;

-- ---------------------------------------------------------------------------
-- 0б. ДВЕ ГЛАВНЫЕ ФУНКЦИИ ВИДИМОСТИ
-- ---------------------------------------------------------------------------
create or replace function public.can_see_vacancy(_vacancy_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $fn$
  select
    public.is_superuser() or public.is_director() or public.is_hr()
    or exists (
      select 1 from public.vacancies v
      where v.id = _vacancy_id
        and (
             v.hiring_manager_id = auth.uid()
          or v.line_manager_id  = auth.uid()
          or v.recruiter_id     = auth.uid()
          or v.department_id in (select public.my_department_ids())
        )
    );
$fn$;

create or replace function public.can_see_application(_application_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $fn$
  select exists (
    select 1 from public.applications a
    where a.id = _application_id
      and (
           public.can_see_vacancy(a.vacancy_id)
        or a.candidate_id = public.my_candidate_id()
        or exists (                              -- приглашён на интервью
             select 1 from public.interviews i
             join public.interview_participants ip on ip.interview_id = i.id
             where i.application_id = a.id and ip.user_id = auth.uid()
           )
      )
  );
$fn$;

-- Право видеть вилку по КОНКРЕТНОЙ вакансии
create or replace function public.can_see_vacancy_money(_vacancy_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $fn$
  select
    public.is_superuser() or public.is_director() or public.is_hr()
    or (
      public.has_role(auth.uid(),'dept_head')
      and exists (
        select 1 from public.vacancies v
        where v.id = _vacancy_id
          and (v.hiring_manager_id = auth.uid()
               or v.department_id in (select public.my_department_ids()))
      )
    );
$fn$;

-- ---------------------------------------------------------------------------
-- 1. ЛЮДИ И РОЛИ
-- ---------------------------------------------------------------------------
create policy "profiles: свой профиль" on public.profiles
  for select using (id = auth.uid());
create policy "profiles: коллеги видят коллег" on public.profiles
  for select using (public.is_staff());
create policy "profiles: правлю только свой" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles: суперпользователь правит любой" on public.profiles
  for all using (public.is_superuser()) with check (public.is_superuser());

-- Роли: читать свои может каждый, менять — ТОЛЬКО суперпользователь.
-- Это единственная защита от повышения прав самому себе.
create policy "user_roles: вижу свои роли" on public.user_roles
  for select using (user_id = auth.uid());
create policy "user_roles: staff видит роли коллег" on public.user_roles
  for select using (public.is_staff());
create policy "user_roles: меняет только суперпользователь" on public.user_roles
  for all using (public.is_superuser()) with check (public.is_superuser());

create policy "departments: читают все свои" on public.departments
  for select using (public.is_staff());
create policy "departments: правит суперпользователь и владелец" on public.departments
  for all using (public.is_superuser() or public.is_director())
  with check (public.is_superuser() or public.is_director());

create policy "audit_log: только суперпользователь" on public.audit_log
  for select using (public.is_superuser());

create policy "company_settings: читают все свои" on public.company_settings
  for select using (public.is_staff());
create policy "company_settings: правит суперпользователь" on public.company_settings
  for all using (public.is_superuser()) with check (public.is_superuser());

create policy "company_values: читают все" on public.company_values
  for select using (true);
create policy "company_values: правят владелец и HR" on public.company_values
  for all using (public.is_director() or public.is_hr())
  with check (public.is_director() or public.is_hr());

-- ---------------------------------------------------------------------------
-- 2. ВОРОНКИ
-- ---------------------------------------------------------------------------
create policy "pipelines: читают свои" on public.pipelines
  for select using (public.is_staff());
create policy "pipelines: правят HR и владелец" on public.pipelines
  for all using (public.is_hr() or public.is_director())
  with check (public.is_hr() or public.is_director());

create policy "stages: читают свои" on public.pipeline_stages
  for select using (public.is_staff());
create policy "stages: правят HR и владелец" on public.pipeline_stages
  for all using (public.is_hr() or public.is_director())
  with check (public.is_hr() or public.is_director());

-- ---------------------------------------------------------------------------
-- 3. ЗАЯВКА И ВАКАНСИЯ
-- ---------------------------------------------------------------------------
create policy "requisitions: свои и по подразделению" on public.requisitions
  for select using (
    public.is_hr() or public.is_director()
    or requested_by = auth.uid()
    or department_id in (select public.my_department_ids())
  );
create policy "requisitions: создаёт руководитель" on public.requisitions
  for insert with check (
    requested_by = auth.uid()
    and (public.has_role(auth.uid(),'dept_head')
         or public.has_role(auth.uid(),'line_manager')
         or public.is_hr() or public.is_director())
  );
create policy "requisitions: правит автор пока черновик" on public.requisitions
  for update using (
    (requested_by = auth.uid() and status in ('draft','rejected'))
    or public.is_hr() or public.is_director()
  );

create policy "vacancies: по праву видимости" on public.vacancies
  for select using (public.can_see_vacancy(id));
create policy "vacancies: создают HR и владелец" on public.vacancies
  for insert with check (public.is_hr() or public.is_director());
create policy "vacancies: правят HR, владелец, свой руководитель" on public.vacancies
  for update using (
    public.is_hr() or public.is_director() or hiring_manager_id = auth.uid()
  );
create policy "vacancies: удаляет суперпользователь" on public.vacancies
  for delete using (public.is_superuser());

-- ДЕНЬГИ. Отдельная таблица — отдельная, более узкая политика.
create policy "вилка: только кто имеет право" on public.vacancy_compensation
  for select using (public.can_see_vacancy_money(vacancy_id));
create policy "вилка: правят HR и владелец" on public.vacancy_compensation
  for all using (public.is_hr() or public.is_director())
  with check (public.is_hr() or public.is_director());

create policy "criteria: по вакансии" on public.vacancy_criteria
  for select using (public.can_see_vacancy(vacancy_id));
create policy "criteria: правят HR и руководитель вакансии" on public.vacancy_criteria
  for all using (
    public.is_hr() or public.is_director()
    or exists (select 1 from public.vacancies v
               where v.id = vacancy_id and v.hiring_manager_id = auth.uid())
  ) with check (
    public.is_hr() or public.is_director()
    or exists (select 1 from public.vacancies v
               where v.id = vacancy_id and v.hiring_manager_id = auth.uid())
  );

create policy "versions: по вакансии" on public.vacancy_versions
  for select using (public.can_see_vacancy(vacancy_id));
create policy "versions: пишет система и HR" on public.vacancy_versions
  for insert with check (public.is_staff());

create policy "approvals: по вакансии" on public.vacancy_approvals
  for select using (public.can_see_vacancy(vacancy_id));
create policy "approvals: решает назначенный согласующий" on public.vacancy_approvals
  for update using (approver_id = auth.uid() or public.is_superuser());
create policy "approvals: создают HR и владелец" on public.vacancy_approvals
  for insert with check (public.is_hr() or public.is_director());

create policy "publications: по вакансии" on public.vacancy_publications
  for select using (public.can_see_vacancy(vacancy_id));
create policy "publications: правит HR" on public.vacancy_publications
  for all using (public.is_hr()) with check (public.is_hr());

-- ---------------------------------------------------------------------------
-- 4. КАНДИДАТЫ
-- ---------------------------------------------------------------------------
-- База кандидатов целиком доступна только HR и владельцу. Руководитель
-- подразделения видит человека, только если тот откликнулся на его вакансию:
-- «руководитель подразделения не видит ни базы, ни аналитики».
create policy "candidates: HR и владелец видят всю базу" on public.candidates
  for select using (public.is_hr() or public.is_director());
create policy "candidates: руководитель видит откликнувшихся к нему" on public.candidates
  for select using (
    exists (
      select 1 from public.applications a
      where a.candidate_id = candidates.id and public.can_see_vacancy(a.vacancy_id)
    )
  );
create policy "candidates: кандидат видит себя" on public.candidates
  for select using (profile_id = auth.uid());
create policy "candidates: кандидат правит себя" on public.candidates
  for update using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and is_blacklisted = false);
create policy "candidates: HR правит базу" on public.candidates
  for all using (public.is_hr()) with check (public.is_hr());

create policy "candidate_profiles: как кандидат" on public.candidate_profiles
  for select using (
    public.is_hr() or public.is_director()
    or candidate_id = public.my_candidate_id()
    or exists (select 1 from public.applications a
               where a.candidate_id = candidate_profiles.candidate_id
                 and public.can_see_vacancy(a.vacancy_id))
  );
create policy "candidate_profiles: правят HR и сам кандидат" on public.candidate_profiles
  for all using (public.is_hr() or candidate_id = public.my_candidate_id())
  with check (public.is_hr() or candidate_id = public.my_candidate_id());

-- Заметки: видимость управляется полем visibility. Кандидат не видит их НИКОГДА.
create policy "notes: по уровню видимости" on public.candidate_notes
  for select using (
    public.is_staff() and (
      author_id = auth.uid()
      or (visibility = 'all_staff')
      or (visibility = 'hr_only' and (public.is_hr() or public.is_director()))
      or (visibility = 'hiring_team' and application_id is not null
          and public.can_see_application(application_id))
    )
  );
create policy "notes: пишет любой свой" on public.candidate_notes
  for insert with check (public.is_staff() and author_id = auth.uid());
create policy "notes: правит автор" on public.candidate_notes
  for update using (author_id = auth.uid());
create policy "notes: удаляет автор или суперпользователь" on public.candidate_notes
  for delete using (author_id = auth.uid() or public.is_superuser());

create policy "tags: staff" on public.candidate_tags
  for select using (public.is_staff());
create policy "tags: правит HR" on public.candidate_tags
  for all using (public.is_hr()) with check (public.is_hr());

create policy "experience: как кандидат" on public.candidate_experience
  for select using (
    public.is_hr() or public.is_director()
    or candidate_id = public.my_candidate_id()
    or exists (select 1 from public.applications a
               where a.candidate_id = candidate_experience.candidate_id
                 and public.can_see_vacancy(a.vacancy_id))
  );
create policy "experience: правят HR и кандидат" on public.candidate_experience
  for all using (public.is_hr() or candidate_id = public.my_candidate_id())
  with check (public.is_hr() or candidate_id = public.my_candidate_id());

create policy "reasons: читают все" on public.rejection_reasons
  for select using (true);
create policy "reasons: правят HR и владелец" on public.rejection_reasons
  for all using (public.is_hr() or public.is_director())
  with check (public.is_hr() or public.is_director());

-- ---------------------------------------------------------------------------
-- 5. ОТКЛИКИ
-- ---------------------------------------------------------------------------
create policy "applications: по праву видимости" on public.applications
  for select using (public.can_see_application(id));
create policy "applications: создают HR, бот и сам кандидат" on public.applications
  for insert with check (
    public.is_hr() or candidate_id = public.my_candidate_id()
  );
create policy "applications: двигают HR и руководитель вакансии" on public.applications
  for update using (
    public.is_hr() or public.is_director()
    or exists (select 1 from public.vacancies v
               where v.id = vacancy_id
                 and (v.hiring_manager_id = auth.uid() or v.recruiter_id = auth.uid()))
  );
create policy "applications: кандидат может отозвать свой" on public.applications
  for update using (candidate_id = public.my_candidate_id())
  with check (candidate_id = public.my_candidate_id() and status in ('withdrawn','active'));

-- Ожидания по зарплате: кандидат видит своё, руководитель — только если
-- имеет право на деньги по этой вакансии.
create policy "деньги отклика: право по вакансии" on public.application_compensation
  for select using (
    exists (select 1 from public.applications a
            where a.id = application_id
              and (public.can_see_vacancy_money(a.vacancy_id)
                   or a.candidate_id = public.my_candidate_id()))
  );
create policy "деньги отклика: правит HR" on public.application_compensation
  for all using (public.is_hr()) with check (public.is_hr());

-- «Показываем основание, а не балл» — результаты по критериям видит вся
-- нанимающая команда, включая руководителя подразделения.
create policy "критерии отклика: команда найма" on public.application_criteria_results
  for select using (public.can_see_application(application_id));
create policy "критерии отклика: подтверждает команда найма" on public.application_criteria_results
  for all using (public.is_staff() and public.can_see_application(application_id))
  with check (public.is_staff() and public.can_see_application(application_id));

create policy "история этапов: команда найма" on public.application_stage_history
  for select using (public.can_see_application(application_id));
create policy "история этапов: пишет система" on public.application_stage_history
  for insert with check (public.is_staff());

create policy "мнение команды: читает команда найма" on public.team_opinions
  for select using (public.can_see_application(application_id));
create policy "мнение команды: пишет каждый своё" on public.team_opinions
  for all using (author_id = auth.uid()) with check (author_id = auth.uid() and public.is_staff());

-- ---------------------------------------------------------------------------
-- 6. ПЕРЕПИСКА
-- ---------------------------------------------------------------------------
create policy "диалоги: команда найма и сам кандидат" on public.conversations
  for select using (
    candidate_id = public.my_candidate_id()
    or public.is_hr() or public.is_director()
    or (application_id is not null and public.can_see_application(application_id))
  );
create policy "диалоги: заводит HR и бот" on public.conversations
  for all using (public.is_hr()) with check (public.is_hr());

create policy "сообщения: по диалогу" on public.messages
  for select using (
    exists (select 1 from public.conversations c
            where c.id = conversation_id
              and (c.candidate_id = public.my_candidate_id()
                   or public.is_hr() or public.is_director()
                   or (c.application_id is not null
                       and public.can_see_application(c.application_id))))
  );
create policy "сообщения: пишет участник диалога" on public.messages
  for insert with check (
    exists (select 1 from public.conversations c
            where c.id = conversation_id
              and (c.candidate_id = public.my_candidate_id() or public.is_staff()))
  );

create policy "касания: HR и владелец" on public.candidate_touches
  for select using (public.is_hr() or public.is_director());
create policy "касания: пишет система" on public.candidate_touches
  for insert with check (public.is_staff());

create policy "SLA: свои и по вакансии" on public.sla_timers
  for select using (
    responsible_id = auth.uid() or public.is_hr() or public.is_director()
    or (vacancy_id is not null and public.can_see_vacancy(vacancy_id))
  );
create policy "SLA: правит HR и ответственный" on public.sla_timers
  for all using (public.is_hr() or responsible_id = auth.uid())
  with check (public.is_hr() or responsible_id = auth.uid());

create policy "уведомления: только свои" on public.notifications
  for select using (user_id = auth.uid());
create policy "уведомления: отмечаю свои прочитанными" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "уведомления: создаёт система" on public.notifications
  for insert with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- 7. КАЛЕНДАРЬ, ИНТЕРВЬЮ, ОЦЕНКА
-- ---------------------------------------------------------------------------
create policy "слоты: свободные видны всем, свои — владельцу" on public.interview_slots
  for select using (
    public.is_staff() or (not is_booked)
    or booked_by_application_id in (
      select id from public.applications where candidate_id = public.my_candidate_id())
  );
create policy "слоты: правит владелец слота и HR" on public.interview_slots
  for all using (owner_id = auth.uid() or public.is_hr())
  with check (owner_id = auth.uid() or public.is_hr());

create policy "интервью: команда найма и сам кандидат" on public.interviews
  for select using (
    public.can_see_application(application_id)
    or exists (select 1 from public.interview_participants ip
               where ip.interview_id = interviews.id and ip.user_id = auth.uid())
  );
create policy "интервью: правит HR и участник" on public.interviews
  for all using (
    public.is_hr()
    or exists (select 1 from public.interview_participants ip
               where ip.interview_id = interviews.id and ip.user_id = auth.uid())
  ) with check (public.is_staff());

create policy "участники интервью: по интервью" on public.interview_participants
  for select using (
    user_id = auth.uid()
    or exists (select 1 from public.interviews i
               where i.id = interview_id and public.can_see_application(i.application_id))
  );
create policy "участники интервью: назначает HR" on public.interview_participants
  for all using (public.is_hr()) with check (public.is_hr());

create policy "оценки интервью: команда найма" on public.interview_scores
  for select using (
    exists (select 1 from public.interviews i
            where i.id = interview_id and public.can_see_application(i.application_id))
  );
create policy "оценки интервью: ставит свой оценщик" on public.interview_scores
  for all using (reviewer_id = auth.uid()) with check (reviewer_id = auth.uid() and public.is_staff());

create policy "вопросы: по вакансии" on public.interview_questions
  for select using (vacancy_id is null or public.can_see_vacancy(vacancy_id));
create policy "вопросы: правят HR и руководитель" on public.interview_questions
  for all using (public.is_hr() or (vacancy_id is not null and public.can_see_vacancy(vacancy_id)))
  with check (public.is_staff());

create policy "шаблоны заданий: читают свои" on public.assessment_templates
  for select using (public.is_staff());
create policy "шаблоны заданий: правят HR и владелец" on public.assessment_templates
  for all using (public.is_hr() or public.is_director())
  with check (public.is_hr() or public.is_director());

create policy "задания: команда найма и сам кандидат" on public.assessments
  for select using (public.can_see_application(application_id));
create policy "задания: выдаёт HR" on public.assessments
  for insert with check (public.is_hr());
create policy "задания: кандидат сдаёт своё" on public.assessments
  for update using (
    public.is_hr()
    or exists (select 1 from public.applications a
               where a.id = application_id and a.candidate_id = public.my_candidate_id())
  );

-- Внутреннее обоснование и обратная связь кандидату лежат в одной строке,
-- поэтому кандидату эту таблицу не открываем: его текст уходит сообщением в ТГ.
create policy "разборы заданий: только команда найма" on public.assessment_reviews
  for select using (
    public.is_staff()
    and exists (select 1 from public.assessments a
                where a.id = assessment_id and public.can_see_application(a.application_id))
  );
create policy "разборы заданий: правит HR и оценщик" on public.assessment_reviews
  for all using (public.is_hr() or reviewer_id = auth.uid())
  with check (public.is_staff());

create policy "практические проверки: команда найма" on public.practical_checks
  for select using (
    exists (select 1 from public.interviews i
            where i.id = interview_id and public.can_see_application(i.application_id))
  );
create policy "практические проверки: правят HR и проверяющий" on public.practical_checks
  for all using (public.is_hr() or reviewer_id = auth.uid())
  with check (public.is_staff());

create policy "оценки проверки: команда найма" on public.practical_check_scores
  for select using (
    exists (select 1 from public.practical_checks d
            join public.interviews i on i.id = d.interview_id
            where d.id = practical_check_id and public.can_see_application(i.application_id))
  );
create policy "оценки проверки: ставит свой оценщик" on public.practical_check_scores
  for all using (reviewer_id = auth.uid()) with check (reviewer_id = auth.uid() and public.is_staff());

-- ---------------------------------------------------------------------------
-- 8. ОФФЕР И ДОГОВОР
-- ---------------------------------------------------------------------------
create policy "шаблоны офферов: staff" on public.offer_templates
  for select using (public.is_staff());
create policy "шаблоны офферов: правят HR и владелец" on public.offer_templates
  for all using (public.is_hr() or public.is_director())
  with check (public.is_hr() or public.is_director());

-- В оффере есть зарплата, поэтому право видеть — как на деньги по вакансии.
create policy "офферы: право на деньги по вакансии" on public.offers
  for select using (
    exists (select 1 from public.applications a
            where a.id = application_id
              and (public.can_see_vacancy_money(a.vacancy_id)
                   or a.candidate_id = public.my_candidate_id()))
  );
create policy "офферы: готовит HR" on public.offers
  for insert with check (public.is_hr());
create policy "офферы: правит HR, согласует владелец" on public.offers
  for update using (public.is_hr() or public.is_director());

create policy "договоры: HR, владелец и сам кандидат" on public.contracts
  for select using (
    public.is_hr() or public.is_director() or candidate_id = public.my_candidate_id()
  );
create policy "договоры: правит HR" on public.contracts
  for all using (public.is_hr()) with check (public.is_hr());

-- ---------------------------------------------------------------------------
-- 9. СОГЛАСИЯ И ДОКУМЕНТЫ
-- ---------------------------------------------------------------------------
create policy "согласия: HR, владелец и сам субъект" on public.consents
  for select using (
    public.is_hr() or public.is_director()
    or candidate_id = public.my_candidate_id() or profile_id = auth.uid()
  );
create policy "согласия: даёт сам субъект, фиксирует HR" on public.consents
  for insert with check (
    public.is_hr() or candidate_id = public.my_candidate_id() or profile_id = auth.uid()
  );
-- Отзыв согласия в один клик: кандидат обновляет revoked_at у своей записи
create policy "согласия: отзывает сам субъект" on public.consents
  for update using (candidate_id = public.my_candidate_id() or profile_id = auth.uid() or public.is_hr());

create policy "документы: HR, руководитель по отклику, сам кандидат" on public.candidate_documents
  for select using (
    public.is_hr() or public.is_director()
    or candidate_id = public.my_candidate_id()
    or exists (select 1 from public.applications a
               where a.candidate_id = candidate_documents.candidate_id
                 and public.can_see_vacancy(a.vacancy_id))
  );
create policy "документы: грузит кандидат, проверяет HR" on public.candidate_documents
  for all using (public.is_hr() or candidate_id = public.my_candidate_id())
  with check (public.is_hr() or candidate_id = public.my_candidate_id());

create policy "удаление данных: HR и сам кандидат" on public.deletion_requests
  for select using (public.is_hr() or public.is_superuser() or candidate_id = public.my_candidate_id());
create policy "удаление данных: просит кандидат" on public.deletion_requests
  for insert with check (candidate_id = public.my_candidate_id() or public.is_hr());
create policy "удаление данных: обрабатывает HR" on public.deletion_requests
  for update using (public.is_hr() or public.is_superuser());

create policy "ai_jobs: только staff" on public.ai_jobs
  for select using (public.is_staff());
create policy "ai_jobs: ставит staff" on public.ai_jobs
  for insert with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- 10. СОТРУДНИКИ, ОНБОРДИНГ, РАЗВИТИЕ
-- ---------------------------------------------------------------------------
create policy "сотрудники: свои, своя команда, HR" on public.employees
  for select using (
    profile_id = auth.uid() or public.is_hr() or public.is_director()
    or line_manager_id = auth.uid() or mentor_id = auth.uid()
    or department_id in (select public.my_department_ids())
  );
create policy "сотрудники: правит HR" on public.employees
  for all using (public.is_hr()) with check (public.is_hr());

create policy "онбординг: свой и своей команды" on public.onboarding_plans
  for select using (
    public.is_hr()
    or exists (select 1 from public.employees e
               where e.id = employee_id
                 and (e.profile_id = auth.uid() or e.mentor_id = auth.uid()
                      or e.line_manager_id = auth.uid()))
  );
create policy "онбординг: правят HR и наставник" on public.onboarding_plans
  for all using (public.is_hr()) with check (public.is_hr());

create policy "задачи онбординга: по плану" on public.onboarding_tasks
  for select using (
    exists (select 1 from public.onboarding_plans p
            join public.employees e on e.id = p.employee_id
            where p.id = plan_id
              and (public.is_hr() or e.profile_id = auth.uid()
                   or e.mentor_id = auth.uid() or e.line_manager_id = auth.uid()))
  );
create policy "задачи онбординга: закрывает исполнитель" on public.onboarding_tasks
  for update using (owner_id = auth.uid() or public.is_hr());

create policy "материалы: читают все свои" on public.learning_materials
  for select using (public.is_staff());
create policy "материалы: правит владелец материала" on public.learning_materials
  for all using (owner_id = auth.uid() or public.is_hr())
  with check (owner_id = auth.uid() or public.is_hr());

create policy "наставничество: своё и HR" on public.mentorships
  for select using (mentor_id = auth.uid() or public.is_hr() or public.is_director());
create policy "наставничество: правит HR" on public.mentorships
  for all using (public.is_hr()) with check (public.is_hr());

create policy "ИПР: свой, своей команды, HR" on public.idp_plans
  for select using (
    public.is_hr()
    or candidate_id = public.my_candidate_id()
    or exists (select 1 from public.employees e
               where e.id = employee_id
                 and (e.profile_id = auth.uid() or e.mentor_id = auth.uid()
                      or e.line_manager_id = auth.uid()))
  );
create policy "ИПР: правят HR и наставник" on public.idp_plans
  for all using (public.is_hr()) with check (public.is_staff());

create policy "пункты ИПР: по плану" on public.idp_items
  for select using (
    exists (select 1 from public.idp_plans p where p.id = plan_id)
  );
create policy "пункты ИПР: правят HR и наставник" on public.idp_items
  for all using (public.is_staff()) with check (public.is_staff());

-- Оценка на испытательном: сотрудник видит СВОЮ — иначе «критерии оценки»
-- остаются тайной, а это ровно та боль новичка, которую мы закрываем.
create policy "испытательный: свой, руководитель, HR" on public.probation_reviews
  for select using (
    public.is_hr() or reviewer_id = auth.uid()
    or exists (select 1 from public.employees e
               where e.id = employee_id
                 and (e.profile_id = auth.uid() or e.line_manager_id = auth.uid()))
  );
create policy "испытательный: ставит оценщик" on public.probation_reviews
  for all using (reviewer_id = auth.uid() or public.is_hr())
  with check (public.is_staff());

create policy "удовлетворённость: HR, владелец, автор" on public.hiring_satisfaction
  for select using (public.is_hr() or public.is_director() or manager_id = auth.uid());
create policy "удовлетворённость: заполняет руководитель" on public.hiring_satisfaction
  for all using (manager_id = auth.uid() or public.is_hr())
  with check (manager_id = auth.uid() or public.is_hr());

create policy "рефералы: свои и HR" on public.referrals
  for select using (
    public.is_hr() or public.is_director()
    or referrer_profile_id = auth.uid()
    or referrer_candidate_id = public.my_candidate_id()
  );
create policy "рефералы: заводит сам рекомендатель" on public.referrals
  for insert with check (
    referrer_profile_id = auth.uid() or referrer_candidate_id = public.my_candidate_id()
    or public.is_hr()
  );
create policy "рефералы: статус ведёт HR" on public.referrals
  for update using (public.is_hr());

create policy "срочные замены: staff и готовые к подмене кандидаты" on public.urgent_needs
  for select using (public.is_staff() or public.my_candidate_id() is not null);
create policy "срочные замены: правит HR" on public.urgent_needs
  for all using (public.is_hr()) with check (public.is_hr());

create policy "сообщество: HR и сам участник" on public.community_members
  for select using (public.is_hr() or candidate_id = public.my_candidate_id());
create policy "сообщество: правит HR" on public.community_members
  for all using (public.is_hr()) with check (public.is_hr());

-- ---------------------------------------------------------------------------
-- 11. ЭКОНОМИКА. Руководитель подразделения аналитику по компании не видит.
-- ---------------------------------------------------------------------------
create policy "затраты: владелец, HR, свой руководитель" on public.hiring_costs
  for select using (
    public.is_director() or public.is_hr()
    or (vacancy_id is not null and public.can_see_vacancy_money(vacancy_id))
  );
create policy "затраты: вносит HR" on public.hiring_costs
  for all using (public.is_hr()) with check (public.is_hr());

create policy "бенчмарк: владелец и HR" on public.salary_benchmarks
  for select using (public.is_director() or public.is_hr());
create policy "бенчмарк: пишет система" on public.salary_benchmarks
  for insert with check (public.is_superuser() or public.is_hr());

-- ============================================================================
-- ПРОВЕРКА ПОСЛЕ ПРИМЕНЕНИЯ: ни одной таблицы без политик
-- ============================================================================
-- select c.relname
-- from pg_class c join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
--   and not exists (select 1 from pg_policy p where p.polrelid = c.oid);
