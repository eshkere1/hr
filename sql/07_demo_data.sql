-- ============================================================================
-- РАСТИМ · платформа найма
-- Миграция 07. ДЕМОНСТРАЦИОННЫЕ ДАННЫЕ (необязательная).
--
-- Пять вакансий, 160 человек в базе, отклики по всем этапам, архив за два
-- года, документы, переписка. Нужна ровно для одного: увидеть систему на
-- объёме, а не на трёх карточках. На пустой воронке нельзя понять, где она
-- рвётся, а именно ради этого всё и делалось.
--
-- Данные детерминированные: генерация идёт от номера строки, а не от
-- random(), поэтому повторный запуск даёт тот же набор. Демонстрацию можно
-- показать дважды и получить одинаковую картинку.
--
-- Удалить всё, что заведено этим файлом, — в самом низу.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. КТО ВЕДЁТ НАБОР
--    Все вакансии вешаем на первого суперпользователя: иначе «Мой день»
--    и «Ждут меня» будут пустыми — им нужен ответственный.
-- ---------------------------------------------------------------------------
create temporary table _me on commit drop as
select id from public.profiles order by created_at limit 1;

-- ---------------------------------------------------------------------------
-- 1. ВАКАНСИИ
-- ---------------------------------------------------------------------------
insert into public.vacancies (
  id, pipeline_id, title, department_id, hiring_manager_id, recruiter_id, created_by,
  status, priority, headcount, specialization, grade, employment_type, work_format,
  weekly_hours, city, required_documents, description, first_month_reality,
  requirements, conditions, target_close_date, opened_at
)
select v.id, v.pipeline_id, v.title, v.department_id, m.id, m.id, m.id,
       v.status, v.priority, v.headcount, v.specialization, v.grade,
       v.employment_type, v.work_format, v.weekly_hours, v.city,
       v.required_documents, v.description, v.first_month_reality,
       v.requirements, v.conditions, v.target_close_date, v.opened_at
from _me m, (values
  ('44444444-4444-4444-4444-444444444401'::uuid,
   '11111111-1111-1111-1111-111111111111'::uuid,
   'Backend-разработчик',
   '33333333-3333-3333-3333-333333333301'::uuid,
   'published'::public.vacancy_status, 'high'::public.vacancy_priority, 2,
   'Разработка', 'middle'::public.grade_level,
   'full_time'::public.employment_type, 'hybrid'::public.work_format,
   40.0, 'Москва',
   '{passport,snils,inn}'::public.document_kind[],
   'Развиваем внутренний продукт: API, интеграции, отчётность.',
   'Первый месяц — чтение чужого кода и мелкие задачи. Своя фича появится к пятой неделе, не раньше.',
   'Python от 3 лет, PostgreSQL, опыт с очередями. Плюсом — Docker.',
   'Два дня в офисе, три дома. Обучение за счёт компании.',
   current_date + 45, now() - interval '38 days'),

  ('44444444-4444-4444-4444-444444444402'::uuid,
   '11111111-1111-1111-1111-111111111111'::uuid,
   'Менеджер по продажам',
   '33333333-3333-3333-3333-333333333302'::uuid,
   'published', 'critical', 3,
   'Продажи', 'middle',
   'full_time', 'onsite',
   40.0, 'Москва',
   '{passport,snils,inn,work_book}'::public.document_kind[],
   'B2B-продажи в новый сегмент. Тёплая база есть, но холодные звонки тоже будут.',
   'Первый месяц — чужая база и наставник. План ставим со второго месяца, не раньше.',
   'Опыт B2B от 2 лет, CRM, готовность к звонкам.',
   'Оклад плюс процент без потолка. Испытательный — три месяца.',
   current_date + 21, now() - interval '52 days'),

  ('44444444-4444-4444-4444-444444444403'::uuid,
   '11111111-1111-1111-1111-111111111111'::uuid,
   'Аналитик данных',
   '33333333-3333-3333-3333-333333333304'::uuid,
   'published', 'normal', 1,
   'Аналитика', 'senior',
   'full_time', 'remote',
   40.0, 'Санкт-Петербург',
   '{passport,snils,inn,diploma}'::public.document_kind[],
   'Продуктовая аналитика: дашборды, гипотезы, A/B.',
   'Первый месяц уйдёт на то, чтобы разобраться в данных. Они грязные, это честно.',
   'SQL на уровне оконных функций, Python, опыт A/B-тестов.',
   'Полная удалёнка. Оборудование выдаём.',
   current_date + 60, now() - interval '25 days'),

  ('44444444-4444-4444-4444-444444444404'::uuid,
   '22222222-2222-2222-2222-222222222222'::uuid,
   'Специалист поддержки',
   '33333333-3333-3333-3333-333333333303'::uuid,
   'published', 'high', 4,
   'Поддержка', 'junior',
   'full_time', 'remote',
   40.0, 'Москва',
   '{passport,snils,inn}'::public.document_kind[],
   'Первая линия: чат, почта, тикеты.',
   'Первый месяц — скрипты и наставник рядом. Самостоятельные смены с третьей недели.',
   'Грамотная речь, готовность к сменному графику. Опыт не обязателен.',
   'Сменный график 2/2. Обучение две недели оплачивается.',
   current_date + 14, now() - interval '19 days'),

  ('44444444-4444-4444-4444-444444444405'::uuid,
   '11111111-1111-1111-1111-111111111111'::uuid,
   'Бухгалтер на участок',
   '33333333-3333-3333-3333-333333333305'::uuid,
   'published', 'normal', 1,
   'Бухгалтерия и финансы', 'middle',
   'full_time', 'onsite',
   40.0, 'Москва',
   '{passport,snils,inn,work_book,diploma}'::public.document_kind[],
   'Участок реализации и первичка.',
   'Первый месяц — приём дел от предшественника. Отчётность закрываете со второго квартала.',
   '1С 8.3, НДС, опыт от 3 лет.',
   'Пятидневка, офис у метро. ДМС после испытательного.',
   current_date + 30, now() - interval '12 days')
) as v(id, pipeline_id, title, department_id, status, priority, headcount,
       specialization, grade, employment_type, work_format, weekly_hours, city,
       required_documents, description, first_month_reality, requirements,
       conditions, target_close_date, opened_at)
on conflict (id) do nothing;

-- Вилки и рынок. Отдельной таблицей — деньги видит не каждый.
insert into public.vacancy_compensation
  (vacancy_id, salary_min, salary_max, is_net, budget_approved, market_p25, market_p50, market_p75, market_updated_at)
values
  ('44444444-4444-4444-4444-444444444401', 220000, 280000, true, true, 210000, 265000, 320000, now() - interval '9 days'),
  ('44444444-4444-4444-4444-444444444402', 90000, 150000, true, true, 85000, 120000, 170000, now() - interval '9 days'),
  ('44444444-4444-4444-4444-444444444403', 250000, 300000, true, false, 230000, 285000, 340000, now() - interval '9 days'),
  ('44444444-4444-4444-4444-444444444404', 65000, 80000, true, true, 60000, 72000, 88000, now() - interval '9 days'),
  ('44444444-4444-4444-4444-444444444405', 110000, 140000, true, true, 100000, 128000, 155000, now() - interval '9 days')
on conflict (vacancy_id) do nothing;

-- Критерии. Основание вместо балла: у каждого сказано, чем проверяем.
insert into public.vacancy_criteria (vacancy_id, name, description, weight, is_required, how_verified, order_index)
values
  ('44444444-4444-4444-4444-444444444401','Python в продакшене от 3 лет','Не пет-проекты, а поддержка живой системы',5,true,'resume',1),
  ('44444444-4444-4444-4444-444444444401','PostgreSQL глубже CRUD','Индексы, планы запросов, транзакции',4,true,'test',2),
  ('44444444-4444-4444-4444-444444444401','Асинхронные задачи','Очереди, воркеры, идемпотентность',3,false,'interview',3),
  ('44444444-4444-4444-4444-444444444401','Разбор чужого кода','Умение зайти в незнакомый проект',4,true,'practical_check',4),
  ('44444444-4444-4444-4444-444444444401','Работа с неопределённостью','Что делает, когда задача поставлена плохо',3,false,'case',5),

  ('44444444-4444-4444-4444-444444444402','B2B-опыт от 2 лет','Длинный цикл сделки, а не розница',5,true,'resume',1),
  ('44444444-4444-4444-4444-444444444402','Холодные звонки','Готовность звонить, а не только вести базу',4,true,'screening',2),
  ('44444444-4444-4444-4444-444444444402','CRM как привычка','Ведёт сделки в системе без напоминаний',3,true,'interview',3),
  ('44444444-4444-4444-4444-444444444402','Поведение при отказе','Реакция на «нет» от клиента',4,false,'case',4),
  ('44444444-4444-4444-4444-444444444402','Счёт своих денег','Понимает, из чего складывается его доход',3,false,'interview',5),

  ('44444444-4444-4444-4444-444444444403','SQL на уровне оконных функций','Не только join, но и window',5,true,'test',1),
  ('44444444-4444-4444-4444-444444444403','Python для анализа','pandas, а не только Excel',4,true,'resume',2),
  ('44444444-4444-4444-4444-444444444403','A/B-тесты','Считал значимость руками хотя бы раз',4,true,'interview',3),
  ('44444444-4444-4444-4444-444444444403','Спор с заказчиком','Что делает, когда просят подогнать цифры',5,true,'case',4),
  ('44444444-4444-4444-4444-444444444403','Дашборд как продукт','Думает о том, кто это будет читать',3,false,'practical_check',5),

  ('44444444-4444-4444-4444-444444444404','Грамотная письменная речь','Проверяем на тестовом ответе клиенту',5,true,'test',1),
  ('44444444-4444-4444-4444-444444444404','Сменный график','Реально готов к 2/2',4,true,'screening',2),
  ('44444444-4444-4444-4444-444444444404','Спокойствие под давлением','Реакция на грубость',5,true,'case',3),
  ('44444444-4444-4444-4444-444444444404','Обучаемость','Скорость освоения инструкции',3,false,'interview',4),

  ('44444444-4444-4444-4444-444444444405','1С 8.3 уверенно','Не только проведение документов',5,true,'resume',1),
  ('44444444-4444-4444-4444-444444444405','НДС без напоминаний','Знает сроки и последствия',5,true,'test',2),
  ('44444444-4444-4444-4444-444444444405','Первичка в порядке','Аккуратность в мелочах',4,true,'practical_check',3),
  ('44444444-4444-4444-4444-444444444405','Поведение при ошибке','Сообщает сам или прячет',5,true,'case',4),
  ('44444444-4444-4444-4444-444444444405','Общение с налоговой','Опыт переписки и требований',3,false,'interview',5)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. ЛЮДИ
--    160 человек. Имена, города и навыки собираются по номеру строки —
--    без random(), чтобы набор был воспроизводимым.
-- ---------------------------------------------------------------------------
create temporary table _pool on commit drop as
select
  array['Смирнов','Кузнецов','Попов','Соколов','Лебедев','Козлов','Новиков','Морозов',
        'Волков','Соловьёв','Васильев','Зайцев','Павлов','Семёнов','Голубев','Виноградов',
        'Богданов','Воробьёв','Фёдоров','Никитин']::text[] as surn,
  array['smirnov','kuznetsov','popov','sokolov','lebedev','kozlov','novikov','morozov',
        'volkov','soloviev','vasiliev','zaitsev','pavlov','semenov','golubev','vinogradov',
        'bogdanov','vorobiev','fedorov','nikitin']::text[] as surn_lat,
  array['Александр','Дмитрий','Максим','Сергей','Андрей','Алексей','Артём','Илья',
        'Кирилл','Михаил','Никита','Матвей','Роман','Егор','Арсений','Иван']::text[] as name_m,
  array['Анна','Мария','Елена','Дарья','Алина','Ирина','Екатерина','Ольга',
        'Наталья','Полина','Ксения','Юлия','Татьяна','Виктория','София','Марина']::text[] as name_f,
  array['Москва','Санкт-Петербург','Казань','Новосибирск','Екатеринбург',
        'Нижний Новгород','Краснодар','Самара','Воронеж','Ростов-на-Дону']::text[] as city;

create temporary table _people on commit drop as
with base as (
  select
    i,
    (i % 3 = 0) as is_f,
    p.surn[1 + (i * 7) % 20]      as surn,
    p.surn_lat[1 + (i * 7) % 20]  as surn_lat,
    p.name_m[1 + (i * 5) % 16]    as nm,
    p.name_f[1 + (i * 5) % 16]    as nf,
    p.city[1 + (i * 3) % 10]      as city,
    ((i - 1) % 5) as spec_ix
  from generate_series(1, 160) i, _pool p
)
select
  gen_random_uuid() as id,
  i,
  case when is_f then surn || 'а ' || nf else surn || ' ' || nm end as full_name,
  surn_lat || '.' || i::text || '@example.ru' as email,
  '+7 9' || lpad(((i * 137) % 100)::text, 2, '0') || ' '
          || lpad(((i * 311) % 1000)::text, 3, '0') || '-'
          || lpad(((i * 71) % 100)::text, 2, '0') || '-'
          || lpad(((i * 43) % 100)::text, 2, '0') as phone,
  city,
  (array['Разработка','Продажи','Аналитика','Поддержка','Бухгалтерия и финансы'])[spec_ix + 1] as specialization,
  (array['44444444-4444-4444-4444-444444444401',
         '44444444-4444-4444-4444-444444444402',
         '44444444-4444-4444-4444-444444444403',
         '44444444-4444-4444-4444-444444444404',
         '44444444-4444-4444-4444-444444444405'])[spec_ix + 1]::uuid as vacancy_id,
  (array['intern','junior','middle','middle','senior','lead'])[1 + (i % 6)]::public.grade_level as grade,
  (array['hh','avito','superjob','telegram','referral','website','direct'])[1 + (i % 7)]::public.candidate_source as src,
  1 + (i % 12) as years,
  (60000 + (i % 24) * 9000)::numeric as expected,
  case
    when i <= 34  then 'new'
    when i <= 56  then 'screening'
    when i <= 70  then 'interview'
    when i <= 82  then 'assessment'
    when i <= 90  then 'practical'
    when i <= 94  then 'offer'
    when i <= 95  then 'hired'
    when i <= 135 then 'archive'
    else 'base'
  end as bucket,
  -- Считаем в ЧАСАХ, а не в днях: у первого этапа SLA — сутки, и «вчера»
  -- было бы уже просрочкой. Большинство сидит на этапе несколько часов,
  -- каждый девятый застрял на неделю. Из этого и получается «Срок вышел»
  -- на стартовом экране: не выдуманный список, а посчитанный.
  (case when i % 9 = 0 then 100 + (i % 5) * 24 else i % 18 end)::int as stage_hours_ago,
  30 + (i * 5) % 700 as first_seen_days_ago
from base;

insert into public.candidates
  (id, full_name, phones, emails, city, primary_source, first_seen_at, last_activity_at,
   consent_pd_granted, resume_text, current_employer)
select
  p.id, p.full_name, array[p.phone], array[p.email], p.city, p.src,
  now() - make_interval(days => p.first_seen_days_ago),
  now() - make_interval(hours => p.stage_hours_ago),
  true,
  p.full_name || '. ' || p.specialization || ', ' || p.years::text
    || ' лет опыта. Город: ' || p.city || '.',
  case when p.i % 4 = 0 then null else 'ООО «' || p.specialization || ' Плюс»' end
from _people p;

insert into public.candidate_profiles
  (candidate_id, specialization, skills, grades, years_in_specialty, total_experience_years,
   expected_salary, ready_for_urgent_start, work_formats, schedule_note)
select
  p.id, p.specialization,
  case p.specialization
    when 'Разработка'            then array['Python','PostgreSQL','Docker','Git','REST API']
    when 'Продажи'               then array['B2B','CRM','холодные звонки','переговоры','amoCRM']
    when 'Аналитика'             then array['SQL','Python','Power BI','дашборды','A/B-тесты']
    when 'Поддержка'             then array['тикет-системы','клиентский сервис','первая линия']
    else                              array['1С','НДС','отчётность','первичка','банк-клиент']
  end,
  array[p.grade],
  p.years, p.years + (p.i % 4),
  p.expected,
  (p.i % 11 = 0),
  case when p.i % 3 = 0 then array['remote','hybrid']::public.work_format[]
       else array['onsite','hybrid']::public.work_format[] end,
  case when p.i % 11 = 0 then 'Готов выйти в ближайшие дни'
       when p.i % 5 = 0  then 'Отрабатывает две недели'
       else null end
from _people p;

-- ---------------------------------------------------------------------------
-- 3. ОТКЛИКИ
--    Воронка сужается кверху: широкий вход, единицы на оффере. Так она
--    выглядит в жизни, и только на таком объёме видно, где она рвётся.
-- ---------------------------------------------------------------------------
insert into public.applications
  (candidate_id, vacancy_id, stage_id, status, source, applied_at, stage_entered_at,
   sla_due_at, last_contact_at, criteria_met, criteria_total,
   rejection_reason_id, archive_segment, closed_at)
select
  p.id, p.vacancy_id, st.id,
  case p.bucket when 'archive' then 'rejected'::public.application_status
                when 'hired'   then 'hired'
                else 'active' end,
  p.src,
  now() - make_interval(hours => p.stage_hours_ago) - make_interval(days => 3 + (p.i % 20)),
  now() - make_interval(hours => p.stage_hours_ago),
  case when st.sla_hours is null then null
       else now() - make_interval(hours => p.stage_hours_ago) + make_interval(hours => st.sla_hours) end,
  now() - make_interval(hours => p.stage_hours_ago),
  case p.bucket
    when 'new' then 0
    when 'screening' then 1 + (p.i % 2)
    when 'interview' then 2 + (p.i % 2)
    when 'assessment' then 3
    when 'practical' then 4
    when 'offer' then 5
    when 'hired' then 5
    else 1 + (p.i % 3)
  end,
  (select count(*) from public.vacancy_criteria c where c.vacancy_id = p.vacancy_id),
  case when p.bucket = 'archive' then rr.id else null end,
  case when p.bucket = 'archive' then rr.segment else null end,
  case when p.bucket = 'archive' then now() - make_interval(hours => p.stage_hours_ago) else null end
from _people p
join lateral (
  -- У массового подбора нет этапов «Тест и кейс» и «Практическая проверка».
  -- Тех, кто по номеру попал бы туда, ставим на интервью — иначе отклик
  -- ссылался бы на этап чужой воронки.
  select s.id, s.sla_hours
  from public.pipeline_stages s
  join public.vacancies v on v.pipeline_id = s.pipeline_id
  where v.id = p.vacancy_id
    and s.code = case
      when p.bucket in ('archive','base') then 'screening'
      when p.bucket in ('assessment','practical')
       and not exists (
         select 1 from public.pipeline_stages x
         join public.vacancies vv on vv.pipeline_id = x.pipeline_id
         where vv.id = p.vacancy_id and x.code = p.bucket
       ) then 'interview'
      else p.bucket
    end
  limit 1
) st on true
left join lateral (
  select r.id, r.segment from public.rejection_reasons r
  order by r.order_index offset (p.i % 12) limit 1
) rr on p.bucket = 'archive'
where p.bucket <> 'base'
on conflict (candidate_id, vacancy_id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. ДОКУМЕНТЫ
--    Кто дошёл до практической проверки и дальше — начал собирать бумаги.
--    У части чего-то не хватает: именно это и блокирует перевод на оффер.
-- ---------------------------------------------------------------------------
insert into public.candidate_documents (candidate_id, kind, state, issued_on, note)
select p.id, k.kind,
       case when p.i % 6 = 0 and k.kind = 'inn' then 'missing'::public.document_state
            when p.i % 7 = 0 and k.kind = 'snils' then 'pending'
            else 'valid' end,
       case when p.i % 6 = 0 and k.kind = 'inn' then null
            else current_date - (200 + p.i % 900) end,
       case when p.i % 6 = 0 and k.kind = 'inn' then 'Кандидат сказал, что найдёт до конца недели'
            else null end
from _people p
cross join (values ('passport'::public.document_kind), ('snils'), ('inn')) as k(kind)
where p.bucket in ('practical','offer','hired')
on conflict (candidate_id, kind) do nothing;

-- ---------------------------------------------------------------------------
-- 5. ПЕРЕПИСКА
--    Счётчик непрочитанного проставлять руками нельзя: его ведёт триггер
--    on_message_inserted, и он же будет вести его в бою. Поэтому «отвечено»
--    здесь задаётся не числом в колонке, а фактом ответа — как в жизни.
--    Диалоги, где последнее слово за кандидатом, и попадут в «Ответить».
-- ---------------------------------------------------------------------------
insert into public.conversations (candidate_id, application_id, channel, last_message_at)
select p.id, a.id, 'telegram', now() - make_interval(hours => 2 + (p.i % 60))
from _people p
join public.applications a on a.candidate_id = p.id
where p.bucket in ('screening','interview','assessment','practical','offer')
on conflict do nothing;

-- Мы написали первыми
insert into public.messages (conversation_id, direction, author_kind, body, is_read, sent_at)
select c.id, 'outbound', 'staff',
       'Здравствуйте! Спасибо за отклик. Готовы обсудить вакансию — когда вам удобно созвониться?',
       true, c.last_message_at - interval '3 hours'
from public.conversations c;

-- Кандидат ответил. Триггер поднимет счётчик непрочитанного на каждом.
insert into public.messages (conversation_id, direction, author_kind, body, is_read, sent_at)
select c.id, 'inbound', 'candidate',
       case (row_number() over (order by c.id)) % 4
         when 0 then 'Добрый день! Удобно завтра после 18:00.'
         when 1 then 'Здравствуйте. Подскажите, пожалуйста, вилку по этой позиции?'
         when 2 then 'Спасибо, интересно. А формат работы гибридный или полностью офис?'
         else 'Добрый день, готов пообщаться. Когда вам удобно?'
       end,
       false, c.last_message_at
from public.conversations c;

-- И мы ответили — везде, кроме каждого шестого. Исходящее сообщение
-- обнуляет счётчик тем же триггером, так что «Ответить» остаётся
-- коротким списком тех, до кого действительно не дошли руки.
with numbered as (
  select c.id, c.last_message_at,
         row_number() over (order by c.created_at, c.id) as rn
  from public.conversations c
)
insert into public.messages (conversation_id, direction, author_kind, body, is_read, sent_at)
select n.id, 'outbound', 'staff',
       case n.rn % 3
         when 0 then 'Спасибо! Вилка обсуждается на встрече — давайте созвонимся, расскажу подробно.'
         when 1 then 'Отлично, записал вас. Пришлю ссылку на встречу за час.'
         else 'Формат гибридный: два дня в офисе, остальное из дома. Удобно будет?'
       end,
       true, n.last_message_at + interval '35 minutes'
from numbered n
where n.rn % 6 <> 0;

-- ---------------------------------------------------------------------------
-- 6. ЗАМЕТКИ
-- ---------------------------------------------------------------------------
insert into public.candidate_notes (candidate_id, application_id, author_id, body, visibility)
select p.id, a.id, m.id,
       case p.i % 3
         when 0 then 'Созвонились. Мотивация внятная, спрашивал про рост внутри команды.'
         when 1 then 'На звонок ответил не сразу, перезвонил сам через час. Договорились на встречу.'
         else 'Опыт по резюме подтверждается, просил уточнить про переработки.'
       end,
       'hiring_team'
from _people p
join public.applications a on a.candidate_id = p.id
cross join _me m
where p.bucket in ('interview','assessment','practical','offer','hired');

commit;

-- ============================================================================
-- ОТКАТ. Убирает только то, что завёл этот файл; справочники из 06 остаются.
-- ============================================================================
-- begin;
-- delete from public.candidates
--  where id in (select candidate_id from public.applications
--               where vacancy_id::text like '44444444-4444-4444-4444-4444444444%')
--     or emails::text like '%@example.ru%';
-- delete from public.vacancies where id::text like '44444444-4444-4444-4444-4444444444%';
-- commit;
