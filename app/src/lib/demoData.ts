/**
 * Данные демо-режима.
 *
 * Это не «рыба» ради заполнения: набор собран так, чтобы на экранах было
 * видно то, ради чего платформа делается — обрыв воронки между откликом
 * и скринингом, молчащий руководитель на эскалации, критерии с основаниями,
 * истекающая медкнижка, кандидат из архива с причиной прошлого отказа.
 *
 * Даты считаются от текущего момента, поэтому сроки на экранах всегда живые.
 */
import type {
  Application,
  Assessment,
  Candidate,
  CandidateDocument,
  Conversation,
  CriteriaResult,
  Department,
  Interview,
  Message,
  Note,
  PipelineStage,
  Profile,
  RejectionReason,
  Requisition,
  TeamOpinion,
  Vacancy,
  VacancyCriterion,
} from "./types";

const H = 3600_000;
const D = 86_400_000;
const now = Date.now();
const hoursAgo = (n: number) => new Date(now - n * H).toISOString();
const daysAgo = (n: number) => new Date(now - n * D).toISOString();
const inHours = (n: number) => new Date(now + n * H).toISOString();
const inDays = (n: number) => new Date(now + n * D).toISOString();

// ---------------------------------------------------------------------------
// Организация и люди
// ---------------------------------------------------------------------------
export const departments: Department[] = [
  { id: "d1", name: "Начальная школа", cost_per_idle_day: 2500 },
  { id: "d2", name: "Средняя школа", cost_per_idle_day: 3000 },
  { id: "d3", name: "Старшая школа и подготовка к экзаменам", cost_per_idle_day: 3500 },
  { id: "d4", name: "Дополнительное образование", cost_per_idle_day: 2000 },
  { id: "d5", name: "Администрация", cost_per_idle_day: 1500 },
];

export const staff: Profile[] = [
  { id: "u-director", full_name: "Юрий Ветров", email: "director@rastim.ru", position_title: "Директор", department_id: "d5" },
  { id: "u-hr", full_name: "Ольга Тимофеева", email: "hr@rastim.ru", position_title: "HR-менеджер", department_id: "d5" },
  { id: "u-hr2", full_name: "Марина Слуцкая", email: "hr2@rastim.ru", position_title: "HR-менеджер", department_id: "d5" },
  { id: "u-dept", full_name: "Елена Крылова", email: "dept@rastim.ru", position_title: "Завуч средней школы", department_id: "d2" },
  { id: "u-line", full_name: "Сергей Носов", email: "line@rastim.ru", position_title: "Руководитель кафедры математики", department_id: "d2" },
  { id: "u-employee", full_name: "Анна Жукова", email: "employee@rastim.ru", position_title: "Учитель математики, наставник", department_id: "d2" },
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
  { id: "s5", pipeline_id: "p1", code: "demo", name: "Демо-урок", order_index: 5, color_token: "stage-5", sla_hours: 120, is_terminal: false },
  { id: "s6", pipeline_id: "p1", code: "offer", name: "Оффер", order_index: 6, color_token: "stage-6", sla_hours: 72, is_terminal: false },
  { id: "s7", pipeline_id: "p1", code: "hired", name: "Вышел", order_index: 7, color_token: "stage-7", sla_hours: null, is_terminal: true },
];

// ---------------------------------------------------------------------------
// Вакансии
// ---------------------------------------------------------------------------
export const vacancies: Vacancy[] = [
  {
    id: "v1", title: "Учитель математики", pipeline_id: "p1",
    department_id: "d2", department_name: "Средняя школа",
    hiring_manager_id: "u-dept", hiring_manager_name: "Елена Крылова",
    recruiter_id: "u-hr", recruiter_name: "Ольга Тимофеева",
    status: "published", priority: "critical", headcount: 2, hired_count: 0,
    subject: "Математика", grades: "5–9 класс", city: "Краснодар", weekly_hours: 24,
    description: "Ведёте математику в 5–9 классах, две параллели. Классное руководство по желанию, с доплатой.",
    first_month_reality: "Первые две недели идёте вторым учителем на уроках наставника, свои классы берёте с третьей. Планы уроков уже написаны — их дают, а не требуют сочинить с нуля.",
    target_close_date: inDays(4).slice(0, 10), opened_at: daysAgo(27), closed_at: null,
    compensation: { vacancy_id: "v1", salary_min: 65000, salary_max: 78000, is_net: true, market_p50: 74000 },
  },
  {
    id: "v2", title: "Учитель начальных классов", pipeline_id: "p1",
    department_id: "d1", department_name: "Начальная школа",
    hiring_manager_id: "u-dept", hiring_manager_name: "Елена Крылова",
    recruiter_id: "u-hr", recruiter_name: "Ольга Тимофеева",
    status: "published", priority: "critical", headcount: 1, hired_count: 0,
    subject: "Начальная школа", grades: "1–4 класс", city: "Краснодар", weekly_hours: 26,
    description: "Свой класс с 1 сентября. Полный день, продлёнка отдельно оплачивается.",
    first_month_reality: "Класс набран, родительское собрание уже прошло. Первый месяц — с методистом рядом.",
    target_close_date: inDays(4).slice(0, 10), opened_at: daysAgo(19), closed_at: null,
    compensation: { vacancy_id: "v2", salary_min: 60000, salary_max: 72000, is_net: true, market_p50: 68000 },
  },
  {
    id: "v3", title: "Преподаватель программирования", pipeline_id: "p1",
    department_id: "d4", department_name: "Дополнительное образование",
    hiring_manager_id: "u-line", hiring_manager_name: "Сергей Носов",
    recruiter_id: "u-hr2", recruiter_name: "Марина Слуцкая",
    status: "published", priority: "high", headcount: 1, hired_count: 0,
    subject: "Программирование", grades: "7–11 класс", city: "Краснодар", weekly_hours: 12,
    description: "Python и основы алгоритмов, группы по 10 человек. Возможен гибрид.",
    first_month_reality: "Программа курса готова, но первые две группы вы добираете сами вместе с администратором.",
    target_close_date: inDays(23).slice(0, 10), opened_at: daysAgo(12), closed_at: null,
    compensation: { vacancy_id: "v3", salary_min: 55000, salary_max: 70000, is_net: true, market_p50: 72000 },
  },
  {
    id: "v4", title: "Репетитор по подготовке к ЕГЭ, физика", pipeline_id: "p1",
    department_id: "d3", department_name: "Старшая школа и подготовка к экзаменам",
    hiring_manager_id: "u-line", hiring_manager_name: "Сергей Носов",
    recruiter_id: "u-hr", recruiter_name: "Ольга Тимофеева",
    status: "published", priority: "normal", headcount: 1, hired_count: 0,
    subject: "Физика", grades: "10–11 класс", city: "Краснодар", weekly_hours: 10,
    description: "Малые группы и индивидуальные занятия, подготовка к ЕГЭ.",
    first_month_reality: "Группы уже собраны, программа под конкретный набор задач.",
    target_close_date: inDays(38).slice(0, 10), opened_at: daysAgo(8), closed_at: null,
    compensation: { vacancy_id: "v4", salary_min: 70000, salary_max: 90000, is_net: true, market_p50: 82000 },
  },
  {
    id: "v5", title: "Администратор учебной части", pipeline_id: "p2",
    department_id: "d5", department_name: "Администрация",
    hiring_manager_id: "u-director", hiring_manager_name: "Юрий Ветров",
    recruiter_id: "u-hr2", recruiter_name: "Марина Слуцкая",
    status: "pending_approval", priority: "normal", headcount: 1, hired_count: 0,
    subject: null, grades: null, city: "Краснодар", weekly_hours: 40,
    description: "Расписание, журналы, коммуникация с родителями.",
    first_month_reality: "Первый месяц — вместе с действующим администратором, он уходит в сентябре.",
    target_close_date: inDays(45).slice(0, 10), opened_at: null, closed_at: null,
    compensation: { vacancy_id: "v5", salary_min: 55000, salary_max: 65000, is_net: true, market_p50: 60000 },
  },
];

// ---------------------------------------------------------------------------
// Критерии вакансии: 5–6 штук. Это то, из чего складывается «4 из 6».
// ---------------------------------------------------------------------------
export const criteria: VacancyCriterion[] = [
  { id: "c1", vacancy_id: "v1", name: "Опыт преподавания в 5–9 классе от 3 лет", description: "Именно средняя школа, а не репетиторство один на один", weight: 5, is_required: true, order_index: 1 },
  { id: "c2", vacancy_id: "v1", name: "Профильное образование или переподготовка", description: null, weight: 4, is_required: true, order_index: 2 },
  { id: "c3", vacancy_id: "v1", name: "Готовность к 24 часам в неделю", description: "Совмещение допускаем, но расписание должно сходиться", weight: 4, is_required: true, order_index: 3 },
  { id: "c4", vacancy_id: "v1", name: "Работа с родителем в конфликте", description: "Проверяется кейсом, а не словами о себе", weight: 5, is_required: false, order_index: 4 },
  { id: "c5", vacancy_id: "v1", name: "Держит класс: дисциплина без давления", description: "Видно только на демо-уроке", weight: 5, is_required: false, order_index: 5 },
  { id: "c6", vacancy_id: "v1", name: "Допуск к работе с детьми", description: "Справка об отсутствии судимости и медкнижка", weight: 5, is_required: true, order_index: 6 },

  { id: "c7", vacancy_id: "v3", name: "Практический Python, не только теория", description: null, weight: 5, is_required: true, order_index: 1 },
  { id: "c8", vacancy_id: "v3", name: "Опыт преподавания подросткам", description: null, weight: 5, is_required: true, order_index: 2 },
  { id: "c9", vacancy_id: "v3", name: "Своя методика или готовность к нашей", description: null, weight: 3, is_required: false, order_index: 3 },
  { id: "c10", vacancy_id: "v3", name: "Вечерние часы", description: "Занятия после 17:00", weight: 4, is_required: true, order_index: 4 },
  { id: "c11", vacancy_id: "v3", name: "Допуск к работе с детьми", description: null, weight: 5, is_required: true, order_index: 5 },
];

// ---------------------------------------------------------------------------
// Кандидаты
// ---------------------------------------------------------------------------
const cand = (
  id: string, full_name: string, city: string, subjects: string[],
  stages_: string[], exp: number, kids: number,
  extra: Partial<Candidate> = {},
): Candidate => ({
  id, full_name, phones: ["+7 918 ••• ••-••"], emails: [`${id}@example.com`],
  city, telegram_username: `@${id}`, primary_source: "hh",
  is_blacklisted: false, blacklist_reason: null,
  hide_from_current_employer: false, current_employer: null,
  consent_pd_granted: true, last_activity_at: hoursAgo(6),
  resume_text: null,
  teacher: {
    candidate_id: id, subjects, education_stages: stages_,
    years_with_children: kids, total_experience_years: exp,
    available_hours_per_week: 24, schedule_note: null, ready_for_substitution: false,
  },
  ...extra,
});

export const candidates: Candidate[] = [
  cand("k1", "Ирина Ковалёва", "Краснодар", ["Математика"], ["middle"], 7, 7, {
    current_employer: "Гимназия №25", hide_from_current_employer: true,
    resume_text: "Учитель математики. Семь лет в средней школе, вела 5–9 классы, две выпускные параллели. Классное руководство 4 года.",
  }),
  cand("k2", "Пётр Соколов", "Краснодар", ["Математика", "Информатика"], ["middle", "high"], 4, 4, {
    resume_text: "Математика и информатика, 4 года. Работал в частной школе и репетитором.",
  }),
  cand("k3", "Анна Лебедева", "Сочи", ["Математика"], ["middle", "high"], 11, 11, {
    resume_text: "Одиннадцать лет, высшая категория, подготовка к ОГЭ и ЕГЭ.",
  }),
  cand("k4", "Мария Гусева", "Краснодар", ["Русский язык", "Литература"], ["high"], 6, 6, {}),
  cand("k5", "Олег Дементьев", "Краснодар", ["Информатика", "Программирование"], ["middle"], 3, 2, {}),
  cand("k6", "Дарья Плотникова", "Краснодар", ["Начальная школа"], ["primary"], 9, 9, {}),
  cand("k7", "Никита Осипов", "Ростов-на-Дону", ["Программирование"], ["high"], 5, 1, {
    resume_text: "Backend-разработчик на Python, пять лет. Вёл внутренние курсы для стажёров, хочу в преподавание.",
  }),
  cand("k8", "Светлана Ермакова", "Краснодар", ["Начальная школа"], ["primary"], 14, 14, {}),
  cand("k9", "Артём Белов", "Краснодар", ["Физика"], ["high"], 8, 8, {}),
  cand("k10", "Ксения Романова", "Краснодар", ["Математика"], ["middle"], 2, 2, {}),
  cand("k11", "Владимир Кутепов", "Армавир", ["Математика", "Физика"], ["middle", "high"], 16, 16, {}),
  cand("k12", "Юлия Панина", "Краснодар", ["Начальная школа"], ["primary"], 5, 5, {}),
  cand("k13", "Егор Мальцев", "Краснодар", ["Программирование"], ["middle", "high"], 6, 4, {}),
  cand("k14", "Татьяна Ремизова", "Краснодар", ["Математика"], ["middle"], 12, 12, {
    resume_text: "Двенадцать лет в школе. Уходила в декрет, возвращаюсь к работе.",
  }),
  cand("k15", "Роман Синицын", "Краснодар", ["Физика"], ["high"], 4, 4, {}),
  cand("k16", "Алиса Горелова", "Новороссийск", ["Математика", "Информатика"], ["middle"], 3, 3, {}),
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
  const t = c.teacher;
  return {
    id, candidate_id: candidateId, candidate_name: c.full_name,
    vacancy_id: vacancyId, vacancy_title: v.title,
    stage_id: stageId, status: "active", source: "hh",
    applied_at: daysAgo(10), stage_entered_at: daysAgo(3),
    sla_due_at: inHours(20), criteria_met: 3, criteria_total: 6,
    archive_segment: null, rejection_reason_id: null, is_private: false,
    expected_salary: null,
    subtitle: t ? `${t.subjects[0]} · ${v.grades ?? ""}`.trim() : v.title,
    ...opts,
  };
};

export const applications: Application[] = [
  // Вакансия «Учитель математики» — основная витрина
  app("a1", "k1", "v1", "s5", {
    applied_at: daysAgo(11), stage_entered_at: daysAgo(2), sla_due_at: inHours(4),
    criteria_met: 5, criteria_total: 6, expected_salary: 78000,
  }),
  app("a2", "k2", "v1", "s3", {
    applied_at: daysAgo(6), stage_entered_at: daysAgo(5), sla_due_at: hoursAgo(50),
    criteria_met: 4, criteria_total: 6, expected_salary: 85000,
  }),
  app("a3", "k3", "v1", "s3", {
    applied_at: daysAgo(9), stage_entered_at: daysAgo(1), sla_due_at: inHours(44),
    criteria_met: 6, criteria_total: 6, expected_salary: 92000,
    status: "rejected", archive_segment: "not_now", rejection_reason_id: "r1",
  }),
  app("a4", "k10", "v1", "s2", { applied_at: daysAgo(4), stage_entered_at: daysAgo(2), sla_due_at: inHours(12), criteria_met: 2, criteria_total: 6, expected_salary: 62000 }),
  app("a5", "k14", "v1", "s2", { applied_at: daysAgo(3), stage_entered_at: daysAgo(2), sla_due_at: inHours(30), criteria_met: 4, criteria_total: 6, expected_salary: 70000 }),
  app("a6", "k16", "v1", "s2", { applied_at: daysAgo(2), stage_entered_at: daysAgo(1), sla_due_at: inHours(6), criteria_met: 3, criteria_total: 6, expected_salary: 66000 }),
  app("a7", "k11", "v1", "s4", { applied_at: daysAgo(14), stage_entered_at: daysAgo(4), sla_due_at: inHours(52), criteria_met: 5, criteria_total: 6, expected_salary: 88000 }),
  app("a8", "k4", "v1", "s1", { applied_at: hoursAgo(5), stage_entered_at: hoursAgo(5), sla_due_at: inHours(19), criteria_met: 1, criteria_total: 6 }),
  app("a9", "k9", "v1", "s1", { applied_at: hoursAgo(20), stage_entered_at: hoursAgo(20), sla_due_at: inHours(4), criteria_met: 2, criteria_total: 6 }),
  app("a10", "k15", "v1", "s1", { applied_at: hoursAgo(31), stage_entered_at: hoursAgo(31), sla_due_at: hoursAgo(7), criteria_met: 2, criteria_total: 6 }),

  // Начальная школа
  app("a11", "k6", "v2", "s6", { applied_at: daysAgo(21), stage_entered_at: daysAgo(3), sla_due_at: inHours(18), criteria_met: 5, criteria_total: 6, expected_salary: 72000 }),
  app("a12", "k8", "v2", "s5", { applied_at: daysAgo(16), stage_entered_at: daysAgo(2), sla_due_at: inHours(40), criteria_met: 5, criteria_total: 6, expected_salary: 70000 }),
  app("a13", "k12", "v2", "s2", { applied_at: daysAgo(5), stage_entered_at: daysAgo(3), sla_due_at: hoursAgo(20), criteria_met: 3, criteria_total: 6, expected_salary: 64000 }),

  // Программирование
  app("a14", "k7", "v3", "s4", {
    applied_at: daysAgo(9), stage_entered_at: daysAgo(2), sla_due_at: inHours(30),
    criteria_met: 3, criteria_total: 5, expected_salary: 95000,
  }),
  app("a15", "k13", "v3", "s3", { applied_at: daysAgo(7), stage_entered_at: daysAgo(4), sla_due_at: hoursAgo(28), criteria_met: 4, criteria_total: 5, expected_salary: 78000 }),
  app("a16", "k5", "v3", "s2", { applied_at: daysAgo(3), stage_entered_at: daysAgo(1), sla_due_at: inHours(24), criteria_met: 2, criteria_total: 5, expected_salary: 60000 }),

  // Физика
  app("a17", "k9", "v4", "s3", { applied_at: daysAgo(6), stage_entered_at: daysAgo(2), sla_due_at: inHours(22), criteria_met: 4, criteria_total: 6, expected_salary: 90000 }),
  app("a18", "k15", "v4", "s2", { applied_at: daysAgo(4), stage_entered_at: daysAgo(2), sla_due_at: inHours(16), criteria_met: 3, criteria_total: 6, expected_salary: 75000 }),
];

// ---------------------------------------------------------------------------
// Результаты по критериям — с основанием, а не с баллом
// ---------------------------------------------------------------------------
export const criteriaResults: CriteriaResult[] = [
  { id: "cr1", application_id: "a1", criterion_id: "c1", criterion_name: "Опыт преподавания в 5–9 классе от 3 лет", result: "met", evidence: "«Семь лет в средней школе, вела 5–9 классы, две выпускные параллели»", source: "resume", is_ai: true, confirmed_by: "Ольга Тимофеева" },
  { id: "cr2", application_id: "a1", criterion_id: "c2", criterion_name: "Профильное образование или переподготовка", result: "met", evidence: "КубГУ, математический факультет, 2016. Диплом загружен", source: "documents", is_ai: false, confirmed_by: "Ольга Тимофеева" },
  { id: "cr3", application_id: "a1", criterion_id: "c3", criterion_name: "Готовность к 24 часам в неделю", result: "met", evidence: "На интервью: «24 часа готова, но не раньше 9 утра — ребёнок в саду»", source: "interview", is_ai: true, confirmed_by: "Ольга Тимофеева" },
  { id: "cr4", application_id: "a1", criterion_id: "c4", criterion_name: "Работа с родителем в конфликте", result: "met", evidence: "Кейс «конфликт с родителем»: отделила факт от эмоции, предложила план на две недели и позвала родителя на урок. По ценности «уважение к родителю» — совпадение", source: "case", is_ai: true, confirmed_by: null },
  { id: "cr5", application_id: "a1", criterion_id: "c5", criterion_name: "Держит класс: дисциплина без давления", result: "unknown", evidence: "Демо-урок назначен на четверг, 15:00", source: "demo_lesson", is_ai: false, confirmed_by: null },
  { id: "cr6", application_id: "a1", criterion_id: "c6", criterion_name: "Допуск к работе с детьми", result: "partial", evidence: "Справка об отсутствии судимости действует. Медкнижка истекает через 12 дней", source: "documents", is_ai: false, confirmed_by: "Ольга Тимофеева" },

  { id: "cr7", application_id: "a2", criterion_id: "c1", criterion_name: "Опыт преподавания в 5–9 классе от 3 лет", result: "met", evidence: "«Математика и информатика, 4 года» — из них 2 года в средней школе", source: "resume", is_ai: true, confirmed_by: null },
  { id: "cr8", application_id: "a2", criterion_id: "c2", criterion_name: "Профильное образование или переподготовка", result: "met", evidence: "Педагогическая переподготовка, 2021", source: "resume", is_ai: true, confirmed_by: null },
  { id: "cr9", application_id: "a2", criterion_id: "c3", criterion_name: "Готовность к 24 часам в неделю", result: "partial", evidence: "Готов к 18 часам: не хочет бросать репетиторство", source: "screening", is_ai: true, confirmed_by: "Ольга Тимофеева" },
  { id: "cr10", application_id: "a2", criterion_id: "c4", criterion_name: "Работа с родителем в конфликте", result: "met", evidence: "Кейс пройден, ответ спокойный и по делу", source: "case", is_ai: true, confirmed_by: null },
  { id: "cr11", application_id: "a2", criterion_id: "c5", criterion_name: "Держит класс: дисциплина без давления", result: "unknown", evidence: null, source: "demo_lesson", is_ai: false, confirmed_by: null },
  { id: "cr12", application_id: "a2", criterion_id: "c6", criterion_name: "Допуск к работе с детьми", result: "not_met", evidence: "Справки нет, медкнижки нет. На запрос не ответил", source: "documents", is_ai: false, confirmed_by: "Ольга Тимофеева" },

  { id: "cr13", application_id: "a14", criterion_id: "c7", criterion_name: "Практический Python, не только теория", result: "met", evidence: "«Backend-разработчик на Python, пять лет»", source: "resume", is_ai: true, confirmed_by: null },
  { id: "cr14", application_id: "a14", criterion_id: "c8", criterion_name: "Опыт преподавания подросткам", result: "partial", evidence: "«Вёл внутренние курсы для стажёров» — это взрослые, не подростки", source: "resume", is_ai: true, confirmed_by: null },
  { id: "cr15", application_id: "a14", criterion_id: "c9", criterion_name: "Своя методика или готовность к нашей", result: "met", evidence: "На интервью показал свой курс из 12 занятий", source: "interview", is_ai: true, confirmed_by: null },
  { id: "cr16", application_id: "a14", criterion_id: "c10", criterion_name: "Вечерние часы", result: "met", evidence: "Готов после 18:00, работает удалённо", source: "screening", is_ai: true, confirmed_by: null },
  { id: "cr17", application_id: "a14", criterion_id: "c11", criterion_name: "Допуск к работе с детьми", result: "unknown", evidence: null, source: "documents", is_ai: false, confirmed_by: null },
];

// ---------------------------------------------------------------------------
// Справочник причин отказа
// ---------------------------------------------------------------------------
export const rejectionReasons: RejectionReason[] = [
  { id: "r1", code: "no_slot_now", name: "Нет места сейчас", segment: "not_now", candidate_wording: "Вы нам подходите, но на эту нагрузку мы уже взяли человека. Оставляем ваш профиль в базе и вернёмся, когда откроются часы.", reactivate_after_months: 3 },
  { id: "r2", code: "season_wave", name: "Вернуться к сезону", segment: "not_now", candidate_wording: "Сейчас набор закрыт. Основной набор у нас в мае и августе — напишем вам первыми.", reactivate_after_months: 4 },
  { id: "r3", code: "other_subject", name: "Другой предмет или ступень", segment: "not_our_profile", candidate_wording: "Ваш опыт сильный, но не совпадает с предметом и ступенью этой вакансии. Если появится подходящая — сообщим.", reactivate_after_months: 6 },
  { id: "r4", code: "other_format", name: "Не совпал формат или график", segment: "not_our_profile", candidate_wording: "По расписанию и формату мы не сходимся. Профиль сохраняем: расписание у нас меняется каждый семестр.", reactivate_after_months: 4 },
  { id: "r5", code: "salary_gap", name: "Не сошлись по деньгам", segment: "not_our_profile", candidate_wording: "По ожиданиям мы сейчас не сходимся. Как только пересмотрим вилку по этому направлению, вернёмся к вам.", reactivate_after_months: 6 },
  { id: "r6", code: "need_experience", name: "Мало опыта с детьми", segment: "not_ready", candidate_wording: "Не хватает практики с этим возрастом. Мы собрали для вас план: что подтянуть и за какой срок. Приходите повторно.", reactivate_after_months: 6 },
  { id: "r7", code: "need_methodics", name: "Слабая методика", segment: "not_ready", candidate_wording: "Предмет вы знаете, а урок пока рассыпается по структуре. В плане развития — что именно доработать.", reactivate_after_months: 6 },
  { id: "r8", code: "need_soft_skills", name: "Не хватает работы с родителями", segment: "not_ready", candidate_wording: "Сильны в предмете, но в кейсе с родителем ответ был резким. Это тренируется, план прилагаем.", reactivate_after_months: 6 },
  { id: "r9", code: "failed_demo", name: "Демо-урок не показал результат", segment: "not_ready", candidate_wording: "На пробном уроке не сложился контакт с классом. Разбор по критериям прилагаем — он честный и по делу.", reactivate_after_months: 9 },
  { id: "r10", code: "values_mismatch", name: "Расхождение по ценностям", segment: "not_our_profile", candidate_wording: "В кейсах наши подходы к работе с детьми расходятся. Это не про уровень, а про разный взгляд на профессию.", reactivate_after_months: null },
  { id: "r11", code: "no_documents", name: "Нет допуска к работе с детьми", segment: "not_ready", candidate_wording: "Не хватает документов для допуска к детям. Как только справка будет готова — возвращайтесь, вакансию придержим.", reactivate_after_months: 3 },
  { id: "r12", code: "stop_list", name: "Стоп-лист", segment: "stop_list", candidate_wording: "К сожалению, продолжить отбор мы не сможем.", reactivate_after_months: null },
];

// ---------------------------------------------------------------------------
// Переписка. Кандидат живёт в Телеграме и на сайт не заходит.
// ---------------------------------------------------------------------------
export const conversations: Conversation[] = [
  { id: "cv1", candidate_id: "k1", candidate_name: "Ирина Ковалёва", application_id: "a1", vacancy_title: "Учитель математики", channel: "telegram", last_message_at: hoursAgo(2), unread_for_staff: 1, is_ai_autopilot: false },
  { id: "cv2", candidate_id: "k2", candidate_name: "Пётр Соколов", application_id: "a2", vacancy_title: "Учитель математики", channel: "telegram", last_message_at: hoursAgo(26), unread_for_staff: 2, is_ai_autopilot: false },
  { id: "cv3", candidate_id: "k7", candidate_name: "Никита Осипов", application_id: "a14", vacancy_title: "Преподаватель программирования", channel: "telegram", last_message_at: hoursAgo(9), unread_for_staff: 0, is_ai_autopilot: true },
  { id: "cv4", candidate_id: "k6", candidate_name: "Дарья Плотникова", application_id: "a11", vacancy_title: "Учитель начальных классов", channel: "telegram", last_message_at: daysAgo(3), unread_for_staff: 0, is_ai_autopilot: false },
  { id: "cv5", candidate_id: "k10", candidate_name: "Ксения Романова", application_id: "a4", vacancy_title: "Учитель математики", channel: "telegram", last_message_at: hoursAgo(30), unread_for_staff: 1, is_ai_autopilot: true },
];

export const messages: Message[] = [
  { id: "m1", conversation_id: "cv1", direction: "outbound", author_kind: "ai_assistant", author_name: "ассистент", body: "Ирина, здравствуйте! Ваш отклик на вакансию учителя математики принят. Ближайший шаг — короткий тест на 10 минут, он правда на десять минут.", sent_at: daysAgo(11) },
  { id: "m2", conversation_id: "cv1", direction: "inbound", author_kind: "candidate", author_name: null, body: "Здравствуйте! Готова, только вечером", sent_at: daysAgo(11) },
  { id: "m3", conversation_id: "cv1", direction: "outbound", author_kind: "staff", author_name: "Ольга Тимофеева", body: "Тогда выбирайте удобный слот — вечерние есть в среду и четверг", sent_at: daysAgo(10) },
  { id: "m4", conversation_id: "cv1", direction: "inbound", author_kind: "candidate", author_name: null, body: "Четверг подойдёт. И ещё вопрос: медкнижку когда нужно принести?", sent_at: daysAgo(10) },
  { id: "m5", conversation_id: "cv1", direction: "outbound", author_kind: "ai_assistant", author_name: "ассистент", body: "Медкнижка нужна до выхода на работу. У вас она действует ещё 12 дней — лучше продлить заранее, чтобы не задержать оформление.", sent_at: daysAgo(3) },
  { id: "m6", conversation_id: "cv1", direction: "inbound", author_kind: "candidate", author_name: null, body: "Записалась на продление на следующей неделе. Демо-урок в четверг — по какой теме готовиться?", sent_at: hoursAgo(2) },

  { id: "m7", conversation_id: "cv2", direction: "outbound", author_kind: "ai_assistant", author_name: "ассистент", body: "Пётр, здравствуйте! Отклик принят, следующий шаг — короткий тест.", sent_at: daysAgo(6) },
  { id: "m8", conversation_id: "cv2", direction: "inbound", author_kind: "candidate", author_name: null, body: "Прошёл. Когда будет ответ? У меня ещё два предложения на руках", sent_at: daysAgo(5) },
  { id: "m9", conversation_id: "cv2", direction: "inbound", author_kind: "candidate", author_name: null, body: "Добрый день, есть новости?", sent_at: hoursAgo(26) },

  { id: "m10", conversation_id: "cv3", direction: "outbound", author_kind: "ai_assistant", author_name: "ассистент", body: "Никита, здравствуйте! Ваш кейс проверен. Разбор придёт отдельно — он подробный и полезный вам самому, даже если мы не сойдёмся.", sent_at: daysAgo(2) },
  { id: "m11", conversation_id: "cv3", direction: "inbound", author_kind: "candidate", author_name: null, body: "Спасибо, редко такое встречаю. Жду", sent_at: hoursAgo(9) },

  { id: "m12", conversation_id: "cv4", direction: "outbound", author_kind: "staff", author_name: "Ольга Тимофеева", body: "Дарья, оффер отправлен. Ответ ждём до пятницы, вопросы можно задать прямо здесь.", sent_at: daysAgo(3) },

  { id: "m13", conversation_id: "cv5", direction: "outbound", author_kind: "ai_assistant", author_name: "ассистент", body: "Ксения, здравствуйте! Спасибо за отклик. Уточните, пожалуйста, сколько часов в неделю вы готовы вести?", sent_at: daysAgo(2) },
  { id: "m14", conversation_id: "cv5", direction: "inbound", author_kind: "candidate", author_name: null, body: "Могу 12–14, больше пока не потяну — учусь в магистратуре", sent_at: hoursAgo(30) },
];

// ---------------------------------------------------------------------------
// Созвоны и задания
// ---------------------------------------------------------------------------
export const interviews: Interview[] = [
  {
    id: "i1", application_id: "a1", kind: "interview", status: "done",
    scheduled_at: daysAgo(4), work_format: "online", recording_consent: true,
    ai_summary: "Сорок минут. Семь лет в средней школе, последние два года — 5–9 классы в гимназии №25. Уходит из-за нагрузки в 32 часа и трёх классных руководств одновременно. К нам идёт за меньшей нагрузкой, не за деньгами: назвала 78 000 и сразу добавила, что готова обсуждать. Просит расписание без первого урока — ребёнок в саду.",
    ai_conclusions: "Критерий «опыт 5–9 класс» закрыт уверенно. Критерий «24 часа» закрыт с оговоркой по времени начала. Не проверено: как держит класс — только демо-урок покажет. Риск: уходит от перегрузки, поэтому обещать классное руководство сразу не стоит.",
  },
  {
    id: "i2", application_id: "a1", kind: "demo_lesson", status: "scheduled",
    scheduled_at: inDays(2), work_format: "onsite", recording_consent: true,
    ai_summary: null, ai_conclusions: null,
  },
  {
    id: "i3", application_id: "a2", kind: "interview", status: "done",
    scheduled_at: daysAgo(5), work_format: "online", recording_consent: false,
    ai_summary: "Тридцать минут, запись не велась — кандидат не дал согласия. Заметки внесены вручную: четыре года опыта, из них два в средней школе. Не готов бросать репетиторство, поэтому максимум 18 часов.",
    ai_conclusions: "Расхождение по нагрузке: нам нужно 24 часа. Обсудить с заказчиком, готовы ли делить ставку.",
  },
  {
    id: "i4", application_id: "a14", kind: "interview", status: "done",
    scheduled_at: daysAgo(3), work_format: "online", recording_consent: true,
    ai_summary: "Пять лет в разработке, преподавал только взрослым стажёрам. Показал собственный курс из 12 занятий — структура есть, но задания рассчитаны на мотивированного взрослого. На вопрос «что делать, если подросток отказывается работать» ответил про переделку задания, не про контакт.",
    ai_conclusions: "Предмет знает уверенно. Критерий «опыт с подростками» закрыт частично: аудитория была другая. Рекомендую кейс на срыв урока до демо-занятия.",
  },
];

export const assessments: Assessment[] = [
  {
    id: "as1", application_id: "a1", template_name: "Кейс: конфликт с родителем",
    kind: "case", status: "reviewed", assigned_at: daysAgo(8), submitted_at: daysAgo(7),
    verdict: "strong",
    feedback_internal: "Совпадение по ценностям «уважение к родителю» и «честная обратная связь». Ответ родителю написан без оправданий и без обвинений: назван факт, признана эмоция, предложен конкретный шаг с датой. Отдельно ценно, что кандидат сам предложил позвать родителя на урок — это редкий ход, обычно предлагают «поговорить после уроков».",
    feedback_for_candidate: "Вы отделили факт от эмоции и предложили родителю конкретный план с датой — это сильная сторона вашего ответа. Приглашение на урок работает лучше объяснений: родитель видит то же, что видите вы. Что можно усилить: в письме не хватило вопроса к самому родителю — что он видит дома. Это часто меняет картину.",
  },
  {
    id: "as2", application_id: "a1", template_name: "Короткий тест на 10 минут",
    kind: "test", status: "reviewed", assigned_at: daysAgo(11), submitted_at: daysAgo(11),
    verdict: "ok", feedback_internal: "Проходной. Ответ про отставание ребёнка по дробям — по делу.",
    feedback_for_candidate: "Тест пройден. Ваш ответ про ребёнка, не понявшего дроби после двух объяснений, показывает главное: вы меняете подход, а не повторяете громче.",
  },
  {
    id: "as3", application_id: "a14", template_name: "Кейс: срыв урока",
    kind: "case", status: "assigned", assigned_at: hoursAgo(20), submitted_at: null,
    verdict: null, feedback_internal: null, feedback_for_candidate: null,
  },
];

// ---------------------------------------------------------------------------
// Документы: ниша «педагоги». Без допуска к детям не пустят.
// ---------------------------------------------------------------------------
export const documents: CandidateDocument[] = [
  { id: "dc1", candidate_id: "k1", candidate_name: "Ирина Ковалёва", kind: "criminal_record", state: "valid", expires_on: inDays(180).slice(0, 10) },
  { id: "dc2", candidate_id: "k1", candidate_name: "Ирина Ковалёва", kind: "medical_book", state: "expiring", expires_on: inDays(12).slice(0, 10) },
  { id: "dc3", candidate_id: "k1", candidate_name: "Ирина Ковалёва", kind: "diploma", state: "valid", expires_on: null },
  { id: "dc4", candidate_id: "k2", candidate_name: "Пётр Соколов", kind: "criminal_record", state: "missing", expires_on: null },
  { id: "dc5", candidate_id: "k2", candidate_name: "Пётр Соколов", kind: "medical_book", state: "missing", expires_on: null },
  { id: "dc6", candidate_id: "k6", candidate_name: "Дарья Плотникова", kind: "criminal_record", state: "valid", expires_on: inDays(240).slice(0, 10) },
  { id: "dc7", candidate_id: "k6", candidate_name: "Дарья Плотникова", kind: "medical_book", state: "valid", expires_on: inDays(300).slice(0, 10) },
  { id: "dc8", candidate_id: "k8", candidate_name: "Светлана Ермакова", kind: "medical_book", state: "expired", expires_on: daysAgo(20).slice(0, 10) },
  { id: "dc9", candidate_id: "k8", candidate_name: "Светлана Ермакова", kind: "criminal_record", state: "valid", expires_on: inDays(90).slice(0, 10) },
  { id: "dc10", candidate_id: "k11", candidate_name: "Владимир Кутепов", kind: "medical_book", state: "expiring", expires_on: inDays(25).slice(0, 10) },
  { id: "dc11", candidate_id: "k11", candidate_name: "Владимир Кутепов", kind: "criminal_record", state: "pending", expires_on: null },
  { id: "dc12", candidate_id: "k7", candidate_name: "Никита Осипов", kind: "criminal_record", state: "missing", expires_on: null },
];

// ---------------------------------------------------------------------------
// Заметки и мнение команды
// ---------------------------------------------------------------------------
export const notes: Note[] = [
  { id: "n1", candidate_id: "k1", application_id: "a1", author_name: "Ольга Тимофеева", body: "Уходит от перегрузки, а не за деньгами. Классное руководство в первый год не предлагать — спугнём.", visibility: "hiring_team", is_ai: false, created_at: daysAgo(4) },
  { id: "n2", candidate_id: "k1", application_id: "a1", author_name: "ассистент", body: "Медкнижка истекает через 12 дней. Если оффер выйдет позже 10 сентября, к выходу документ будет просрочен.", visibility: "hiring_team", is_ai: true, created_at: daysAgo(3) },
  { id: "n3", candidate_id: "k2", application_id: "a2", author_name: "Ольга Тимофеева", body: "Второй раз спрашивает про сроки. У него два предложения на руках — если Елена не ответит сегодня, потеряем.", visibility: "hiring_team", is_ai: false, created_at: hoursAgo(24) },
];

export const teamOpinions: TeamOpinion[] = [
  { id: "to1", application_id: "a1", author_name: "Анна Жукова", verdict: "yes", comment: "Пересекались на городском методобъединении. Спокойная, готовится основательно.", created_at: daysAgo(3) },
  { id: "to2", application_id: "a1", author_name: "Сергей Носов", verdict: "doubt", comment: "Не видел на уроке. После демо скажу точно.", created_at: daysAgo(2) },
];

// ---------------------------------------------------------------------------
// Заявки на подбор
// ---------------------------------------------------------------------------
export const requisitions: Requisition[] = [
  {
    id: "rq1", requested_by_name: "Елена Крылова", department_name: "Средняя школа",
    status: "approved",
    q_who_needed: "Второй математик на 5–9 классы, потому что Анна уходит в декрет в октябре",
    q_tasks: "24 часа в неделю, две параллели, без классного руководства в первый год",
    q_must_have: "Опыт именно в средней школе. Репетиторы один на один не тянут класс из 28 человек",
    q_deadline: "К 1 сентября, дальше начинается замена и родители пишут жалобы",
    q_budget: "До 78 тысяч на руки, выше — надо к директору",
    created_at: daysAgo(28),
  },
  {
    id: "rq2", requested_by_name: "Юрий Ветров", department_name: "Администрация",
    status: "pending_approval",
    q_who_needed: "Администратор учебной части: текущий уходит в сентябре",
    q_tasks: "Расписание, журналы, звонки родителям",
    q_must_have: "Опыт работы с расписанием школы, а не просто «офис-менеджер»",
    q_deadline: "К 15 сентября",
    q_budget: "55–65 тысяч",
    created_at: daysAgo(3),
  },
];
