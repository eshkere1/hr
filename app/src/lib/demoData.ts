/**
 * Данные демо-режима.
 *
 * Это не «рыба» ради заполнения: набор собран так, чтобы на экранах было
 * видно то, ради чего платформа делается — обрыв воронки между откликом
 * и скринингом, молчащий руководитель на эскалации, критерии с основаниями,
 * незакрытые документы перед оффером, кандидат из архива с причиной
 * прошлого отказа.
 *
 * Компания намеренно обычная: разработка, продажи, поддержка, аналитика.
 * Продукт отраслево-нейтральный, и данные это показывают.
 *
 * Даты считаются от текущего момента, поэтому сроки на экранах всегда живые.
 */
import type {
  Application,
  Assessment,
  Candidate,
  CandidateDocument,
  CandidateProfile,
  CompanyValue,
  Consent,
  Conversation,
  CriteriaResult,
  Department,
  GradeLevel,
  Interview,
  InterviewSlot,
  Message,
  Note,
  Offer,
  PipelineStage,
  PracticalCheck,
  Profile,
  Referral,
  RejectionReason,
  Requisition,
  TeamOpinion,
  UrgentNeed,
  Vacancy,
  VacancyApproval,
  VacancyCriterion,
  VacancyVersion,
} from "./types";

const H = 3600_000;
const D = 86_400_000;
const now = Date.now();
const hoursAgo = (n: number) => new Date(now - n * H).toISOString();
const daysAgo = (n: number) => new Date(now - n * D).toISOString();
const inHours = (n: number) => new Date(now + n * H).toISOString();
const inDays = (n: number) => new Date(now + n * D).toISOString();

/** День N от сегодня в заданный час: слоты должны попадать в рабочее время. */
const dayAt = (n: number, hour: number, minute = 0) => {
  const d = new Date(now + n * D);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};
const plusMin = (iso: string, min: number) =>
  new Date(new Date(iso).getTime() + min * 60000).toISOString();

/** Телефон витринного кандидата. Вымышленный, но набирается как настоящий. */
const showcasePhone = (id: string) => {
  const n = Number(id.replace(/\D/g, "")) || 1;
  return `+7 916 ${100 + n * 7}-${10 + (n * 3) % 90}-${20 + (n * 11) % 70}`;
};

// ---------------------------------------------------------------------------
// Организация и люди
// ---------------------------------------------------------------------------
export const departments: Department[] = [
  { id: "d1", name: "Разработка", cost_per_idle_day: 6000 },
  { id: "d2", name: "Продажи", cost_per_idle_day: 8000 },
  { id: "d3", name: "Поддержка", cost_per_idle_day: 3000 },
  { id: "d4", name: "Аналитика", cost_per_idle_day: 4500 },
  { id: "d5", name: "Бухгалтерия и финансы", cost_per_idle_day: 2500 },
];

export const staff: Profile[] = [
  { id: "u-director", full_name: "Юрий Ветров", email: "director@rastim.ru", position_title: "Генеральный директор", department_id: "d5" },
  { id: "u-hr", full_name: "Ольга Тимофеева", email: "hr@rastim.ru", position_title: "HR-менеджер", department_id: "d5" },
  { id: "u-hr2", full_name: "Марина Слуцкая", email: "hr2@rastim.ru", position_title: "HR-менеджер", department_id: "d5" },
  { id: "u-dept", full_name: "Елена Крылова", email: "dept@rastim.ru", position_title: "Руководитель разработки", department_id: "d1" },
  { id: "u-line", full_name: "Сергей Носов", email: "line@rastim.ru", position_title: "Руководитель отдела продаж", department_id: "d2" },
  { id: "u-employee", full_name: "Анна Жукова", email: "employee@rastim.ru", position_title: "Ведущий разработчик, наставник", department_id: "d1" },
  { id: "u-candidate", full_name: "Ирина Ковалёва", email: "candidate@example.com", position_title: null, department_id: null },
];

// ---------------------------------------------------------------------------
// Воронка. Цвет — токен дизайн-системы, не значение цвета.
// ---------------------------------------------------------------------------
export const stages: PipelineStage[] = [
  { id: "s1", pipeline_id: "p1", code: "new", name: "Новый отклик", order_index: 1, color_token: "stage-1", sla_hours: 24, is_terminal: false },
  { id: "s2", pipeline_id: "p1", code: "screening", name: "Скрининг", order_index: 2, color_token: "stage-2", sla_hours: 48, is_terminal: false },
  { id: "s3", pipeline_id: "p1", code: "interview", name: "Интервью", order_index: 3, color_token: "stage-3", sla_hours: 72, is_terminal: false },
  { id: "s4", pipeline_id: "p1", code: "assessment", name: "Тест и кейс", order_index: 4, color_token: "stage-4", sla_hours: 96, is_terminal: false },
  { id: "s5", pipeline_id: "p1", code: "practical", name: "Практическая проверка", order_index: 5, color_token: "stage-5", sla_hours: 120, is_terminal: false },
  { id: "s6", pipeline_id: "p1", code: "offer", name: "Оффер", order_index: 6, color_token: "stage-6", sla_hours: 72, is_terminal: false },
  { id: "s7", pipeline_id: "p1", code: "hired", name: "Вышел", order_index: 7, color_token: "stage-7", sla_hours: null, is_terminal: true },
];

// ---------------------------------------------------------------------------
// Вакансии
// ---------------------------------------------------------------------------
export const vacancies: Vacancy[] = [
  {
    id: "v1", title: "Backend-разработчик", pipeline_id: "p1",
    department_id: "d1", department_name: "Разработка",
    hiring_manager_id: "u-dept", hiring_manager_name: "Елена Крылова",
    recruiter_id: "u-hr", recruiter_name: "Ольга Тимофеева",
    status: "published", priority: "critical", headcount: 2, hired_count: 0,
    specialization: "Разработка", grade: "middle", city: "Москва", weekly_hours: 40,
    required_documents: ["passport", "snils", "inn"],
    description: "Сервис приёма платежей: новые интеграции, поддержка существующих, дежурства раз в месяц.",
    first_month_reality: "Первые две недели — парное программирование с наставником и мелкие задачи в проде. Свой сервис берёте с третьей недели. Дежурить начинаете со второго месяца, не раньше.",
    target_close_date: inDays(11).slice(0, 10), opened_at: daysAgo(27), closed_at: null,
    compensation: { vacancy_id: "v1", salary_min: 210000, salary_max: 260000, is_net: true, market_p50: 245000 },
  },
  {
    id: "v2", title: "Менеджер по продажам", pipeline_id: "p1",
    department_id: "d2", department_name: "Продажи",
    hiring_manager_id: "u-line", hiring_manager_name: "Сергей Носов",
    recruiter_id: "u-hr", recruiter_name: "Ольга Тимофеева",
    status: "published", priority: "critical", headcount: 3, hired_count: 0,
    specialization: "Продажи", grade: "middle", city: "Москва", weekly_hours: 40,
    // Работа с деньгами клиентов: проверка службой безопасности обязательна
    required_documents: ["passport", "snils", "inn", "background_check"],
    description: "B2B, средний чек 400 тысяч. Тёплая база плюс собственный поиск, цикл сделки полтора месяца.",
    first_month_reality: "Первый месяц — чужие сделки на сопровождении и обучение продукту. Свой план начинается со второго месяца, и он сразу полный.",
    target_close_date: inDays(6).slice(0, 10), opened_at: daysAgo(19), closed_at: null,
    compensation: { vacancy_id: "v2", salary_min: 120000, salary_max: 160000, is_net: true, market_p50: 150000 },
  },
  {
    id: "v3", title: "Аналитик данных", pipeline_id: "p1",
    department_id: "d4", department_name: "Аналитика",
    hiring_manager_id: "u-dept", hiring_manager_name: "Елена Крылова",
    recruiter_id: "u-hr2", recruiter_name: "Марина Слуцкая",
    status: "published", priority: "high", headcount: 1, hired_count: 0,
    specialization: "Аналитика", grade: "middle", city: "Москва", weekly_hours: 40,
    required_documents: ["passport", "snils", "inn"],
    description: "Отчётность для коммерции, SQL и дашборды. Полностью удалённо.",
    first_month_reality: "Витрины уже есть, но документации к ним нет. Первый месяц уйдёт на то, чтобы разобраться и описать их.",
    target_close_date: inDays(24).slice(0, 10), opened_at: daysAgo(12), closed_at: null,
    compensation: { vacancy_id: "v3", salary_min: 150000, salary_max: 190000, is_net: true, market_p50: 185000 },
  },
  {
    id: "v4", title: "Специалист поддержки", pipeline_id: "p1",
    department_id: "d3", department_name: "Поддержка",
    hiring_manager_id: "u-line", hiring_manager_name: "Сергей Носов",
    recruiter_id: "u-hr", recruiter_name: "Ольга Тимофеева",
    status: "published", priority: "normal", headcount: 2, hired_count: 0,
    specialization: "Поддержка", grade: "junior", city: "Москва", weekly_hours: 40,
    required_documents: ["passport", "snils", "inn"],
    description: "Первая линия: обращения в чате и по почте, эскалация во вторую линию. Сменный график 2/2.",
    first_month_reality: "Две недели на скриптах и с наставником рядом. Ночные смены начинаются с третьего месяца.",
    target_close_date: inDays(38).slice(0, 10), opened_at: daysAgo(8), closed_at: null,
    compensation: { vacancy_id: "v4", salary_min: 65000, salary_max: 85000, is_net: true, market_p50: 78000 },
  },
  {
    id: "v5", title: "Бухгалтер на первичную документацию", pipeline_id: "p2",
    department_id: "d5", department_name: "Бухгалтерия и финансы",
    hiring_manager_id: "u-director", hiring_manager_name: "Юрий Ветров",
    recruiter_id: "u-hr2", recruiter_name: "Марина Слуцкая",
    status: "pending_approval", priority: "normal", headcount: 1, hired_count: 0,
    specialization: "Бухгалтерия", grade: "middle", city: "Москва", weekly_hours: 40,
    required_documents: ["passport", "snils", "inn", "background_check"],
    description: "Первичка, сверки с поставщиками, помощь в закрытии месяца.",
    first_month_reality: "Первый месяц — вместе с уходящим бухгалтером, она передаёт дела до конца квартала.",
    target_close_date: inDays(45).slice(0, 10), opened_at: null, closed_at: null,
    compensation: { vacancy_id: "v5", salary_min: 95000, salary_max: 120000, is_net: true, market_p50: 110000 },
  },
];

// ---------------------------------------------------------------------------
// Критерии вакансии: 5–6 штук. Из них складывается «4 из 6».
// ---------------------------------------------------------------------------
export const criteria: VacancyCriterion[] = [
  { id: "c1", vacancy_id: "v1", name: "Коммерческий опыт на Python от 3 лет", description: "Именно продакшн, а не курсы и пет-проекты", weight: 5, is_required: true, order_index: 1 },
  { id: "c2", vacancy_id: "v1", name: "Проектирование API и работа с PostgreSQL", description: null, weight: 5, is_required: true, order_index: 2 },
  { id: "c3", vacancy_id: "v1", name: "Готовность к дежурствам раз в месяц", description: "Неделя дежурства в месяц, ночные вызовы редки, но бывают", weight: 4, is_required: true, order_index: 3 },
  { id: "c4", vacancy_id: "v1", name: "Разбор инцидента без поиска виноватых", description: "Проверяется кейсом, а не словами о себе", weight: 5, is_required: false, order_index: 4 },
  { id: "c5", vacancy_id: "v1", name: "Объясняет решение понятно", description: "Видно только на практической проверке", weight: 4, is_required: false, order_index: 5 },
  { id: "c6", vacancy_id: "v1", name: "Документы для оформления", description: "Паспорт, СНИЛС, ИНН", weight: 3, is_required: true, order_index: 6 },

  { id: "c7", vacancy_id: "v2", name: "Опыт B2B-продаж от 2 лет", description: "Средний чек от 200 тысяч", weight: 5, is_required: true, order_index: 1 },
  { id: "c8", vacancy_id: "v2", name: "Сам ищет клиентов, а не только обрабатывает входящие", description: null, weight: 5, is_required: true, order_index: 2 },
  { id: "c9", vacancy_id: "v2", name: "Называет свои числа по прошлому месту", description: "План, факт, конверсия. Без этого опыт непроверяем", weight: 4, is_required: true, order_index: 3 },
  { id: "c10", vacancy_id: "v2", name: "Работа с недовольным клиентом", description: "Проверяется кейсом", weight: 4, is_required: false, order_index: 4 },
  { id: "c11", vacancy_id: "v2", name: "Проверка службой безопасности пройдена", description: "Работа с деньгами клиентов", weight: 5, is_required: true, order_index: 5 },

  { id: "c12", vacancy_id: "v3", name: "SQL на уровне сложных выборок", description: null, weight: 5, is_required: true, order_index: 1 },
  { id: "c13", vacancy_id: "v3", name: "Доводит отчёт до решения, а не до графика", description: null, weight: 5, is_required: true, order_index: 2 },
  { id: "c14", vacancy_id: "v3", name: "Опыт работы удалённо", description: "Команда распределённая, синхронов мало", weight: 3, is_required: false, order_index: 3 },
  { id: "c15", vacancy_id: "v3", name: "Документы для оформления", description: null, weight: 3, is_required: true, order_index: 4 },
];

// ---------------------------------------------------------------------------
// Кандидаты
// ---------------------------------------------------------------------------
const prof = (
  candidate_id: string,
  specialization: string,
  skills: string[],
  grades: GradeLevel[],
  years_in_specialty: number,
  total: number,
  expected: number,
  extra: Partial<CandidateProfile> = {},
): CandidateProfile => ({
  candidate_id, specialization, skills, grades,
  years_in_specialty, total_experience_years: total,
  available_from: null, schedule_note: null,
  ready_for_urgent_start: false,
  work_formats: ["onsite", "hybrid"],
  expected_salary: expected,
  ...extra,
});

const cand = (
  id: string, full_name: string, city: string,
  profile: CandidateProfile,
  extra: Partial<Candidate> = {},
): Candidate => ({
  id, full_name, phones: [showcasePhone(id)], emails: [`${id}@example.com`],
  city, telegram_username: `@${id}`, primary_source: "hh",
  is_blacklisted: false, blacklist_reason: null,
  hide_from_current_employer: false, current_employer: null,
  consent_pd_granted: true, last_activity_at: hoursAgo(6),
  resume_text: null, profile,
  ...extra,
});

export const candidates: Candidate[] = [
  cand("k1", "Ирина Ковалёва", "Москва",
    prof("k1", "Разработка", ["Python", "PostgreSQL", "Docker"], ["middle", "senior"], 7, 9, 250000,
      { work_formats: ["onsite", "hybrid", "remote"] }),
    { current_employer: "Платёжный сервис", hide_from_current_employer: true,
      resume_text: "Backend-разработчик. Семь лет на Python, последние три — платёжные интеграции. Дежурила в графике одна неделя в месяц." }),

  cand("k2", "Пётр Соколов", "Москва",
    prof("k2", "Разработка", ["Python", "SQL"], ["middle"], 4, 5, 275000),
    { resume_text: "Python и немного Go, четыре года. Работал в аутсорсе и продуктовой компании." }),

  cand("k3", "Анна Лебедева", "Санкт-Петербург",
    prof("k3", "Разработка", ["Python", "PostgreSQL", "Kubernetes"], ["senior", "lead"], 11, 13, 300000,
      { work_formats: ["remote", "hybrid"], ready_for_urgent_start: true }),
    { resume_text: "Одиннадцать лет, последние четыре — ведущий разработчик и наставник." }),

  cand("k4", "Мария Гусева", "Москва",
    prof("k4", "Продажи", ["B2B", "переговоры", "amoCRM"], ["middle"], 6, 8, 155000), {}),

  cand("k5", "Олег Дементьев", "Москва",
    prof("k5", "Поддержка", ["CRM", "английский"], ["junior"], 2, 3, 75000), {}),

  cand("k6", "Дарья Плотникова", "Москва",
    prof("k6", "Продажи", ["B2B", "холодные звонки", "презентации"], ["middle", "senior"], 9, 11, 158000), {}),

  cand("k7", "Никита Осипов", "Новосибирск",
    prof("k7", "Аналитика", ["SQL", "Power BI", "Python"], ["middle", "senior"], 5, 6, 230000,
      { work_formats: ["remote"] }),
    { resume_text: "Аналитик данных, пять лет. Строил отчётность для коммерческого блока, работаю удалённо." }),

  cand("k8", "Светлана Ермакова", "Москва",
    prof("k8", "Продажи", ["B2B", "переговоры"], ["senior"], 12, 14, 160000,
      { ready_for_urgent_start: true }), {}),

  cand("k9", "Артём Белов", "Москва",
    prof("k9", "Поддержка", ["CRM", "английский", "эскалации"], ["junior", "middle"], 4, 5, 82000,
      { ready_for_urgent_start: true, schedule_note: "Готов на сменный график" }), {}),

  cand("k10", "Ксения Романова", "Москва",
    prof("k10", "Разработка", ["Python"], ["junior"], 2, 2, 170000), {}),

  cand("k11", "Владимир Кутепов", "Екатеринбург",
    prof("k11", "Разработка", ["Python", "PostgreSQL"], ["senior"], 12, 16, 290000,
      { work_formats: ["remote", "hybrid"] }), {}),

  cand("k12", "Юлия Панина", "Москва",
    prof("k12", "Бухгалтерия", ["1С", "первичка", "сверки"], ["middle"], 5, 7, 115000), {}),

  cand("k13", "Егор Мальцев", "Москва",
    prof("k13", "Аналитика", ["SQL", "Tableau"], ["middle"], 6, 7, 195000), {}),

  cand("k14", "Татьяна Ремизова", "Москва",
    prof("k14", "Разработка", ["Python", "PostgreSQL"], ["middle", "senior"], 8, 12, 240000,
      { ready_for_urgent_start: true, schedule_note: "Готова выйти через две недели" }),
    { resume_text: "Восемь лет в разработке. Был перерыв на декрет, возвращаюсь к работе." }),

  cand("k15", "Роман Синицын", "Москва",
    prof("k15", "Поддержка", ["CRM"], ["junior"], 1, 2, 70000),
    { consent_pd_granted: false }),

  cand("k17", "Максим Дорохов", "Москва",
    prof("k17", "Разработка", ["Python", "PostgreSQL", "Docker"], ["middle"], 5, 6, 245000,
      { work_formats: ["onsite", "hybrid", "remote"] }),
    { resume_text: "Пять лет на Python в финтехе. Дежурства были, отношусь спокойно." }),

  cand("k18", "Полина Ветрова", "Воронеж",
    prof("k18", "Разработка", ["Python", "SQL"], ["middle"], 4, 5, 215000,
      { work_formats: ["remote"], ready_for_urgent_start: true }),
    { resume_text: "Четыре года на Python, всё время удалённо." }),

  cand("k16", "Алиса Горелова", "Казань",
    prof("k16", "Разработка", ["Python", "SQL"], ["junior", "middle"], 3, 4, 200000,
      { work_formats: ["remote"] }), {}),
];

// ---------------------------------------------------------------------------
// Отклики
// ---------------------------------------------------------------------------
const app = (
  id: string, candidateId: string, vacancyId: string, stageId: string,
  opts: Partial<Application> = {},
): Application => {
  const c = candidates.find((x) => x.id === candidateId)!;
  const v = vacancies.find((x) => x.id === vacancyId)!;
  const t = c.profile;
  return {
    id, candidate_id: candidateId, candidate_name: c.full_name,
    vacancy_id: vacancyId, vacancy_title: v.title,
    stage_id: stageId, status: "active", source: "hh",
    applied_at: daysAgo(10), stage_entered_at: daysAgo(3),
    sla_due_at: inHours(20), criteria_met: 3, criteria_total: 6,
    archive_segment: null, rejection_reason_id: null, is_private: false,
    expected_salary: t?.expected_salary ?? null,
    subtitle: t ? [t.specialization, t.skills.slice(0, 2).join(", ")].filter(Boolean).join(" · ") : v.title,
    ...opts,
  };
};

export const applications: Application[] = [
  // Backend-разработчик — основная витрина
  app("a1", "k1", "v1", "s5", {
    applied_at: daysAgo(11), stage_entered_at: daysAgo(2), sla_due_at: inHours(4),
    criteria_met: 5, criteria_total: 6,
  }),
  app("a2", "k2", "v1", "s3", {
    applied_at: daysAgo(6), stage_entered_at: daysAgo(5), sla_due_at: hoursAgo(50),
    criteria_met: 4, criteria_total: 6,
  }),
  app("a4", "k10", "v1", "s2", { applied_at: daysAgo(4), stage_entered_at: daysAgo(2), sla_due_at: inHours(12), criteria_met: 2, criteria_total: 6 }),
  app("a5", "k14", "v1", "s2", { applied_at: daysAgo(3), stage_entered_at: daysAgo(2), sla_due_at: inHours(30), criteria_met: 4, criteria_total: 6 }),
  app("a6", "k16", "v1", "s2", { applied_at: daysAgo(2), stage_entered_at: daysAgo(1), sla_due_at: inHours(6), criteria_met: 3, criteria_total: 6 }),
  app("a7", "k11", "v1", "s4", { applied_at: daysAgo(14), stage_entered_at: daysAgo(4), sla_due_at: inHours(52), criteria_met: 5, criteria_total: 6 }),

  // Менеджер по продажам
  app("a11", "k6", "v2", "s6", { applied_at: daysAgo(21), stage_entered_at: daysAgo(3), sla_due_at: inHours(18), criteria_met: 4, criteria_total: 5 }),
  app("a12", "k8", "v2", "s5", { applied_at: daysAgo(16), stage_entered_at: daysAgo(2), sla_due_at: inHours(40), criteria_met: 4, criteria_total: 5 }),
  app("a13", "k4", "v2", "s2", { applied_at: daysAgo(5), stage_entered_at: daysAgo(3), sla_due_at: hoursAgo(20), criteria_met: 3, criteria_total: 5 }),

  // Аналитик данных
  app("a14", "k7", "v3", "s4", {
    applied_at: daysAgo(9), stage_entered_at: daysAgo(2), sla_due_at: inHours(30),
    criteria_met: 3, criteria_total: 4,
  }),
  app("a15", "k13", "v3", "s3", { applied_at: daysAgo(7), stage_entered_at: daysAgo(4), sla_due_at: hoursAgo(28), criteria_met: 3, criteria_total: 4 }),

  // Поддержка
  app("a17", "k9", "v4", "s3", { applied_at: daysAgo(6), stage_entered_at: daysAgo(2), sla_due_at: inHours(22), criteria_met: 3, criteria_total: 5 }),
  app("a18", "k5", "v4", "s2", { applied_at: daysAgo(4), stage_entered_at: daysAgo(2), sla_due_at: inHours(16), criteria_met: 2, criteria_total: 5 }),
  app("a19", "k15", "v4", "s1", { applied_at: hoursAgo(31), stage_entered_at: hoursAgo(31), sla_due_at: hoursAgo(7), criteria_met: 1, criteria_total: 5 }),
];

// ---------------------------------------------------------------------------
// Архив. Ради него всё и затевалось: «база, чтобы в любой момент позвонить».
// Эти люди уже проходили наш отбор — по ним есть данные, а не только резюме.
// ---------------------------------------------------------------------------
export const archivedApplications: Application[] = [
  {
    id: "arch1", candidate_id: "k3", candidate_name: "Анна Лебедева",
    vacancy_id: "v1", vacancy_title: "Backend-разработчик",
    stage_id: "s5", status: "rejected", source: "hh",
    applied_at: daysAgo(210), stage_entered_at: daysAgo(200), sla_due_at: null,
    criteria_met: 6, criteria_total: 6,
    archive_segment: "not_now", rejection_reason_id: "r1", is_private: false,
    expected_salary: 300000, subtitle: "Разработка · Python, PostgreSQL",
  },
  {
    id: "arch2", candidate_id: "k14", candidate_name: "Татьяна Ремизова",
    vacancy_id: "v1", vacancy_title: "Backend-разработчик",
    stage_id: "s3", status: "rejected", source: "hh",
    applied_at: daysAgo(430), stage_entered_at: daysAgo(420), sla_due_at: null,
    criteria_met: 4, criteria_total: 6,
    archive_segment: "not_now", rejection_reason_id: "r2", is_private: false,
    expected_salary: 210000, subtitle: "Разработка · Python, PostgreSQL",
  },
  {
    id: "arch3", candidate_id: "k11", candidate_name: "Владимир Кутепов",
    vacancy_id: "v1", vacancy_title: "Backend-разработчик",
    stage_id: "s4", status: "rejected", source: "direct",
    applied_at: daysAgo(150), stage_entered_at: daysAgo(140), sla_due_at: null,
    criteria_met: 5, criteria_total: 6,
    archive_segment: "not_now", rejection_reason_id: "r1", is_private: false,
    expected_salary: 290000, subtitle: "Разработка · Python, PostgreSQL",
  },
  {
    id: "arch4", candidate_id: "k16", candidate_name: "Алиса Горелова",
    vacancy_id: "v1", vacancy_title: "Backend-разработчик",
    stage_id: "s2", status: "rejected", source: "avito",
    applied_at: daysAgo(320), stage_entered_at: daysAgo(310), sla_due_at: null,
    criteria_met: 2, criteria_total: 6,
    archive_segment: "not_ready", rejection_reason_id: "r6", is_private: false,
    expected_salary: 180000, subtitle: "Разработка · Python, SQL",
  },
  {
    id: "arch6", candidate_id: "k17", candidate_name: "Максим Дорохов",
    vacancy_id: "v1", vacancy_title: "Backend-разработчик",
    stage_id: "s6", status: "rejected", source: "hh",
    applied_at: daysAgo(95), stage_entered_at: daysAgo(88), sla_due_at: null,
    criteria_met: 5, criteria_total: 6,
    archive_segment: "not_now", rejection_reason_id: "r1", is_private: false,
    expected_salary: 245000, subtitle: "Разработка · Python, PostgreSQL",
  },
  {
    id: "arch7", candidate_id: "k18", candidate_name: "Полина Ветрова",
    vacancy_id: "v1", vacancy_title: "Backend-разработчик",
    stage_id: "s4", status: "rejected", source: "telegram",
    applied_at: daysAgo(260), stage_entered_at: daysAgo(250), sla_due_at: null,
    criteria_met: 3, criteria_total: 6,
    archive_segment: "not_ready", rejection_reason_id: "r7", is_private: false,
    expected_salary: 215000, subtitle: "Разработка · Python, SQL",
  },
  {
    id: "arch5", candidate_id: "k13", candidate_name: "Егор Мальцев",
    vacancy_id: "v3", vacancy_title: "Аналитик данных",
    stage_id: "s3", status: "rejected", source: "telegram",
    applied_at: daysAgo(180), stage_entered_at: daysAgo(175), sla_due_at: null,
    criteria_met: 2, criteria_total: 4,
    archive_segment: "not_our_profile", rejection_reason_id: "r4", is_private: false,
    expected_salary: 195000, subtitle: "Аналитика · SQL, Tableau",
  },
];

// ---------------------------------------------------------------------------
// Результаты по критериям — с основанием, а не с баллом
// ---------------------------------------------------------------------------
export const criteriaResults: CriteriaResult[] = [
  { id: "cr1", application_id: "a1", criterion_id: "c1", criterion_name: "Коммерческий опыт на Python от 3 лет", result: "met", evidence: "«Семь лет на Python, последние три — платёжные интеграции»", source: "resume", is_ai: true, confirmed_by: "Ольга Тимофеева" },
  { id: "cr2", application_id: "a1", criterion_id: "c2", criterion_name: "Проектирование API и работа с PostgreSQL", result: "met", evidence: "На интервью разобрала схему нашего платёжного API и нашла в ней две проблемы", source: "interview", is_ai: true, confirmed_by: "Ольга Тимофеева" },
  { id: "cr3", application_id: "a1", criterion_id: "c3", criterion_name: "Готовность к дежурствам раз в месяц", result: "met", evidence: "«Дежурила в графике одна неделя в месяц» — то же, что у нас", source: "resume", is_ai: true, confirmed_by: "Ольга Тимофеева" },
  { id: "cr4", application_id: "a1", criterion_id: "c4", criterion_name: "Разбор инцидента без поиска виноватых", result: "met", evidence: "Кейс «упал приём платежей»: сначала восстановление, потом разбор без имён, в конце — что поменять в процессе. По ценности «отвечаю за результат» совпадение", source: "case", is_ai: true, confirmed_by: null },
  { id: "cr5", application_id: "a1", criterion_id: "c5", criterion_name: "Объясняет решение понятно", result: "unknown", evidence: "Практическая проверка назначена на четверг, 15:00", source: "practical_check", is_ai: false, confirmed_by: null },
  { id: "cr6", application_id: "a1", criterion_id: "c6", criterion_name: "Документы для оформления", result: "partial", evidence: "Паспорт и СНИЛС загружены, ИНН на проверке", source: "documents", is_ai: false, confirmed_by: "Ольга Тимофеева" },

  { id: "cr7", application_id: "a2", criterion_id: "c1", criterion_name: "Коммерческий опыт на Python от 3 лет", result: "met", evidence: "«Python и немного Go, четыре года»", source: "resume", is_ai: true, confirmed_by: null },
  { id: "cr8", application_id: "a2", criterion_id: "c2", criterion_name: "Проектирование API и работа с PostgreSQL", result: "met", evidence: "Показал свой сервис и объяснил, почему выбрал такую схему данных", source: "interview", is_ai: true, confirmed_by: null },
  { id: "cr9", application_id: "a2", criterion_id: "c3", criterion_name: "Готовность к дежурствам раз в месяц", result: "partial", evidence: "«Дежурить готов, но не чаще раза в два месяца»", source: "screening", is_ai: true, confirmed_by: "Ольга Тимофеева" },
  { id: "cr10", application_id: "a2", criterion_id: "c4", criterion_name: "Разбор инцидента без поиска виноватых", result: "met", evidence: "Кейс пройден, ответ спокойный и по делу", source: "case", is_ai: true, confirmed_by: null },
  { id: "cr11", application_id: "a2", criterion_id: "c5", criterion_name: "Объясняет решение понятно", result: "unknown", evidence: null, source: "practical_check", is_ai: false, confirmed_by: null },
  { id: "cr12", application_id: "a2", criterion_id: "c6", criterion_name: "Документы для оформления", result: "not_met", evidence: "Ничего не загружено, на запрос не ответил", source: "documents", is_ai: false, confirmed_by: "Ольга Тимофеева" },

  { id: "cr13", application_id: "a14", criterion_id: "c12", criterion_name: "SQL на уровне сложных выборок", result: "met", evidence: "«Строил отчётность для коммерческого блока»", source: "resume", is_ai: true, confirmed_by: null },
  { id: "cr14", application_id: "a14", criterion_id: "c13", criterion_name: "Доводит отчёт до решения, а не до графика", result: "partial", evidence: "На интервью показал дашборды, но на вопрос «какое решение по ним приняли» ответил общо", source: "interview", is_ai: true, confirmed_by: null },
  { id: "cr15", application_id: "a14", criterion_id: "c14", criterion_name: "Опыт работы удалённо", result: "met", evidence: "«Работаю удалённо» — пять лет подряд", source: "resume", is_ai: true, confirmed_by: null },
  { id: "cr16", application_id: "a14", criterion_id: "c15", criterion_name: "Документы для оформления", result: "unknown", evidence: null, source: "documents", is_ai: false, confirmed_by: null },
];

// ---------------------------------------------------------------------------
// Справочник причин отказа. Формулировки — то, что прочитает человек.
// ---------------------------------------------------------------------------
export const rejectionReasons: RejectionReason[] = [
  { id: "r1", code: "no_slot_now", name: "Нет места сейчас", segment: "not_now", candidate_wording: "Вы нам подходите, но позицию мы уже закрыли. Оставляем ваш профиль в базе и вернёмся, когда откроется похожая.", reactivate_after_months: 3 },
  { id: "r2", code: "on_hold", name: "Вакансию поставили на паузу", segment: "not_now", candidate_wording: "Набор по этой позиции приостановлен не по вашей вине. Как только он возобновится, напишем вам первыми.", reactivate_after_months: 4 },
  { id: "r3", code: "other_specialization", name: "Другое направление", segment: "not_our_profile", candidate_wording: "Ваш опыт сильный, но он про другое направление. Если у нас откроется подходящее — сообщим.", reactivate_after_months: 6 },
  { id: "r4", code: "other_format", name: "Не совпал формат или график", segment: "not_our_profile", candidate_wording: "По графику и формату работы мы не сходимся. Профиль сохраняем: условия у нас пересматриваются раз в полгода.", reactivate_after_months: 4 },
  { id: "r5", code: "salary_gap", name: "Не сошлись по деньгам", segment: "not_our_profile", candidate_wording: "По ожиданиям мы сейчас не сходимся. Как только пересмотрим вилку по этому направлению, вернёмся к вам.", reactivate_after_months: 6 },
  { id: "r6", code: "need_experience", name: "Не хватает опыта в направлении", segment: "not_ready", candidate_wording: "Не хватает практики именно в этой области. Мы собрали для вас план: что подтянуть и за какой срок. Приходите повторно.", reactivate_after_months: 6 },
  { id: "r7", code: "weak_hard_skills", name: "Слабая профессиональная часть", segment: "not_ready", candidate_wording: "На практической проверке решение получилось рабочим, но хрупким. В обратной связи — что именно доработать.", reactivate_after_months: 6 },
  { id: "r8", code: "weak_communication", name: "Не хватает работы с людьми", segment: "not_ready", candidate_wording: "Сильны в профессиональной части, но в кейсе с конфликтом ответ был резким. Это тренируется, план прилагаем.", reactivate_after_months: 6 },
  { id: "r9", code: "failed_practical", name: "Практическая проверка не показала результат", segment: "not_ready", candidate_wording: "На практической задаче не сложилось. Разбор по критериям прилагаем — он честный и по делу.", reactivate_after_months: 9 },
  { id: "r10", code: "values_mismatch", name: "Расхождение по ценностям", segment: "not_our_profile", candidate_wording: "В кейсах наши подходы к работе расходятся. Это не про уровень, а про разный взгляд на профессию.", reactivate_after_months: null },
  { id: "r11", code: "no_documents", name: "Не закрыты документы для оформления", segment: "not_ready", candidate_wording: "Не хватает документов для оформления. Как только они будут готовы — возвращайтесь, вакансию придержим.", reactivate_after_months: 3 },
  { id: "r12", code: "stop_list", name: "Стоп-лист", segment: "stop_list", candidate_wording: "К сожалению, продолжить отбор мы не сможем.", reactivate_after_months: null },
];

// ---------------------------------------------------------------------------
// Переписка. Кандидат живёт в Телеграме и на сайт не заходит.
// ---------------------------------------------------------------------------
export const conversations: Conversation[] = [
  { id: "cv1", candidate_id: "k1", candidate_name: "Ирина Ковалёва", application_id: "a1", vacancy_title: "Backend-разработчик", channel: "telegram", last_message_at: hoursAgo(2), unread_for_staff: 1, is_ai_autopilot: false },
  { id: "cv2", candidate_id: "k2", candidate_name: "Пётр Соколов", application_id: "a2", vacancy_title: "Backend-разработчик", channel: "telegram", last_message_at: hoursAgo(26), unread_for_staff: 2, is_ai_autopilot: false },
  { id: "cv3", candidate_id: "k7", candidate_name: "Никита Осипов", application_id: "a14", vacancy_title: "Аналитик данных", channel: "telegram", last_message_at: hoursAgo(9), unread_for_staff: 0, is_ai_autopilot: true },
  { id: "cv4", candidate_id: "k6", candidate_name: "Дарья Плотникова", application_id: "a11", vacancy_title: "Менеджер по продажам", channel: "telegram", last_message_at: daysAgo(3), unread_for_staff: 0, is_ai_autopilot: false },
  { id: "cv5", candidate_id: "k10", candidate_name: "Ксения Романова", application_id: "a4", vacancy_title: "Backend-разработчик", channel: "telegram", last_message_at: hoursAgo(30), unread_for_staff: 1, is_ai_autopilot: true },
];

export const messages: Message[] = [
  { id: "m1", conversation_id: "cv1", direction: "outbound", author_kind: "ai_assistant", author_name: "ассистент", body: "Ирина, здравствуйте! Ваш отклик на вакансию backend-разработчика принят. Ближайший шаг — короткий тест на 15 минут, он правда на пятнадцать минут.", sent_at: daysAgo(11) },
  { id: "m2", conversation_id: "cv1", direction: "inbound", author_kind: "candidate", author_name: null, body: "Здравствуйте! Готова, только вечером", sent_at: daysAgo(11) },
  { id: "m3", conversation_id: "cv1", direction: "outbound", author_kind: "staff", author_name: "Ольга Тимофеева", body: "Тогда выбирайте удобный слот — вечерние есть в среду и четверг", sent_at: daysAgo(10) },
  { id: "m4", conversation_id: "cv1", direction: "inbound", author_kind: "candidate", author_name: null, body: "Четверг подойдёт. И ещё вопрос: какие документы понадобятся для оформления?", sent_at: daysAgo(10) },
  { id: "m5", conversation_id: "cv1", direction: "outbound", author_kind: "ai_assistant", author_name: "ассистент", body: "Паспорт, СНИЛС и ИНН. Паспорт и СНИЛС мы уже приняли, ИНН пока на проверке — если он не подтвердится, оффер придётся задержать.", sent_at: daysAgo(3) },
  { id: "m6", conversation_id: "cv1", direction: "inbound", author_kind: "candidate", author_name: null, body: "Поняла, пришлю скан заново. Практическая проверка в четверг — что готовить?", sent_at: hoursAgo(2) },

  { id: "m7", conversation_id: "cv2", direction: "outbound", author_kind: "ai_assistant", author_name: "ассистент", body: "Пётр, здравствуйте! Отклик принят, следующий шаг — короткий тест.", sent_at: daysAgo(6) },
  { id: "m8", conversation_id: "cv2", direction: "inbound", author_kind: "candidate", author_name: null, body: "Прошёл. Когда будет ответ? У меня ещё два предложения на руках", sent_at: daysAgo(5) },
  { id: "m9", conversation_id: "cv2", direction: "inbound", author_kind: "candidate", author_name: null, body: "Добрый день, есть новости?", sent_at: hoursAgo(26) },

  { id: "m10", conversation_id: "cv3", direction: "outbound", author_kind: "ai_assistant", author_name: "ассистент", body: "Никита, здравствуйте! Ваш кейс проверен. Разбор придёт отдельно — он подробный и полезный вам самому, даже если мы не сойдёмся.", sent_at: daysAgo(2) },
  { id: "m11", conversation_id: "cv3", direction: "inbound", author_kind: "candidate", author_name: null, body: "Спасибо, редко такое встречаю. Жду", sent_at: hoursAgo(9) },

  { id: "m12", conversation_id: "cv4", direction: "outbound", author_kind: "staff", author_name: "Ольга Тимофеева", body: "Дарья, оффер отправлен. Ответ ждём до пятницы, вопросы можно задать прямо здесь.", sent_at: daysAgo(3) },

  { id: "m13", conversation_id: "cv5", direction: "outbound", author_kind: "ai_assistant", author_name: "ассистент", body: "Ксения, здравствуйте! Спасибо за отклик. Уточните, пожалуйста, есть ли у вас коммерческий опыт на Python и сколько лет?", sent_at: daysAgo(2) },
  { id: "m14", conversation_id: "cv5", direction: "inbound", author_kind: "candidate", author_name: null, body: "Два года, из них год в продакшене. Остальное — учебные проекты", sent_at: hoursAgo(30) },
];

// ---------------------------------------------------------------------------
// Созвоны и задания
// ---------------------------------------------------------------------------
export const interviews: Interview[] = [
  {
    id: "i1", application_id: "a1", kind: "interview", status: "done",
    scheduled_at: daysAgo(4), work_format: "remote", recording_consent: true,
    ai_summary: "Сорок минут. Семь лет на Python, последние три — платёжные интеграции в текущей компании. Уходит из-за того, что команду сократили вдвое, а объём остался. К нам идёт за предсказуемой нагрузкой, не за деньгами: назвала 250 000 и сразу добавила, что готова обсуждать. Просит не ставить дежурства в первый месяц.",
    ai_conclusions: "Критерий «коммерческий опыт на Python» закрыт уверенно. «Проектирование API» тоже: разобрала нашу схему и нашла в ней две проблемы. Не проверено: как объясняет решение — покажет практическая проверка. Риск: уходит от перегрузки, поэтому обещать дежурства с первого месяца не стоит.",
  },
  {
    id: "i2", application_id: "a1", kind: "practical_check", status: "scheduled",
    scheduled_at: dayAt(2, 15), work_format: "onsite", recording_consent: true,
    ai_summary: null, ai_conclusions: null,
  },
  {
    id: "i3", application_id: "a2", kind: "interview", status: "done",
    scheduled_at: daysAgo(5), work_format: "remote", recording_consent: false,
    ai_summary: "Тридцать минут, запись не велась — кандидат не дал согласия. Заметки внесены вручную: четыре года на Python, свой сервис показал и объяснил схему данных. По дежурствам готов не чаще раза в два месяца.",
    ai_conclusions: "Расхождение по дежурствам: у нас неделя в месяц. Обсудить с руководителем, готовы ли смягчить график.",
  },
  {
    id: "i4", application_id: "a14", kind: "interview", status: "done",
    scheduled_at: daysAgo(3), work_format: "remote", recording_consent: true,
    ai_summary: "Пять лет в аналитике, работает удалённо. Показал свои дашборды — сделаны аккуратно. На вопрос «какое решение приняли по этому отчёту» ответил общо: «руководство посмотрело».",
    ai_conclusions: "SQL закрыт. Критерий «доводит отчёт до решения» закрыт частично: человек строит витрины, но не доводит до действия. Рекомендую кейс на разбор проблемы до практической проверки.",
  },
  {
    id: "i5", application_id: "a12", kind: "practical_check", status: "done",
    scheduled_at: daysAgo(2), work_format: "onsite", recording_consent: true,
    ai_summary: null, ai_conclusions: null,
  },
];

export const assessments: Assessment[] = [
  {
    id: "as1", application_id: "a1", template_name: "Кейс: разбор инцидента",
    kind: "case", status: "reviewed", assigned_at: daysAgo(8), submitted_at: daysAgo(7),
    verdict: "strong",
    feedback_internal: "Совпадение по ценностям «отвечаю за результат» и «честная обратная связь». Порядок действий правильный: сначала восстановление сервиса, потом разбор, и только потом — что поменять в процессе. Отдельно ценно, что в разборе нет имён: человек разбирает систему, а не ищет виноватого.",
    feedback_for_candidate: "Вы развели три вещи, которые обычно смешивают: тушение пожара, разбор причины и изменение процесса. Это сильная сторона вашего ответа. Что можно усилить: в разборе не хватило вопроса «как мы узнаем, что это не повторится» — без метрики изменение процесса остаётся обещанием.",
  },
  {
    id: "as2", application_id: "a1", template_name: "Короткий тест на 15 минут",
    kind: "test", status: "reviewed", assigned_at: daysAgo(11), submitted_at: daysAgo(11),
    verdict: "ok", feedback_internal: "Проходной. Ответ про блокировки в базе — по делу.",
    feedback_for_candidate: "Тест пройден. Ваш ответ про долгие транзакции показывает главное: вы думаете о том, что происходит под нагрузкой, а не только о том, что код работает.",
  },
  {
    id: "as3", application_id: "a14", template_name: "Кейс: отчёт, которым не пользуются",
    kind: "case", status: "assigned", assigned_at: hoursAgo(20), submitted_at: null,
    verdict: null, feedback_internal: null, feedback_for_candidate: null,
  },
];

// ---------------------------------------------------------------------------
// Практическая проверка (фишка 51). Человек делает настоящую задачу,
// а не рассказывает о себе.
// ---------------------------------------------------------------------------
export const practicalChecks: PracticalCheck[] = [
  {
    id: "pc1", interview_id: "i2", application_id: "a1", candidate_name: "Ирина Ковалёва",
    task: "Разобрать реальный инцидент по логам и предложить, что поменять",
    context: "Приём платежей падал 40 минут месяц назад",
    audience: "два разработчика команды",
    reviewer_name: "Анна Жукова", verdict: null, comment: null,
    scheduled_at: dayAt(2, 15), scores: [],
  },
  {
    id: "pc2", interview_id: "i5", application_id: "a12", candidate_name: "Светлана Ермакова",
    task: "Звонок клиенту, который две недели не отвечает на письма",
    context: "Сделка на 600 тысяч зависла на этапе согласования договора",
    audience: "руководитель отдела продаж, разговор записан",
    reviewer_name: "Сергей Носов", verdict: "strong",
    comment: "Не давила и не оправдывалась. Нашла настоящую причину задержки за четыре минуты: у клиента сменился юрист. Предложила конкретный следующий шаг с датой.",
    scheduled_at: daysAgo(2),
    scores: [
      { id: "ps1", aspect: "Понял задачу и уточнил непонятное", result: "met", comment: "Перед звонком уточнила, что уже обсуждали", reviewer_name: "Сергей Носов" },
      { id: "ps2", aspect: "Качество решения", result: "met", comment: null, reviewer_name: "Сергей Носов" },
      { id: "ps3", aspect: "Самостоятельность в работе", result: "met", comment: "Ни разу не попросила подсказку", reviewer_name: "Сергей Носов" },
      { id: "ps4", aspect: "Реакция на обратную связь", result: "met", comment: "После замечания перестроила заход со второй попытки", reviewer_name: "Сергей Носов" },
      { id: "ps5", aspect: "Объясняет понятно", result: "partial", comment: "В пересказе разговора смешала факты и свои выводы", reviewer_name: "Сергей Носов" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Документы для оформления. Какие обязательны — решает вакансия.
// ---------------------------------------------------------------------------
export const documents: CandidateDocument[] = [
  { id: "dc1", candidate_id: "k1", candidate_name: "Ирина Ковалёва", kind: "passport", state: "valid", expires_on: inDays(900).slice(0, 10) },
  { id: "dc2", candidate_id: "k1", candidate_name: "Ирина Ковалёва", kind: "snils", state: "valid", expires_on: null },
  { id: "dc3", candidate_id: "k1", candidate_name: "Ирина Ковалёва", kind: "inn", state: "pending", expires_on: null },
  { id: "dc4", candidate_id: "k2", candidate_name: "Пётр Соколов", kind: "passport", state: "missing", expires_on: null },
  { id: "dc5", candidate_id: "k2", candidate_name: "Пётр Соколов", kind: "snils", state: "missing", expires_on: null },
  { id: "dc6", candidate_id: "k6", candidate_name: "Дарья Плотникова", kind: "passport", state: "valid", expires_on: inDays(1200).slice(0, 10) },
  { id: "dc7", candidate_id: "k6", candidate_name: "Дарья Плотникова", kind: "snils", state: "valid", expires_on: null },
  { id: "dc8", candidate_id: "k6", candidate_name: "Дарья Плотникова", kind: "inn", state: "valid", expires_on: null },
  { id: "dc9", candidate_id: "k6", candidate_name: "Дарья Плотникова", kind: "background_check", state: "valid", expires_on: inDays(240).slice(0, 10) },
  // У Светланы проверка СБ просрочена — на её вакансии это блокирует оффер
  { id: "dc10", candidate_id: "k8", candidate_name: "Светлана Ермакова", kind: "background_check", state: "expired", expires_on: daysAgo(20).slice(0, 10) },
  { id: "dc11", candidate_id: "k8", candidate_name: "Светлана Ермакова", kind: "passport", state: "valid", expires_on: inDays(700).slice(0, 10) },
  { id: "dc12", candidate_id: "k8", candidate_name: "Светлана Ермакова", kind: "snils", state: "valid", expires_on: null },
  { id: "dc13", candidate_id: "k8", candidate_name: "Светлана Ермакова", kind: "inn", state: "valid", expires_on: null },
  { id: "dc14", candidate_id: "k11", candidate_name: "Владимир Кутепов", kind: "passport", state: "valid", expires_on: inDays(500).slice(0, 10) },
  { id: "dc15", candidate_id: "k11", candidate_name: "Владимир Кутепов", kind: "snils", state: "expiring", expires_on: inDays(25).slice(0, 10) },
  { id: "dc16", candidate_id: "k7", candidate_name: "Никита Осипов", kind: "passport", state: "missing", expires_on: null },
];

// ---------------------------------------------------------------------------
// Заметки и мнение команды
// ---------------------------------------------------------------------------
export const notes: Note[] = [
  { id: "n1", candidate_id: "k1", application_id: "a1", author_name: "Ольга Тимофеева", body: "Уходит от перегрузки, а не за деньгами. Дежурства в первый месяц не предлагать — спугнём.", visibility: "hiring_team", is_ai: false, created_at: daysAgo(4) },
  { id: "n2", candidate_id: "k1", application_id: "a1", author_name: "ассистент", body: "ИНН на проверке уже третий день. Если он не подтвердится, оффер придётся задержать — а вакансия горит.", visibility: "hiring_team", is_ai: true, created_at: daysAgo(3) },
  { id: "n3", candidate_id: "k2", application_id: "a2", author_name: "Ольга Тимофеева", body: "Второй раз спрашивает про сроки. У него два предложения на руках — если Елена не ответит сегодня, потеряем.", visibility: "hiring_team", is_ai: false, created_at: hoursAgo(24) },
];

export const teamOpinions: TeamOpinion[] = [
  { id: "to1", application_id: "a1", author_name: "Анна Жукова", verdict: "yes", comment: "Пересекались на конференции. Спокойная, разбирается основательно.", created_at: daysAgo(3) },
  { id: "to2", application_id: "a1", author_name: "Сергей Носов", verdict: "doubt", comment: "Не видел в работе. После практической проверки скажу точно.", created_at: daysAgo(2) },
];

// ---------------------------------------------------------------------------
// Слоты и самозапись (фишка 34)
// ---------------------------------------------------------------------------
export const slots: InterviewSlot[] = [
  { id: "sl1", owner_id: "u-dept", owner_name: "Елена Крылова", vacancy_id: "v1", kind: "interview", starts_at: dayAt(1, 15), ends_at: plusMin(dayAt(1, 15), 45), work_format: "remote", location: null, is_booked: false, booked_by_application_id: null },
  { id: "sl2", owner_id: "u-dept", owner_name: "Елена Крылова", vacancy_id: "v1", kind: "interview", starts_at: dayAt(1, 17), ends_at: plusMin(dayAt(1, 17), 45), work_format: "remote", location: null, is_booked: true, booked_by_application_id: "a2" },
  { id: "sl3", owner_id: "u-dept", owner_name: "Елена Крылова", vacancy_id: "v1", kind: "practical_check", starts_at: dayAt(2, 15), ends_at: plusMin(dayAt(2, 15), 90), work_format: "onsite", location: "Офис, переговорная «Север»", is_booked: true, booked_by_application_id: "a1" },
  { id: "sl4", owner_id: "u-dept", owner_name: "Елена Крылова", vacancy_id: "v1", kind: "interview", starts_at: dayAt(2, 18, 30), ends_at: plusMin(dayAt(2, 18, 30), 45), work_format: "remote", location: null, is_booked: false, booked_by_application_id: null },
  { id: "sl5", owner_id: "u-line", owner_name: "Сергей Носов", vacancy_id: "v2", kind: "interview", starts_at: dayAt(3, 19), ends_at: plusMin(dayAt(3, 19), 45), work_format: "remote", location: null, is_booked: false, booked_by_application_id: null },
  { id: "sl6", owner_id: "u-dept", owner_name: "Елена Крылова", vacancy_id: "v1", kind: "interview", starts_at: dayAt(3, 11), ends_at: plusMin(dayAt(3, 11), 60), work_format: "onsite", location: "Офис, переговорная «Север»", is_booked: false, booked_by_application_id: null },
  { id: "sl7", owner_id: "u-line", owner_name: "Сергей Носов", vacancy_id: null, kind: "interview", starts_at: dayAt(4, 12), ends_at: plusMin(dayAt(4, 12), 60), work_format: "remote", location: null, is_booked: false, booked_by_application_id: null },
  { id: "sl8", owner_id: "u-dept", owner_name: "Елена Крылова", vacancy_id: "v3", kind: "interview", starts_at: dayAt(4, 16), ends_at: plusMin(dayAt(4, 16), 45), work_format: "remote", location: null, is_booked: false, booked_by_application_id: null },
];

// ---------------------------------------------------------------------------
// Офферы (фишка 39)
// ---------------------------------------------------------------------------
export const offerTemplate = `# Предложение о работе

{{candidate_name}}, здравствуйте.

Мы предлагаем вам позицию **{{position}}** в подразделении «{{department}}».

- Зарплата на руки: **{{salary}}**
- Формат: {{work_format}}, {{weekly_hours}} часов в неделю
- Дата выхода: {{start_date}}
- Испытательный срок: {{probation}} мес.

Что реально будет в первый месяц:
{{first_month}}

Ответ ждём до {{respond_by}}. Ответить можно прямо в этом чате.`;

export const offers: Offer[] = [
  {
    id: "of1", application_id: "a11", candidate_name: "Дарья Плотникова",
    vacancy_title: "Менеджер по продажам", status: "sent",
    salary: 158000, is_net: true, weekly_hours: 40,
    start_date: inDays(6).slice(0, 10), probation_months: 3, body_md: null,
    created_by_name: "Ольга Тимофеева", approved_by_name: "Юрий Ветров",
    approved_at: daysAgo(4), sent_at: daysAgo(3),
    respond_by: inDays(2).slice(0, 10), responded_at: null,
  },
  {
    id: "of2", application_id: "a12", candidate_name: "Светлана Ермакова",
    vacancy_title: "Менеджер по продажам", status: "pending_approval",
    salary: 160000, is_net: true, weekly_hours: 40,
    start_date: inDays(10).slice(0, 10), probation_months: 3, body_md: null,
    created_by_name: "Ольга Тимофеева", approved_by_name: null,
    approved_at: null, sent_at: null,
    respond_by: inDays(7).slice(0, 10), responded_at: null,
  },
];

// ---------------------------------------------------------------------------
// Согласование и версии вакансии (фишки 26, 27)
// ---------------------------------------------------------------------------
export const vacancyApprovals: VacancyApproval[] = [
  { id: "ap1", vacancy_id: "v1", approver_name: "Юрий Ветров", decision: "approved", comment: "Вилку утверждаю. Двоих берём только если первый выйдет и приживётся.", decided_at: daysAgo(27), created_at: daysAgo(28) },
  { id: "ap2", vacancy_id: "v5", approver_name: "Юрий Ветров", decision: "pending", comment: null, decided_at: null, created_at: daysAgo(3) },
];

export const vacancyVersions: VacancyVersion[] = [
  {
    id: "vv2", vacancy_id: "v1", version_no: 2,
    changed_by_name: "Елена Крылова", change_note: "После первых интервью стало ясно, что на такие деньги опытных не найти",
    created_at: daysAgo(12),
    changes: [
      { field: "Уровень", from: "опытный", to: "самостоятельный" },
      { field: "Требования", from: "Опыт от 5 лет", to: "Опыт от 3 лет" },
      { field: "Вилка", from: "до 230 000 ₽", to: "до 260 000 ₽" },
    ],
  },
  {
    id: "vv1", vacancy_id: "v1", version_no: 1,
    changed_by_name: "Ольга Тимофеева", change_note: "Создана из заявки на подбор",
    created_at: daysAgo(28), changes: [],
  },
];

// ---------------------------------------------------------------------------
// Ценности компании. Топливо фишки 24 — самого сильного отличия.
// ---------------------------------------------------------------------------
export const companyValues: CompanyValue[] = [
  { id: "cv-1", code: "own_the_result", name: "Отвечаю за результат", description: "Результат — зона ответственности того, кто взял задачу, а не обстоятельств.", good_example: "Задача встала из-за смежников — человек идёт договариваться, а не пишет «жду ответа» третью неделю.", bad_example: "Я свою часть сделал, дальше это не ко мне.", is_active: true },
  { id: "cv-2", code: "honest_feedback", name: "Честная обратная связь", description: "Говорим прямо и по делу, но так, чтобы после разговора хотелось работать дальше.", good_example: "Коллеге называют конкретную проблему в работе и предлагают, что поменять. На разборе инцидента говорят о системе, а не об именах.", bad_example: "Говорят «всё нормально», чтобы избежать неловкости, а недовольство копят.", is_active: true },
  { id: "cv-3", code: "client_first", name: "Клиент важнее удобства", description: "Решение принимается из интересов клиента, а не из того, как нам проще.", good_example: "Клиенту неудобна наша схема — предлагают обходной путь сегодня и меняют схему потом.", bad_example: "У нас так устроено, пусть подстраивается.", is_active: true },
  { id: "cv-4", code: "simple_first", name: "Сначала простое решение", description: "Сложное решение нужно защитить, простое — нет.", good_example: "Берут готовый инструмент вместо своего, если он закрывает задачу на год вперёд.", bad_example: "Пишут своё, потому что «так интереснее».", is_active: true },
  { id: "cv-5", code: "keep_learning", name: "Учусь сам", description: "Специалист, который перестал учиться, через два года становится дорогим и бесполезным.", good_example: "После неудачи сам просит разбор и меняет подход.", bad_example: "Я работаю пятнадцать лет, меня учить не надо.", is_active: true },
];

// ---------------------------------------------------------------------------
// Согласия (фишки 61, 62)
// ---------------------------------------------------------------------------
export const consents: Consent[] = [
  { id: "cs1", candidate_id: "k1", candidate_name: "Ирина Ковалёва", kind: "pd_processing", granted_at: daysAgo(11), revoked_at: null, text_version: "v1", source: "telegram" },
  { id: "cs2", candidate_id: "k1", candidate_name: "Ирина Ковалёва", kind: "call_recording", granted_at: daysAgo(5), revoked_at: null, text_version: "v1", source: "telegram" },
  { id: "cs3", candidate_id: "k2", candidate_name: "Пётр Соколов", kind: "pd_processing", granted_at: daysAgo(6), revoked_at: null, text_version: "v1", source: "hh" },
  { id: "cs4", candidate_id: "k2", candidate_name: "Пётр Соколов", kind: "call_recording", granted_at: null, revoked_at: null, text_version: "v1", source: "telegram" },
  { id: "cs5", candidate_id: "k7", candidate_name: "Никита Осипов", kind: "pd_processing", granted_at: daysAgo(9), revoked_at: null, text_version: "v1", source: "telegram" },
  { id: "cs6", candidate_id: "k3", candidate_name: "Анна Лебедева", kind: "pd_processing", granted_at: daysAgo(210), revoked_at: null, text_version: "v1", source: "hh" },
  { id: "cs7", candidate_id: "k3", candidate_name: "Анна Лебедева", kind: "marketing", granted_at: daysAgo(210), revoked_at: daysAgo(40), text_version: "v1", source: "telegram" },
  { id: "cs8", candidate_id: "k6", candidate_name: "Дарья Плотникова", kind: "pd_processing", granted_at: daysAgo(21), revoked_at: null, text_version: "v1", source: "hh" },
];

// ---------------------------------------------------------------------------
// Срочные замены (фишка 55) и рекомендации (фишка 60)
// ---------------------------------------------------------------------------
export const urgentNeeds: UrgentNeed[] = [
  { id: "un1", role: "Специалист поддержки, ночная смена", department_name: "Поддержка", needed_on: inDays(1).slice(0, 10), hours: 12, rate: 900, status: "open", filled_by_name: null },
  { id: "un2", role: "Менеджер по продажам на подхват сделок", department_name: "Продажи", needed_on: inDays(3).slice(0, 10), hours: 20, rate: 1400, status: "open", filled_by_name: null },
  { id: "un3", role: "Разработчик на дежурство", department_name: "Разработка", needed_on: daysAgo(2).slice(0, 10), hours: 16, rate: 2500, status: "filled", filled_by_name: "Анна Лебедева" },
];

export const referrals: Referral[] = [
  { id: "rf1", referrer_name: "Анна Жукова", referred_name: "Татьяна Ремизова", vacancy_title: "Backend-разработчик", status: "in_progress", bonus_amount: 60000, created_at: daysAgo(4) },
  { id: "rf2", referrer_name: "Анна Жукова", referred_name: "Ксения Романова", vacancy_title: "Backend-разработчик", status: "submitted", bonus_amount: 60000, created_at: daysAgo(1) },
  { id: "rf3", referrer_name: "Сергей Носов", referred_name: "Егор Мальцев", vacancy_title: "Аналитик данных", status: "rejected", bonus_amount: 0, created_at: daysAgo(40) },
];

// ---------------------------------------------------------------------------
// Заявки на подбор
// ---------------------------------------------------------------------------
export const requisitions: Requisition[] = [
  {
    id: "rq1", requested_by_name: "Елена Крылова", department_name: "Разработка",
    status: "approved",
    q_who_needed: "Второй backend в платёжную команду: Анна одна тянет интеграции и дежурства, это не выдержит",
    q_tasks: "Новые интеграции и поддержка существующих. Дежурства со второго месяца",
    q_must_have: "Коммерческий Python от трёх лет. Курсы и пет-проекты не считаем — у нас деньги клиентов",
    q_deadline: "К концу месяца, дальше начинается сезон и релизы встанут",
    q_budget: "До 260 тысяч на руки, выше — к директору",
    created_at: daysAgo(28),
  },
  {
    id: "rq2", requested_by_name: "Юрий Ветров", department_name: "Бухгалтерия и финансы",
    status: "pending_approval",
    q_who_needed: "Бухгалтер на первичку: текущая уходит в конце квартала",
    q_tasks: "Первичка, сверки с поставщиками, помощь в закрытии месяца",
    q_must_have: "Опыт с 1С и реальными сверками, а не только проводки по учебнику",
    q_deadline: "К концу квартала, чтобы успели передать дела",
    q_budget: "95–120 тысяч",
    created_at: daysAgo(3),
  },
];

// ===========================================================================
// ОБЪЁМ
// ===========================================================================
// Всё выше — витрина: люди, на которых видно смысл каждого экрана.
// Но на восемнадцати карточках нельзя проверить главное — выдержит ли
// интерфейс настоящий поток. Ниже генератор, который добавляет базу
// нормального размера: людей из разных направлений, с телефонами,
// с откликами по всем этапам и с архивом прошлых лет.
//
// Генератор детерминированный: одно и то же при каждой загрузке, иначе
// демонстрацию нельзя показать дважды одинаково.
// ===========================================================================

/** Линейный конгруэнтный генератор: нужна повторяемость, а не криптостойкость. */
function makeRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}
const rnd = makeRandom(20260901);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
const pickN = <T,>(arr: readonly T[], n: number): T[] => {
  const copy = [...arr];
  const out: T[] = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rnd() * copy.length), 1)[0]);
  return out;
};

const SURNAMES_M = ["Иванов","Петров","Смирнов","Кузнецов","Соколов","Попов","Лебедев","Козлов","Новиков","Морозов","Волков","Алексеев","Егоров","Никитин","Степанов","Орлов","Андреев","Макаров","Захаров","Беляев","Тарасов","Белов","Комаров","Киселёв","Богданов","Фомин","Давыдов","Мельников","Щербаков","Блинов","Колесников","Карпов","Афанасьев","Власов","Маслов","Исаков","Тихонов","Аксёнов","Гаврилов","Родионов"];
const SURNAMES_F = ["Иванова","Петрова","Смирнова","Кузнецова","Соколова","Попова","Лебедева","Козлова","Новикова","Морозова","Волкова","Алексеева","Егорова","Никитина","Степанова","Орлова","Андреева","Макарова","Захарова","Беляева","Тарасова","Белова","Комарова","Киселёва","Богданова","Фомина","Давыдова","Мельникова","Щербакова","Блинова","Колесникова","Карпова","Афанасьева","Власова","Маслова","Исакова","Тихонова","Аксёнова","Гаврилова","Родионова"];
const NAMES_M = ["Александр","Дмитрий","Максим","Сергей","Андрей","Алексей","Артём","Илья","Кирилл","Михаил","Никита","Матвей","Роман","Егор","Арсений","Иван","Денис","Евгений","Даниил","Тимур","Павел","Антон","Владислав","Глеб","Олег"];
const NAMES_F = ["Анна","Мария","Елена","Дарья","Алина","Ирина","Екатерина","Ольга","Наталья","Юлия","Ксения","Виктория","Полина","Софья","Татьяна","Валерия","Марина","Светлана","Вероника","Кристина","Любовь","Надежда","Алиса","Диана","Инна"];
const PATRONYM_M = ["Александрович","Дмитриевич","Сергеевич","Андреевич","Алексеевич","Иванович","Павлович","Олегович"];
const PATRONYM_F = ["Александровна","Дмитриевна","Сергеевна","Андреевна","Алексеевна","Ивановна","Павловна","Олеговна"];

const BULK_CITIES = ["Москва","Москва","Москва","Санкт-Петербург","Екатеринбург","Новосибирск","Казань","Нижний Новгород","Воронеж","Краснодар","Ростов-на-Дону","Самара","Пермь","Челябинск","Тюмень"];

const SPEC_SKILLS: Record<string, string[]> = {
  "Разработка": ["Python","PostgreSQL","Docker","Go","JavaScript","TypeScript","React","Kubernetes","SQL","Redis"],
  "Тестирование": ["Selenium","автотесты","Python","SQL","Postman","нагрузочное"],
  "Аналитика": ["SQL","Power BI","Tableau","Python","Excel","дашборды"],
  "Продажи": ["B2B","переговоры","amoCRM","холодные звонки","презентации","B2C"],
  "Поддержка": ["CRM","английский","эскалации","чаты","телефония"],
  "Маркетинг": ["SMM","директ","контент","аналитика трафика","email"],
  "Бухгалтерия": ["1С","первичка","сверки","НДС","зарплата"],
  "Логистика": ["склад","закупки","1С","маршрутизация"],
  "Дизайн": ["Figma","UX","прототипы","иллюстрация"],
};
const SPECS = Object.keys(SPEC_SKILLS);
const GRADES_POOL: GradeLevel[] = ["intern","junior","junior","middle","middle","middle","senior","senior","lead"];
const EMPLOYERS = ["Финтех-компания","Ритейл-сеть","Промышленный холдинг","ИТ-интегратор","Банк","Логистический оператор","Медиа-группа","Страховая компания"];

/** Телефон должен быть настоящим на вид: по нему в интерфейсе звонят. */
function genPhone(i: number) {
  const code = [900,903,905,906,909,910,915,916,917,920,925,926,929,999][i % 14];
  const a = 100 + ((i * 37) % 900);
  const b = 10 + ((i * 53) % 90);
  const c = 10 + ((i * 71) % 90);
  return `+7 ${code} ${a}-${b}-${c}`;
}

const bulkCandidates: Candidate[] = [];
for (let i = 0; i < 148; i += 1) {
  const female = rnd() > 0.5;
  const first = female ? pick(NAMES_F) : pick(NAMES_M);
  const last = female ? pick(SURNAMES_F) : pick(SURNAMES_M);
  const patronymic = female ? pick(PATRONYM_F) : pick(PATRONYM_M);
  const spec = pick(SPECS);
  const grade = pick(GRADES_POOL);
  const gradeIdx = ["intern","junior","middle","senior","lead"].indexOf(grade);
  const years = [0, 2, 5, 9, 13][gradeIdx] + Math.floor(rnd() * 3);
  const base = [60, 110, 190, 260, 320][gradeIdx] * 1000;
  const id = `g${i + 1}`;

  bulkCandidates.push({
    id,
    full_name: `${last} ${first} ${patronymic}`,
    phones: [genPhone(i)],
    emails: [`${id}@example.com`],
    city: pick(BULK_CITIES),
    telegram_username: `@user${i + 1}`,
    primary_source: pick(["hh","hh","hh","avito","telegram","referral","direct","superjob"]),
    is_blacklisted: rnd() < 0.02,
    blacklist_reason: null,
    hide_from_current_employer: rnd() < 0.15,
    current_employer: rnd() < 0.6 ? pick(EMPLOYERS) : null,
    consent_pd_granted: rnd() > 0.05,
    last_activity_at: daysAgo(Math.floor(rnd() * 120)),
    resume_text: null,
    profile: {
      candidate_id: id,
      specialization: spec,
      skills: pickN(SPEC_SKILLS[spec], 2 + Math.floor(rnd() * 3)),
      grades: [grade],
      years_in_specialty: Math.max(1, years - Math.floor(rnd() * 2)),
      total_experience_years: years,
      available_from: null,
      schedule_note: null,
      ready_for_urgent_start: rnd() < 0.18,
      work_formats:
        rnd() < 0.4 ? ["remote","hybrid"] : rnd() < 0.7 ? ["onsite","hybrid"] : ["onsite","hybrid","remote"],
      expected_salary: base + Math.floor(rnd() * 60) * 1000,
    },
  });
}
candidates.push(...bulkCandidates);

// Отклики. Форма воронки настоящая: широкий вход и резкое сужение — именно
// её и надо уметь смотреть, когда людей сотни, а не десятки.
const STAGE_WEIGHTS: [string, number][] = [
  ["s1", 34], ["s2", 22], ["s3", 12], ["s4", 7], ["s5", 4], ["s6", 2], ["s7", 1],
];
const stagePool: string[] = [];
STAGE_WEIGHTS.forEach(([s, w]) => { for (let i = 0; i < w; i += 1) stagePool.push(s); });

const VACANCY_SPEC: Record<string, string> = {
  v1: "Разработка", v2: "Продажи", v3: "Аналитика", v4: "Поддержка", v5: "Бухгалтерия",
};

let bulkAppNo = 0;
bulkCandidates.forEach((c) => {
  const spec = c.profile!.specialization!;
  const matching = Object.entries(VACANCY_SPEC).filter(([, s]) => s === spec).map(([v]) => v);
  if (!matching.length) return;

  const roll = rnd();
  // Часть базы — только архив: люди, которые приходили раньше и никуда
  // не двинулись. Ради них и существует «подбор из базы».
  const isArchive = roll < 0.42;
  if (!isArchive && roll < 0.55) return; // остальные просто лежат в базе

  const vacancyId = pick(matching);
  const v = vacancies.find((x) => x.id === vacancyId)!;
  const stageId = isArchive ? pick(["s2","s3","s4","s5"]) : pick(stagePool);
  const stage = stages.find((s) => s.id === stageId)!;
  const total = criteria.filter((k) => k.vacancy_id === vacancyId).length || 5;
  const met = Math.min(total, Math.floor(rnd() * (stage.order_index + 1)));
  bulkAppNo += 1;

  const appliedDays = isArchive ? 90 + Math.floor(rnd() * 550) : Math.floor(rnd() * 25);
  const enteredDays = Math.max(0, appliedDays - Math.floor(rnd() * 6));
  const slaHours = stage.sla_hours ?? 48;
  const overdue = rnd() < 0.22;

  applications.push({
    id: `ga${bulkAppNo}`,
    candidate_id: c.id,
    candidate_name: c.full_name,
    vacancy_id: vacancyId,
    vacancy_title: v.title,
    stage_id: stageId,
    status: isArchive ? "rejected" : c.is_blacklisted ? "on_hold" : "active",
    source: c.primary_source,
    applied_at: daysAgo(appliedDays),
    stage_entered_at: daysAgo(enteredDays),
    sla_due_at: isArchive
      ? null
      : overdue
        ? hoursAgo(Math.floor(rnd() * 70))
        : inHours(Math.floor(rnd() * slaHours) + 1),
    criteria_met: met,
    criteria_total: total,
    archive_segment: isArchive
      ? pick(["not_now","not_now","not_our_profile","not_ready"] as const)
      : null,
    rejection_reason_id: isArchive ? pick(["r1","r2","r3","r5","r6","r7"]) : null,
    is_private: c.hide_from_current_employer,
    expected_salary: c.profile!.expected_salary,
    subtitle: `${spec} · ${c.profile!.skills.slice(0, 2).join(", ")}`,
  });
});

// Документы: у части людей в работе что-то не закрыто — это и есть та
// самая работа, которую видно на экране «Документы».
let bulkDocNo = 0;
applications
  .filter((a) => a.status === "active" && a.id.startsWith("ga"))
  .forEach((a) => {
    const v = vacancies.find((x) => x.id === a.vacancy_id)!;
    v.required_documents.forEach((kind) => {
      const r = rnd();
      bulkDocNo += 1;
      documents.push({
        id: `gd${bulkDocNo}`,
        candidate_id: a.candidate_id,
        candidate_name: a.candidate_name,
        kind,
        state: r < 0.45 ? "valid" : r < 0.6 ? "pending" : r < 0.7 ? "expiring" : r < 0.76 ? "expired" : "missing",
        expires_on: r < 0.7 ? inDays(30 + Math.floor(rnd() * 700)).slice(0, 10) : null,
      });
    });
  });

// Переписка: у части активных откликов есть непрочитанные сообщения.
// Без них экран «Мой день» был бы пустым и врал бы про нагрузку.
let bulkConvNo = 0;
applications
  .filter((a) => a.status === "active" && a.id.startsWith("ga"))
  .forEach((a) => {
    if (rnd() > 0.35) return;
    bulkConvNo += 1;
    const cid = `gcv${bulkConvNo}`;
    const unread = rnd() < 0.5 ? 1 : rnd() < 0.8 ? 2 : 3;
    conversations.push({
      id: cid,
      candidate_id: a.candidate_id,
      candidate_name: a.candidate_name,
      application_id: a.id,
      vacancy_title: a.vacancy_title,
      channel: "telegram",
      last_message_at: hoursAgo(Math.floor(rnd() * 90)),
      unread_for_staff: unread,
      is_ai_autopilot: rnd() < 0.3,
    });
    messages.push({
      id: `gm${bulkConvNo}a`,
      conversation_id: cid,
      direction: "outbound",
      author_kind: "ai_assistant",
      author_name: "ассистент",
      body: "Здравствуйте! Ваш отклик принят. Ближайший шаг — короткий тест на 15 минут.",
      sent_at: daysAgo(Math.floor(rnd() * 8) + 1),
    });
    messages.push({
      id: `gm${bulkConvNo}b`,
      conversation_id: cid,
      direction: "inbound",
      author_kind: "candidate",
      author_name: null,
      body: pick([
        "Здравствуйте! Готов, только вечером",
        "Добрый день, есть новости по моему отклику?",
        "Спасибо, прошёл тест. Что дальше?",
        "Подскажите, формат работы гибридный или полностью удалённый?",
        "Готов приступить через две недели, если подойду",
      ]),
      sent_at: hoursAgo(Math.floor(rnd() * 90)),
    });
  });
