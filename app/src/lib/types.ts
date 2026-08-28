/**
 * Доменные типы. Повторяют схему из sql/, но только те поля, которые
 * действительно нужны интерфейсу: тащить в клиент всю таблицу незачем.
 */

export type AppRole =
  | "superuser"
  | "director"
  | "hr_manager"
  | "dept_head"
  | "line_manager"
  | "employee"
  | "candidate";

export const ROLE_LABEL: Record<AppRole, string> = {
  superuser: "Суперпользователь",
  director: "Руководитель",
  hr_manager: "HR-менеджер",
  dept_head: "Руководитель подразделения",
  line_manager: "Непосредственный руководитель",
  employee: "Сотрудник",
  candidate: "Кандидат",
};

/** Короткая подпись для аватара и бейджа роли */
export const ROLE_SHORT: Record<AppRole, string> = {
  superuser: "SU",
  director: "Р",
  hr_manager: "HR",
  dept_head: "РП",
  line_manager: "НР",
  employee: "С",
  candidate: "К",
};

export type ApplicationStatus =
  | "active"
  | "on_hold"
  | "rejected"
  | "withdrawn"
  | "hired";

export type ArchiveSegment =
  | "not_now"
  | "not_our_profile"
  | "not_ready"
  | "stop_list";

export type CriterionResult = "met" | "partial" | "not_met" | "unknown";

export type EvidenceSource =
  | "resume"
  | "screening"
  | "interview"
  | "test"
  | "case"
  | "demo_lesson"
  | "documents"
  | "reference"
  | "manual";

export const SOURCE_LABEL: Record<EvidenceSource, string> = {
  resume: "резюме",
  screening: "скрининг",
  interview: "интервью",
  test: "тест",
  case: "кейс",
  demo_lesson: "демо-урок",
  documents: "документы",
  reference: "рекомендация",
  manual: "внесено вручную",
};

export type VacancyStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "published"
  | "on_hold"
  | "closed"
  | "cancelled";

export const VACANCY_STATUS_LABEL: Record<VacancyStatus, string> = {
  draft: "Черновик",
  pending_approval: "На согласовании",
  approved: "Согласована",
  published: "Опубликована",
  on_hold: "Приостановлена",
  closed: "Закрыта",
  cancelled: "Отменена",
};

export type VacancyPriority = "low" | "normal" | "high" | "critical";

export const PRIORITY_LABEL: Record<VacancyPriority, string> = {
  low: "Низкий",
  normal: "Обычный",
  high: "Высокий",
  critical: "Горит",
};

export type DocumentKind =
  | "criminal_record"
  | "medical_book"
  | "diploma"
  | "qualification"
  | "passport"
  | "snils"
  | "inn"
  | "other";

export const DOCUMENT_LABEL: Record<DocumentKind, string> = {
  criminal_record: "Справка об отсутствии судимости",
  medical_book: "Медкнижка",
  diploma: "Диплом",
  qualification: "Категория",
  passport: "Паспорт",
  snils: "СНИЛС",
  inn: "ИНН",
  other: "Другое",
};

export type DocumentState =
  | "missing"
  | "pending"
  | "valid"
  | "expiring"
  | "expired"
  | "rejected";

export interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  position_title: string | null;
  department_id: string | null;
  avatar_url?: string | null;
}

export interface Department {
  id: string;
  name: string;
  cost_per_idle_day: number;
}

export interface PipelineStage {
  id: string;
  pipeline_id: string;
  code: string;
  name: string;
  order_index: number;
  /** Токен дизайн-системы: stage-1 … stage-7. Не значение цвета. */
  color_token: string;
  sla_hours: number | null;
  is_terminal: boolean;
}

export interface VacancyCriterion {
  id: string;
  vacancy_id: string;
  name: string;
  description: string | null;
  weight: number;
  is_required: boolean;
  order_index: number;
}

export interface Vacancy {
  id: string;
  title: string;
  pipeline_id: string;
  department_id: string;
  department_name: string;
  hiring_manager_id: string | null;
  hiring_manager_name: string | null;
  line_manager_id?: string | null;
  recruiter_id: string | null;
  recruiter_name: string | null;
  status: VacancyStatus;
  priority: VacancyPriority;
  headcount: number;
  hired_count: number;
  subject: string | null;
  grades: string | null;
  city: string | null;
  weekly_hours: number | null;
  description: string | null;
  first_month_reality: string | null;
  target_close_date: string | null;
  opened_at: string | null;
  closed_at: string | null;
  /** Приходит отдельным запросом: у вилки своя политика доступа. */
  compensation?: VacancyCompensation | null;
}

export interface VacancyCompensation {
  vacancy_id: string;
  salary_min: number | null;
  salary_max: number | null;
  is_net: boolean;
  market_p50: number | null;
}

export interface Candidate {
  id: string;
  full_name: string;
  phones: string[];
  emails: string[];
  city: string | null;
  telegram_username: string | null;
  primary_source: string;
  is_blacklisted: boolean;
  blacklist_reason: string | null;
  hide_from_current_employer: boolean;
  current_employer: string | null;
  consent_pd_granted: boolean;
  last_activity_at: string | null;
  resume_text: string | null;
  teacher?: TeacherProfile | null;
}

export interface TeacherProfile {
  candidate_id: string;
  subjects: string[];
  education_stages: string[];
  years_with_children: number | null;
  total_experience_years: number | null;
  available_hours_per_week: number | null;
  schedule_note: string | null;
  ready_for_substitution: boolean;
}

export interface Application {
  id: string;
  candidate_id: string;
  candidate_name: string;
  vacancy_id: string;
  vacancy_title: string;
  stage_id: string;
  status: ApplicationStatus;
  source: string;
  applied_at: string;
  stage_entered_at: string;
  sla_due_at: string | null;
  criteria_met: number;
  criteria_total: number;
  archive_segment: ArchiveSegment | null;
  rejection_reason_id: string | null;
  is_private: boolean;
  expected_salary: number | null;
  /** Краткая подпись под именем на карточке: предмет и ступень */
  subtitle: string | null;
}

export interface CriteriaResult {
  id: string;
  application_id: string;
  criterion_id: string;
  criterion_name: string;
  result: CriterionResult;
  evidence: string | null;
  source: EvidenceSource;
  is_ai: boolean;
  confirmed_by: string | null;
}

export interface RejectionReason {
  id: string;
  code: string;
  name: string;
  segment: ArchiveSegment;
  candidate_wording: string;
  reactivate_after_months: number | null;
}

export interface Conversation {
  id: string;
  candidate_id: string;
  candidate_name: string;
  application_id: string | null;
  vacancy_title: string | null;
  channel: string;
  last_message_at: string | null;
  unread_for_staff: number;
  is_ai_autopilot: boolean;
}

export interface Message {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  author_kind: "candidate" | "staff" | "ai_assistant" | "system";
  author_name: string | null;
  body: string;
  sent_at: string;
}

export interface Interview {
  id: string;
  application_id: string;
  kind: string;
  status: string;
  scheduled_at: string;
  work_format: string;
  ai_summary: string | null;
  ai_conclusions: string | null;
  recording_consent: boolean;
}

export interface Assessment {
  id: string;
  application_id: string;
  template_name: string;
  kind: string;
  status: string;
  assigned_at: string;
  submitted_at: string | null;
  feedback_internal: string | null;
  feedback_for_candidate: string | null;
  verdict: string | null;
}

export interface CandidateDocument {
  id: string;
  candidate_id: string;
  candidate_name: string;
  kind: DocumentKind;
  state: DocumentState;
  expires_on: string | null;
}

export interface Note {
  id: string;
  candidate_id: string;
  application_id: string | null;
  author_name: string;
  body: string;
  visibility: "private" | "hr_only" | "hiring_team" | "all_staff";
  is_ai: boolean;
  created_at: string;
}

export interface TeamOpinion {
  id: string;
  application_id: string;
  author_name: string;
  verdict: "yes" | "doubt" | "no";
  comment: string | null;
  created_at: string;
}

export interface Requisition {
  id: string;
  requested_by_name: string;
  department_name: string;
  status: string;
  q_who_needed: string | null;
  q_tasks: string | null;
  q_must_have: string | null;
  q_deadline: string | null;
  q_budget: string | null;
  created_at: string;
}

export interface FunnelRow {
  stage_id: string;
  stage_name: string;
  color_token: string;
  order_index: number;
  ever_reached: number;
}

export interface SlaBreach {
  id: string;
  application_id: string;
  candidate_name: string;
  vacancy_title: string;
  responsible_name: string;
  hours_overdue: number;
  state: string;
}

export interface DashboardStats {
  days_to_hire: number;
  days_to_hire_delta: number;
  cost_per_hire: number;
  cost_per_hire_delta: number;
  open_vacancies: number;
  burning_vacancies: number;
  probation_dropout: number;
  probation_dropout_delta: number;
}
