-- ============================================================================
-- 20. С КАКОЙ ВАКАНСИИ hh ПРИШЁЛ ОТКЛИК
--
-- Отклик привязан к нашей вакансии, а наша вакансия может нести несколько
-- размещений на hh. Без номера вакансии hh у самого отклика связь «этот
-- человек откликнулся вот на это размещение» теряется при любой перестройке
-- вакансий — что и случилось при склейке и обратном разведении.
-- ============================================================================
alter table public.applications
  add column if not exists external_vacancy_id text;

create index if not exists idx_applications_external_vacancy
  on public.applications (external_vacancy_id) where external_vacancy_id is not null;
