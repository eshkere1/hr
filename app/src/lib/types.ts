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
  | "practical_check"
  | "documents"
  | "reference"
  | "manual";

export const SOURCE_LABEL: Record<EvidenceSource, string> = {
  resume: "резюме",
  screening: "скрининг",
  interview: "интервью",
  test: "тест",
  case: "кейс",
  practical_check: "практическая проверка",
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

/**
 * Документы для оформления.
 *
 * Первые пять нужны почти везде, остальные — отраслевые. Какие из них
 * обязательны, решает вакансия (`Vacancy.required_documents`), а не
 * зашитый в код список: у курьера, бухгалтера и врача он разный.
 */
export type DocumentKind =
  | "passport"
  | "snils"
  | "inn"
  | "work_book"
  | "diploma"
  | "qualification"
  | "medical_certificate"
  | "background_check"
  | "military_id"
  | "other";

export const DOCUMENT_LABEL: Record<DocumentKind, string> = {
  passport: "Паспорт",
  snils: "СНИЛС",
  inn: "ИНН",
  work_book: "Трудовая книжка",
  diploma: "Диплом об образовании",
  qualification: "Сертификат или аккредитация",
  medical_certificate: "Медицинский осмотр",
  background_check: "Проверка службой безопасности",
  military_id: "Военный билет",
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
  /** Направление: разработка, продажи, поддержка и так далее */
  specialization: string | null;
  grade: GradeLevel | null;
  city: string | null;
  /** Какие документы обязательны именно для этой вакансии (фишка 50) */
  required_documents: DocumentKind[];
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
  profile?: CandidateProfile | null;
}

/** Профессиональный профиль кандидата. Отраслево-нейтральный. */
export interface CandidateProfile {
  candidate_id: string;
  /** Направление: «Разработка», «Продажи», «Бухгалтерия» */
  specialization: string | null;
  /** Навыки и инструменты — по ним идёт поиск по базе */
  skills: string[];
  grades: GradeLevel[];
  years_in_specialty: number | null;
  total_experience_years: number | null;
  /** Когда готов выйти */
  available_from: string | null;
  schedule_note: string | null;
  /** Готов выйти срочно — закрыть внезапную дыру */
  ready_for_urgent_start: boolean;
  work_formats: WorkFormat[];
  expected_salary: number | null;
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
  /** Краткая подпись под именем на карточке: направление и навыки */
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
  /** Через какого бота идёт диалог: отвечать нужно из того же аккаунта. */
  bot_id: string | null;
  bot_name: string | null;
  /** Начало последнего сообщения — для списка диалогов. */
  preview: string | null;
  preview_incoming: boolean;
}

/**
 * Бот-мессенджер. Их несколько: разные бренды, регионы, кампании — у
 * каждого свой аккаунт в Телеграме и свой тон.
 *
 * Токена здесь нет и быть не может: он живёт в базе под RLS и наружу
 * не отдаётся. token_hint — последние символы, чтобы человек узнал свой
 * бот в списке и не перепутал два похожих.
 */
export interface MessengerBot {
  id: string;
  channel: string;
  name: string;
  username: string | null;
  department_id: string | null;
  department_name: string | null;
  is_active: boolean;
  is_default: boolean;
  last_error: string | null;
  last_seen_at: string | null;
  token_hint: string;
  conversations_count: number;
  created_at: string;
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

// ===========================================================================
// КАЛЕНДАРЬ И САМОЗАПИСЬ (фишка 34)
// ===========================================================================
export interface InterviewSlot {
  id: string;
  owner_id: string;
  owner_name: string;
  vacancy_id: string | null;
  kind: string;
  starts_at: string;
  ends_at: string;
  work_format: WorkFormat;
  location: string | null;
  is_booked: boolean;
  booked_by_application_id: string | null;
}

export type WorkFormat = "onsite" | "remote" | "hybrid";

/** Уровень позиции. Заменяет отраслевые «ступени»: подходит любой роли. */
export type GradeLevel = "intern" | "junior" | "middle" | "senior" | "lead";

export const GRADE_LABEL: Record<GradeLevel, string> = {
  intern: "стажёр",
  junior: "начинающий",
  middle: "самостоятельный",
  senior: "опытный",
  lead: "ведущий",
};

export const WORK_FORMAT_LABEL: Record<WorkFormat, string> = {
  onsite: "в офисе",
  remote: "удалённо",
  hybrid: "гибрид",
};

// ===========================================================================
// ОФФЕР (фишка 39) И ДОГОВОР
// ===========================================================================
export type OfferStatus =
  | "draft" | "pending_approval" | "approved" | "sent"
  | "accepted" | "declined" | "expired" | "revoked";

export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  draft: "Черновик",
  pending_approval: "На согласовании",
  approved: "Согласован",
  sent: "Отправлен",
  accepted: "Принят",
  declined: "Отклонён",
  expired: "Просрочен",
  revoked: "Отозван",
};

export interface Offer {
  id: string;
  application_id: string;
  candidate_name: string;
  vacancy_title: string;
  status: OfferStatus;
  salary: number | null;
  is_net: boolean;
  weekly_hours: number | null;
  start_date: string | null;
  probation_months: number;
  body_md: string | null;
  created_by_name: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  sent_at: string | null;
  respond_by: string | null;
  responded_at: string | null;
}

// ===========================================================================
// СОГЛАСОВАНИЕ И ВЕРСИИ ВАКАНСИИ (фишки 26, 27)
// ===========================================================================
export interface VacancyApproval {
  id: string;
  vacancy_id: string;
  approver_name: string;
  decision: "pending" | "approved" | "rejected";
  comment: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface VacancyVersion {
  id: string;
  vacancy_id: string;
  version_no: number;
  changed_by_name: string;
  change_note: string | null;
  created_at: string;
  /** Что именно поменялось: поле, было, стало */
  changes: { field: string; from: string; to: string }[];
}

// ===========================================================================
// ЦЕННОСТИ (топливо фишки 24) И ВОПРОСЫ (фишка 28)
// ===========================================================================
export interface CompanyValue {
  id: string;
  code: string;
  name: string;
  description: string;
  good_example: string | null;
  bad_example: string | null;
  is_active: boolean;
}

export interface InterviewQuestion {
  id: string;
  vacancy_id: string;
  criterion_id: string | null;
  criterion_name: string | null;
  question: string;
  good_answer: string | null;
  is_ai_generated: boolean;
}

// ===========================================================================
// ДЕМО-УРОК (фишка 51)
// ===========================================================================
/**
 * Практическая проверка: кандидат делает настоящую рабочую задачу,
 * а не рассказывает о себе. Одни и те же аспекты у всех, иначе проверки
 * не сравнимы между собой и решение снова становится впечатлением.
 */
export interface PracticalCheck {
  id: string;
  interview_id: string;
  application_id: string;
  candidate_name: string;
  /** Что именно делал: «разбор инцидента», «звонок клиенту», «код-ревью» */
  task: string | null;
  context: string | null;
  /** Кто наблюдал: команда, реальный клиент, запись */
  audience: string | null;
  reviewer_name: string | null;
  verdict: string | null;
  comment: string | null;
  scheduled_at: string;
  scores: CheckScore[];
}

export interface CheckScore {
  id: string;
  aspect: string;
  result: CriterionResult;
  comment: string | null;
  reviewer_name: string;
}

/**
 * Оценочный лист практической проверки. Пять аспектов одинаковы для всех
 * ролей: они про то, как человек работает, а не про предметную область.
 * Предметную часть закрывают критерии вакансии.
 */
export const CHECK_ASPECTS = [
  "Понял задачу и уточнил непонятное",
  "Качество решения",
  "Самостоятельность в работе",
  "Реакция на обратную связь",
  "Объясняет понятно",
] as const;

// ===========================================================================
// СОГЛАСИЯ И ПРАВО НА ЗАБВЕНИЕ (фишки 61, 62)
// ===========================================================================
export type ConsentKind =
  | "pd_processing" | "call_recording" | "third_party_share" | "marketing";

export const CONSENT_LABEL: Record<ConsentKind, string> = {
  pd_processing: "Обработка персональных данных",
  call_recording: "Запись созвонов",
  third_party_share: "Передача партнёрам",
  marketing: "Сообщество и рассылки",
};

export interface Consent {
  id: string;
  candidate_id: string;
  candidate_name: string;
  kind: ConsentKind;
  granted_at: string | null;
  revoked_at: string | null;
  text_version: string;
  source: string;
}

// ===========================================================================
// ПОДМЕНЫ (фишка 55) И РЕФЕРАЛЫ (фишка 60)
// ===========================================================================
/** Срочная замена: кто из базы готов выйти и закрыть внезапную дыру */
export interface UrgentNeed {
  id: string;
  role: string | null;
  department_name: string;
  needed_on: string;
  hours: number | null;
  rate: number | null;
  status: "open" | "filled" | "cancelled";
  filled_by_name: string | null;
}

export interface Referral {
  id: string;
  referrer_name: string;
  referred_name: string;
  vacancy_title: string | null;
  status: "submitted" | "in_progress" | "hired" | "passed_probation" | "rejected" | "bonus_paid";
  bonus_amount: number;
  created_at: string;
}

export const REFERRAL_STATUS_LABEL: Record<Referral["status"], string> = {
  submitted: "Отправлена",
  in_progress: "В отборе",
  hired: "Вышел",
  passed_probation: "Прошёл испытательный",
  rejected: "Не подошёл",
  bonus_paid: "Бонус выплачен",
};

// ===========================================================================
// ПОДБОР ИЗ АРХИВА (фишка 9) И СМЫСЛОВОЙ ПОИСК (фишки 15, 16)
// ===========================================================================
/** Результат подбора: не балл, а перечень совпадений с объяснением. */
export interface ArchiveMatch {
  candidate: Candidate;
  score: number;
  /** Почему предложен — читаемые фразы, каждая проверяема */
  reasons: string[];
  /** Что мешает — тоже показываем, иначе это реклама, а не подбор */
  blockers: string[];
  /** Прошлый отказ: сегмент и формулировка */
  lastRejection: { segment: ArchiveSegment; reason: string; when: string } | null;
  /** Можно ли написать сейчас — лимит касаний */
  canTouch: boolean;
}

/** Что удалось понять из фразы на обычном языке */
export interface ParsedQuery {
  specializations: string[];
  skills: string[];
  grades: GradeLevel[];
  city: string | null;
  minExperience: number | null;
  remoteOnly: boolean;
  readyUrgently: boolean;
  freeWords: string[];
}

// ===========================================================================
// ЗАРПЛАТНАЯ АНАЛИТИКА (фишка 23)
// ===========================================================================
export interface SalaryGap {
  application_id: string;
  candidate_name: string;
  vacancy_title: string;
  expected: number | null;
  band_min: number | null;
  band_max: number | null;
  market_p50: number | null;
  /** Насколько выше утверждённой вилки. Отрицательное — в вилке */
  over_band: number | null;
  /** Насколько выше рынка */
  over_market: number | null;
}
