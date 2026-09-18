/**
 * Единственная точка доступа к данным.
 *
 * Страницы не знают, откуда приходят данные. Пока нет ключей Supabase —
 * работает встроенный набор; как только ключи появятся, те же функции идут
 * в PostgreSQL. Благодаря этому переключение режима не трогает ни один экран.
 *
 * Важно: фильтрации «покажи только своё» здесь почти нет. Её делает RLS
 * в базе — это единственное место, где ограничение настоящее. Дублировать
 * его в клиенте значит создать вторую правду, которая однажды разойдётся.
 */
import { db, isDemoMode } from "./supabase";
import * as demo from "./demoData";
import { matchFromArchive, searchCandidates } from "./matching";
import { generateQuestions } from "./matching";
import { DOCUMENT_LABEL } from "./types";
import type {
  AppRole, Application, ArchiveMatch, Assessment, Candidate, CandidateDocument,
  CompanyValue, Consent, Conversation, CriteriaResult, CriterionResult,
  DashboardStats, DocumentKind, FunnelRow, Interview, InterviewSlot, MessengerBot,
  Message, Note, Offer, OfferStatus, PipelineStage, PracticalCheck, Profile, Referral,
  RejectionReason, Requisition, SalaryGap, SlaBreach, TeamOpinion, UrgentNeed, Vacancy,
  VacancyApproval, VacancyCriterion, VacancyInput, VacancyVersion, WorkFormat,
  Employee, OnboardingTask, IdpPlan, ProbationReview, HiringSatisfaction,
  LearningMaterial, Mentorship, PeopleCheckpoint, SeasonalityRow,
} from "./types";

// ===========================================================================
// СЕССИЯ
// ===========================================================================

const DEMO_KEY = "rastim.demo.user";

interface Session {
  userId: string;
  profile: Profile;
  roles: AppRole[];
}

/** Кто есть кто в демо-режиме: один вход на каждую из семи ролей. */
export const DEMO_USERS: { id: string; roles: AppRole[] }[] = [
  { id: "u-director", roles: ["director"] },
  { id: "u-hr", roles: ["hr_manager"] },
  { id: "u-dept", roles: ["dept_head"] },
  { id: "u-line", roles: ["line_manager"] },
  { id: "u-employee", roles: ["employee"] },
  { id: "u-candidate", roles: ["candidate"] },
  { id: "u-director", roles: ["superuser", "director"] },
];

function demoSessionFrom(userId: string, roles: AppRole[]): Session {
  const profile = demo.staff.find((s) => s.id === userId) ?? demo.staff[1];
  return { userId, profile, roles };
}

export async function getSession(): Promise<Session | null> {
  if (isDemoMode) {
    const raw = localStorage.getItem(DEMO_KEY);
    if (!raw) return null;
    try {
      const { userId, roles } = JSON.parse(raw) as { userId: string; roles: AppRole[] };
      return demoSessionFrom(userId, roles);
    } catch {
      return null;
    }
  }

  const { data } = await db().auth.getSession();
  const user = data.session?.user;
  if (!user) return null;

  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    db().from("profiles").select("id, full_name, email, position_title, department_id, avatar_url").eq("id", user.id).single(),
    db().from("user_roles").select("role").eq("user_id", user.id),
  ]);

  return {
    userId: user.id,
    profile: (profile as Profile) ?? {
      id: user.id, full_name: user.email ?? "", email: user.email ?? null,
      position_title: null, department_id: null,
    },
    roles: (roleRows ?? []).map((r: { role: AppRole }) => r.role),
  };
}

export async function signInDemo(userId: string, roles: AppRole[]): Promise<Session> {
  localStorage.setItem(DEMO_KEY, JSON.stringify({ userId, roles }));
  return demoSessionFrom(userId, roles);
}

export async function signIn(email: string, password: string) {
  const { error } = await db().auth.signInWithPassword({ email, password });
  if (error) throw new Error(translateAuthError(error.message));
}

export async function signUp(email: string, password: string, fullName: string) {
  const { error } = await db().auth.signUp({
    email, password,
    options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin },
  });
  if (error) throw new Error(translateAuthError(error.message));
}

export async function signOut() {
  if (isDemoMode) {
    localStorage.removeItem(DEMO_KEY);
    return;
  }
  await db().auth.signOut();
}

/** Ошибка объясняет, что не так и что сделать, без «invalid credentials». */
function translateAuthError(message: string): string {
  if (/invalid login credentials/i.test(message))
    return "Почта или пароль не подошли. Проверьте раскладку или восстановите пароль.";
  if (/user already registered/i.test(message))
    return "На эту почту уже есть аккаунт. Войдите вместо регистрации.";
  if (/password should be at least/i.test(message))
    return "Пароль короче шести символов. Добавьте ещё несколько.";
  if (/email not confirmed/i.test(message))
    return "Почта не подтверждена. Откройте письмо и перейдите по ссылке.";
  return message;
}

// ===========================================================================
// СПРАВОЧНИКИ
// ===========================================================================

/**
 * Воронка по умолчанию.
 *
 * Раньше значением по умолчанию у listStages стояло "p1" — идентификатор из
 * демо-набора. На настоящей базе id воронки это uuid, и запрос отвечал
 * «invalid input syntax for type uuid: "p1"», а вместе с ним падали пять
 * экранов, которые спрашивают этапы без аргумента.
 *
 * Ответ не меняется от вызова к вызову, а спрашивают его почти все экраны,
 * поэтому он запоминается на время жизни вкладки.
 */
const DEMO_PIPELINE_ID = "p1";
let defaultPipelineId: string | null = null;

async function getDefaultPipelineId(): Promise<string> {
  if (isDemoMode) return DEMO_PIPELINE_ID;
  if (defaultPipelineId) return defaultPipelineId;
  const { data, error } = await db()
    .from("pipelines")
    .select("id")
    .eq("is_default", true)
    .eq("is_active", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data)
    throw new Error(
      "В базе нет воронки по умолчанию. Примените sql/06_seed.sql — он заводит воронку «Специалист».",
    );
  defaultPipelineId = data.id as string;
  return defaultPipelineId;
}

export async function listStages(pipelineId?: string): Promise<PipelineStage[]> {
  const id = pipelineId ?? (await getDefaultPipelineId());
  if (isDemoMode) return demo.stages.filter((s) => s.pipeline_id === id);
  const { data, error } = await db()
    .from("pipeline_stages")
    .select("id, pipeline_id, code, name, order_index, color_token, sla_hours, is_terminal")
    .eq("pipeline_id", id)
    .order("order_index");
  if (error) throw error;
  return data as PipelineStage[];
}

export async function listRejectionReasons(): Promise<RejectionReason[]> {
  if (isDemoMode) return demo.rejectionReasons;
  const { data, error } = await db()
    .from("rejection_reasons")
    .select("id, code, name, segment, candidate_wording, reactivate_after_months")
    .eq("is_active", true)
    .order("order_index");
  if (error) throw error;
  return data as RejectionReason[];
}

// ===========================================================================
// ВАКАНСИИ
// ===========================================================================

export async function listVacancies(): Promise<Vacancy[]> {
  if (isDemoMode) return demo.vacancies;
  const { data, error } = await db()
    .from("vacancies")
    .select(`
      id, title, pipeline_id, department_id, status, priority, headcount, hired_count,
      specialization, grade, city, required_documents, weekly_hours, description, first_month_reality,
      target_close_date, opened_at, closed_at, hiring_manager_id, recruiter_id,
      departments!vacancies_department_id_fkey ( name ),
      hm:profiles!vacancies_hiring_manager_id_fkey ( full_name ),
      rec:profiles!vacancies_recruiter_id_fkey ( full_name )
    `)
    .order("priority", { ascending: false })
    .order("opened_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapVacancy);
}

export async function getVacancy(id: string): Promise<Vacancy | null> {
  if (isDemoMode) return demo.vacancies.find((v) => v.id === id) ?? null;
  const all = await listVacancies();
  const v = all.find((x) => x.id === id) ?? null;
  if (!v) return null;
  // Вилка живёт в отдельной таблице со своей политикой: пустой ответ здесь
  // означает «нет права», и это нормально — блок просто не показываем.
  const { data: comp } = await db()
    .from("vacancy_compensation")
    .select("vacancy_id, salary_min, salary_max, is_net, market_p50")
    .eq("vacancy_id", id)
    .maybeSingle();
  return { ...v, compensation: (comp as Vacancy["compensation"]) ?? null };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapVacancy(row: any): Vacancy {
  return {
    id: row.id, title: row.title, pipeline_id: row.pipeline_id,
    department_id: row.department_id, department_name: row.departments?.name ?? "—",
    hiring_manager_id: row.hiring_manager_id, hiring_manager_name: row.hm?.full_name ?? null,
    recruiter_id: row.recruiter_id, recruiter_name: row.rec?.full_name ?? null,
    status: row.status, priority: row.priority,
    headcount: row.headcount, hired_count: row.hired_count,
    specialization: row.specialization, grade: row.grade, city: row.city,
    required_documents: row.required_documents ?? [],
    weekly_hours: row.weekly_hours, description: row.description,
    first_month_reality: row.first_month_reality,
    target_close_date: row.target_close_date,
    opened_at: row.opened_at, closed_at: row.closed_at,
  };
}

export async function listCriteria(vacancyId: string): Promise<VacancyCriterion[]> {
  if (isDemoMode) return demo.criteria.filter((c) => c.vacancy_id === vacancyId);
  const { data, error } = await db()
    .from("vacancy_criteria")
    .select("id, vacancy_id, name, description, weight, is_required, order_index")
    .eq("vacancy_id", vacancyId)
    .order("order_index");
  if (error) throw error;
  return data as VacancyCriterion[];
}

// ===========================================================================
// ОТКЛИКИ
// ===========================================================================

/** Локальная копия: в демо-режиме перемещения по доске должны сохраняться. */
let demoApplications: Application[] = [...demo.applications, ...demo.archivedApplications];

export async function listApplications(vacancyId?: string): Promise<Application[]> {
  if (isDemoMode) {
    return vacancyId
      ? demoApplications.filter((a) => a.vacancy_id === vacancyId)
      : demoApplications;
  }
  let q = db().from("applications").select(`
      id, candidate_id, vacancy_id, stage_id, status, source, applied_at,
      stage_entered_at, sla_due_at, criteria_met, criteria_total,
      archive_segment, rejection_reason_id, is_private,
      candidates ( full_name, candidate_profiles ( specialization, skills ) ),
      vacancies ( title )
    `);
  if (vacancyId) q = q.eq("vacancy_id", vacancyId);
  const { data, error } = await q.order("applied_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapApplication);
}

function mapApplication(row: any): Application {
  const p = row.candidates?.candidate_profiles;
  const specialization = p?.specialization;
  const skills = (p?.skills ?? []).slice(0, 2).join(", ");
  return {
    id: row.id, candidate_id: row.candidate_id,
    candidate_name: row.candidates?.full_name ?? "—",
    vacancy_id: row.vacancy_id, vacancy_title: row.vacancies?.title ?? "—",
    stage_id: row.stage_id, status: row.status, source: row.source,
    applied_at: row.applied_at, stage_entered_at: row.stage_entered_at,
    sla_due_at: row.sla_due_at,
    criteria_met: row.criteria_met, criteria_total: row.criteria_total,
    archive_segment: row.archive_segment,
    rejection_reason_id: row.rejection_reason_id,
    is_private: row.is_private, expected_salary: null,
    subtitle: [specialization, skills].filter(Boolean).join(" · ") || null,
  };
}

export async function getApplication(id: string): Promise<Application | null> {
  if (isDemoMode) return demoApplications.find((a) => a.id === id) ?? null;
  const all = await listApplications();
  return all.find((a) => a.id === id) ?? null;
}

export async function listCriteriaResults(applicationId: string): Promise<CriteriaResult[]> {
  if (isDemoMode) return demo.criteriaResults.filter((r) => r.application_id === applicationId);
  const { data, error } = await db()
    .from("application_criteria_results")
    .select(`
      id, application_id, criterion_id, result, evidence, source, is_ai, confirmed_by,
      vacancy_criteria ( name, order_index )
    `)
    .eq("application_id", applicationId);
  if (error) throw error;
  return (data ?? [])
    .map((r: any) => ({
      id: r.id, application_id: r.application_id, criterion_id: r.criterion_id,
      criterion_name: r.vacancy_criteria?.name ?? "—",
      result: r.result, evidence: r.evidence, source: r.source,
      is_ai: r.is_ai, confirmed_by: r.confirmed_by,
      _order: r.vacancy_criteria?.order_index ?? 0,
    }))
    .sort((a: any, b: any) => a._order - b._order) as CriteriaResult[];
}

/** Перевод отклика на этап. Историю и пересчёт срока делает триггер в базе. */
export async function moveApplication(applicationId: string, stageId: string): Promise<void> {
  if (isDemoMode) {
    const stage = demo.stages.find((s) => s.id === stageId);
    demoApplications = demoApplications.map((a) =>
      a.id === applicationId
        ? {
            ...a,
            stage_id: stageId,
            stage_entered_at: new Date().toISOString(),
            sla_due_at: stage?.sla_hours
              ? new Date(Date.now() + stage.sla_hours * 3600_000).toISOString()
              : null,
            status: stage?.is_terminal ? "hired" : a.status,
          }
        : a,
    );
    return;
  }
  const { error } = await db().from("applications").update({ stage_id: stageId }).eq("id", applicationId);
  if (error) throw error;
}

export async function rejectApplication(
  applicationId: string,
  reasonId: string,
  note?: string,
): Promise<void> {
  const reason = (await listRejectionReasons()).find((r) => r.id === reasonId);
  if (isDemoMode) {
    demoApplications = demoApplications.map((a) =>
      a.id === applicationId
        ? {
            ...a,
            status: reason?.segment === "stop_list" ? "rejected" : "rejected",
            rejection_reason_id: reasonId,
            archive_segment: reason?.segment ?? null,
          }
        : a,
    );
    return;
  }
  const { error } = await db()
    .from("applications")
    .update({
      status: "rejected",
      rejection_reason_id: reasonId,
      archive_segment: reason?.segment ?? null,
      rejection_note: note ?? null,
    })
    .eq("id", applicationId);
  if (error) throw error;
}

/** Подтверждение результата, который поставил ИИ. Человек всегда последний. */
export async function confirmCriterion(resultId: string, by: string): Promise<void> {
  if (isDemoMode) {
    const r = demo.criteriaResults.find((x) => x.id === resultId);
    if (r) r.confirmed_by = by;
    return;
  }
  const { error } = await db()
    .from("application_criteria_results")
    .update({ confirmed_by: by, confirmed_at: new Date().toISOString() })
    .eq("id", resultId);
  if (error) throw error;
}

// ===========================================================================
// КАНДИДАТЫ
// ===========================================================================

export async function listCandidates(query = ""): Promise<Candidate[]> {
  if (isDemoMode) return searchCandidates(demo.candidates, query);
  let q = db().from("candidates").select(`
      id, full_name, phones, emails, city, telegram_username, primary_source,
      is_blacklisted, blacklist_reason, hide_from_current_employer, current_employer,
      consent_pd_granted, last_activity_at, resume_text,
      candidate_profiles ( candidate_id, specialization, skills, grades,
                           years_in_specialty, total_experience_years, available_from,
                           schedule_note, ready_for_urgent_start, work_formats,
                           expected_salary )
    `);
  if (query.trim()) q = q.ilike("full_name", `%${query.trim()}%`);
  const { data, error } = await q.limit(200);
  if (error) throw error;
  return (data ?? []).map((c: any) => ({ ...c, profile: c.candidate_profiles ?? null })) as Candidate[];
}

export async function getCandidate(id: string): Promise<Candidate | null> {
  if (isDemoMode) return demo.candidates.find((c) => c.id === id) ?? null;
  const list = await listCandidates();
  return list.find((c) => c.id === id) ?? null;
}

// ===========================================================================
// ПЕРЕПИСКА
// ===========================================================================

let demoMessages: Message[] = [...demo.messages];

export async function listConversations(): Promise<Conversation[]> {
  if (isDemoMode) {
    return [...demo.conversations]
      .map((c) => {
        // Превью считаем на месте, а не храним: иначе оно разъезжается
        // с перепиской после первой же отправки.
        const last = demoMessages
          .filter((m) => m.conversation_id === c.id)
          .sort((a, b) => a.sent_at.localeCompare(b.sent_at))
          .slice(-1)[0];
        return {
          ...c,
          preview: last?.body ?? null,
          preview_incoming: last?.author_kind === "candidate",
        };
      })
      .sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""));
  }
  const { data, error } = await db()
    .from("conversations")
    .select(`
      id, candidate_id, application_id, channel, last_message_at,
      unread_for_staff, is_ai_autopilot, bot_id,
      candidates ( full_name ),
      applications ( vacancies ( title ) ),
      messenger_bots ( name )
    `)
    .order("last_message_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []).map((c: any) => ({
    id: c.id, candidate_id: c.candidate_id,
    candidate_name: c.candidates?.full_name ?? "—",
    application_id: c.application_id,
    vacancy_title: c.applications?.vacancies?.title ?? null,
    channel: c.channel, last_message_at: c.last_message_at,
    unread_for_staff: c.unread_for_staff, is_ai_autopilot: c.is_ai_autopilot,
    bot_id: c.bot_id ?? null,
    bot_name: c.messenger_bots?.name ?? null,
    // Последнее сообщение подтягиваем отдельным запросом ниже: тащить его
    // джойном на каждый диалог дороже, чем один запрос на всю страницу.
    preview: null,
    preview_incoming: false,
  }));
}

/**
 * Последнее сообщение в каждом диалоге — для списка.
 *
 * Отдельным запросом намеренно: связанная выборка вернула бы все сообщения
 * всех диалогов ради одной строки на каждый. Здесь мы берём свежие сообщения
 * пачкой и раскладываем по диалогам уже на клиенте.
 */
export async function attachPreviews(list: Conversation[]): Promise<Conversation[]> {
  if (isDemoMode || list.length === 0) return list;

  const { data } = await db()
    .from("messages")
    .select("conversation_id, body, author_kind, sent_at")
    .in("conversation_id", list.map((c) => c.id))
    .order("sent_at", { ascending: false })
    .limit(1000);

  const seen = new Map<string, { body: string | null; author_kind: string }>();
  for (const m of data ?? []) {
    if (!seen.has(m.conversation_id)) seen.set(m.conversation_id, m as any);
  }
  return list.map((c) => {
    const last = seen.get(c.id);
    return {
      ...c,
      preview: last?.body ?? null,
      preview_incoming: last?.author_kind === "candidate",
    };
  });
}

// ---------------------------------------------------------------------------
// БОТЫ
//
// Токен сюда не приходит и отсюда не уходит: он живёт в базе под RLS.
// Добавление и удаление идут через серверную функцию, потому что она
// заодно разговаривает с Телеграмом — регистрирует адрес и проверяет,
// что токен живой.
// ---------------------------------------------------------------------------
export async function listBots(): Promise<MessengerBot[]> {
  if (isDemoMode) return [...demo.messengerBots];
  const { data, error } = await db()
    .from("v_messenger_bots")
    .select("*")
    .order("is_default", { ascending: false })
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as MessengerBot[];
}

async function callBotFunction(body: Record<string, unknown>) {
  const { data, error } = await db().functions.invoke("bot-register", { body });
  if (error) {
    // Ошибку функции показываем словами: «не удалось» без причины
    // заставляет гадать, а гадать тут не о чем — Телеграм всегда объясняет.
    const detail = (data as any)?.error ?? error.message;
    throw new Error(detail);
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as any;
}

export async function addBot(token: string, name: string) {
  if (isDemoMode) {
    throw new Error(
      "В демо-режиме бота не подключить: нужен настоящий токен и база. Заполните .env и повторите.",
    );
  }
  return callBotFunction({ action: "add", token, name });
}

export async function removeBot(botId: string) {
  if (isDemoMode) {
    demo.messengerBots.splice(demo.messengerBots.findIndex((b) => b.id === botId), 1);
    return;
  }
  await callBotFunction({ action: "remove", bot_id: botId });
}

export async function recheckBot(botId: string) {
  if (isDemoMode) return { ok: true, pending: 0, error: null };
  return callBotFunction({ action: "recheck", bot_id: botId });
}

export async function listMessages(conversationId: string): Promise<Message[]> {
  if (isDemoMode) {
    return demoMessages
      .filter((m) => m.conversation_id === conversationId)
      .sort((a, b) => a.sent_at.localeCompare(b.sent_at));
  }
  const { data, error } = await db()
    .from("messages")
    .select("id, conversation_id, direction, author_kind, body, attachments, sent_at, profiles ( full_name )")
    .eq("conversation_id", conversationId)
    .order("sent_at");
  if (error) throw error;
  return (data ?? []).map((m: any) => ({
    id: m.id, conversation_id: m.conversation_id, direction: m.direction,
    author_kind: m.author_kind, author_name: m.profiles?.full_name ?? null,
    body: m.body, attachments: Array.isArray(m.attachments) ? m.attachments : [],
    sent_at: m.sent_at,
  }));
}

export async function sendMessage(
  conversationId: string,
  body: string,
  authorName: string,
): Promise<Message> {
  const msg: Message = {
    id: `m-${Date.now()}`, conversation_id: conversationId,
    direction: "outbound", author_kind: "staff", author_name: authorName,
    body, sent_at: new Date().toISOString(),
  };
  if (isDemoMode) {
    demoMessages = [...demoMessages, msg];
    const cv = demo.conversations.find((c) => c.id === conversationId);
    if (cv) { cv.last_message_at = msg.sent_at; cv.unread_for_staff = 0; }
    return msg;
  }
  const { data, error } = await db()
    .from("messages")
    .insert({ conversation_id: conversationId, direction: "outbound", author_kind: "staff", body })
    .select("id, sent_at")
    .single();
  if (error) throw error;
  return { ...msg, id: data.id, sent_at: data.sent_at };
}

/**
 * Антиспам (фишка 41). В базе это функция can_touch_candidate; в демо-режиме
 * считаем по тем же правилам, чтобы поведение экрана совпадало.
 */
const demoTouches: { candidateId: string; at: number }[] = [];

export async function canTouchCandidate(candidateId: string): Promise<boolean> {
  if (isDemoMode) {
    const cv = demo.conversations.filter((c) => c.candidate_id === candidateId).map((c) => c.id);
    const weekAgo = Date.now() - 7 * 86_400_000;
    const written = demoMessages.filter(
      (m) => cv.includes(m.conversation_id) && m.direction === "outbound" &&
             new Date(m.sent_at).getTime() > weekAgo,
    ).length;
    const called = demoTouches.filter(
      (t) => t.candidateId === candidateId && t.at > weekAgo,
    ).length;
    return written + called < 3;
  }
  const { data, error } = await db().rpc("can_touch_candidate", { _candidate_id: candidateId });
  if (error) throw error;
  return Boolean(data);
}

// ===========================================================================
// СОЗВОНЫ, ЗАДАНИЯ, ДОКУМЕНТЫ, ЗАМЕТКИ
// ===========================================================================

export async function listInterviews(applicationId: string): Promise<Interview[]> {
  if (isDemoMode) return demo.interviews.filter((i) => i.application_id === applicationId);
  const { data, error } = await db()
    .from("interviews")
    .select("id, application_id, kind, status, scheduled_at, work_format, ai_summary, ai_conclusions, recording_consent_id")
    .eq("application_id", applicationId)
    .order("scheduled_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((i: any) => ({ ...i, recording_consent: Boolean(i.recording_consent_id) }));
}

export async function listAssessments(applicationId: string): Promise<Assessment[]> {
  if (isDemoMode) return demo.assessments.filter((a) => a.application_id === applicationId);
  const { data, error } = await db()
    .from("assessments")
    .select(`
      id, application_id, status, assigned_at, submitted_at,
      assessment_templates ( name, kind ),
      assessment_reviews ( verdict, feedback_internal, feedback_for_candidate )
    `)
    .eq("application_id", applicationId);
  if (error) throw error;
  return (data ?? []).map((a: any) => ({
    id: a.id, application_id: a.application_id,
    template_name: a.assessment_templates?.name ?? "—",
    kind: a.assessment_templates?.kind ?? "test",
    status: a.status, assigned_at: a.assigned_at, submitted_at: a.submitted_at,
    verdict: a.assessment_reviews?.[0]?.verdict ?? null,
    feedback_internal: a.assessment_reviews?.[0]?.feedback_internal ?? null,
    feedback_for_candidate: a.assessment_reviews?.[0]?.feedback_for_candidate ?? null,
  }));
}

export async function listDocuments(candidateId?: string): Promise<CandidateDocument[]> {
  if (isDemoMode) {
    const rows = candidateId
      ? demo.documents.filter((d) => d.candidate_id === candidateId)
      : demo.documents;
    const rank = { expired: 0, expiring: 1, missing: 2, pending: 3, rejected: 4, valid: 5 };
    return [...rows].sort((a, b) => rank[a.state] - rank[b.state]);
  }
  let q = db().from("candidate_documents")
    .select(
      "id, candidate_id, kind, state, expires_on, verified_at, " +
      "storage_path, file_name, file_size, mime_type, candidates ( full_name )",
    );
  if (candidateId) q = q.eq("candidate_id", candidateId);
  const { data, error } = await q.order("expires_on", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []).map((d: any) => ({ ...d, candidate_name: d.candidates?.full_name ?? "—" }));
}

export async function listNotes(applicationId: string): Promise<Note[]> {
  if (isDemoMode) return demo.notes.filter((n) => n.application_id === applicationId);
  const { data, error } = await db()
    .from("candidate_notes")
    .select("id, candidate_id, application_id, body, visibility, is_ai, created_at, profiles ( full_name )")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((n: any) => ({ ...n, author_name: n.profiles?.full_name ?? "—" }));
}

export async function listTeamOpinions(applicationId: string): Promise<TeamOpinion[]> {
  if (isDemoMode) return demo.teamOpinions.filter((o) => o.application_id === applicationId);
  const { data, error } = await db()
    .from("team_opinions")
    .select("id, application_id, verdict, comment, created_at, profiles ( full_name )")
    .eq("application_id", applicationId);
  if (error) throw error;
  return (data ?? []).map((o: any) => ({ ...o, author_name: o.profiles?.full_name ?? "—" }));
}

// ===========================================================================
// ЗАЯВКИ НА ПОДБОР
// ===========================================================================

let demoRequisitions: Requisition[] = [...demo.requisitions];

export async function listRequisitions(): Promise<Requisition[]> {
  if (isDemoMode) return demoRequisitions;
  const { data, error } = await db()
    .from("requisitions")
    .select("id, status, q_who_needed, q_tasks, q_must_have, q_deadline, q_budget, created_at, profiles ( full_name ), departments ( name )")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    ...r, requested_by_name: r.profiles?.full_name ?? "—",
    department_name: r.departments?.name ?? "—",
  }));
}

export interface RequisitionInput {
  department_id: string;
  q_who_needed: string;
  q_tasks: string;
  q_must_have: string;
  q_deadline: string;
  q_budget: string;
}

export async function createRequisition(input: RequisitionInput, authorName: string): Promise<string> {
  if (isDemoMode) {
    const id = `rq-${Date.now()}`;
    demoRequisitions = [
      {
        id, requested_by_name: authorName,
        department_name: demo.departments.find((d) => d.id === input.department_id)?.name ?? "—",
        status: "pending_approval",
        q_who_needed: input.q_who_needed, q_tasks: input.q_tasks,
        q_must_have: input.q_must_have, q_deadline: input.q_deadline,
        q_budget: input.q_budget, created_at: new Date().toISOString(),
      },
      ...demoRequisitions,
    ];
    return id;
  }
  const { data: sess } = await db().auth.getUser();
  const { data, error } = await db()
    .from("requisitions")
    .insert({ ...input, requested_by: sess.user?.id, status: "pending_approval" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/**
 * Открыть вакансию.
 *
 * Заводится сразу опубликованной, а не черновиком: человек, у которого есть
 * право её создать, для того её и создаёт. Согласование в системе есть, но
 * оно для заявок от руководителей, а не для того, кто сам за подбор отвечает.
 *
 * Вилка ложится в отдельную таблицу — у неё своя политика доступа. Деньги
 * видят не все, кто видит вакансию, и это разделение проходит по таблицам,
 * а не по колонкам: RLS умеет прятать строки, а не поля.
 */
export async function createVacancy(input: VacancyInput): Promise<string> {
  if (isDemoMode) {
    throw new Error("В демо-режиме вакансия не заводится: встроенный набор только для показа.");
  }

  const pipelineId = await getDefaultPipelineId();
  const userId = (await db().auth.getUser()).data.user?.id ?? null;

  const { data, error } = await db()
    .from("vacancies")
    .insert({
      title: input.title.trim(),
      department_id: input.department_id,
      pipeline_id: pipelineId,
      specialization: input.specialization.trim() || null,
      city: input.city.trim() || null,
      employment_type: input.employment_type,
      work_format: input.work_format,
      grade: input.grade,
      headcount: input.headcount,
      weekly_hours: input.weekly_hours,
      description: input.description.trim() || null,
      requirements: input.requirements.trim() || null,
      conditions: input.conditions.trim() || null,
      first_month_reality: input.first_month_reality.trim() || null,
      status: "published",
      opened_at: new Date().toISOString(),
      recruiter_id: userId,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error) throw error;

  if (input.salary_min !== null || input.salary_max !== null) {
    const { error: compErr } = await db().from("vacancy_compensation").insert({
      vacancy_id: data.id,
      salary_min: input.salary_min,
      salary_max: input.salary_max,
      is_net: input.is_net,
    });
    // Вилку записать не вышло — сама вакансия уже есть и работает.
    // Ронять создание из-за этого неправильно, но и молчать нельзя.
    if (compErr) console.warn("Вилка не записалась:", compErr.message);
  }

  return data.id as string;
}

export async function listDepartments() {
  if (isDemoMode) return demo.departments;
  const { data, error } = await db().from("departments").select("id, name, cost_per_idle_day").eq("is_active", true).order("name");
  if (error) throw error;
  return data;
}

// ===========================================================================
// АНАЛИТИКА
// ===========================================================================

export async function getDashboardStats(): Promise<DashboardStats> {
  if (isDemoMode) {
    const open = demo.vacancies.filter((v) => v.status === "published").length;
    const burning = demo.vacancies.filter(
      (v) => v.priority === "critical" && v.status === "published",
    ).length;
    return {
      days_to_hire: 27, days_to_hire_delta: -6,
      cost_per_hire: 41, cost_per_hire_delta: 0,
      open_vacancies: open, burning_vacancies: burning,
      probation_dropout: 14, probation_dropout_delta: 4,
    };
  }
  const [{ data: tth }, { data: cph }, { data: vac }] = await Promise.all([
    db().from("v_time_to_hire").select("days_open"),
    db().from("v_cost_per_hire").select("cost_per_hire"),
    db().from("vacancies").select("status, priority"),
  ]);
  const days = (tth ?? []).map((r: any) => r.days_open).filter(Boolean);
  const costs = (cph ?? []).map((r: any) => r.cost_per_hire).filter(Boolean);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return {
    days_to_hire: Math.round(avg(days)), days_to_hire_delta: 0,
    cost_per_hire: Math.round(avg(costs) / 1000), cost_per_hire_delta: 0,
    open_vacancies: (vac ?? []).filter((v: any) => v.status === "published").length,
    burning_vacancies: (vac ?? []).filter((v: any) => v.priority === "critical" && v.status === "published").length,
    probation_dropout: 0, probation_dropout_delta: 0,
  };
}

export async function getFunnel(vacancyId: string): Promise<FunnelRow[]> {
  if (isDemoMode) {
    // Числа воспроизводят реальный обрыв: 148 откликов, 87 не дошли до скрининга
    const base: Record<string, number> = { s1: 148, s2: 61, s3: 24, s4: 13, s5: 7, s6: 3, s7: 2 };
    const scale = vacancyId === "v1" ? 1 : vacancyId === "v2" ? 0.42 : 0.28;
    return demo.stages.map((s) => ({
      stage_id: s.id, stage_name: s.name, color_token: s.color_token,
      order_index: s.order_index, ever_reached: Math.round(base[s.id] * scale),
    }));
  }
  const { data, error } = await db()
    .from("v_funnel_by_vacancy")
    .select("stage_id, stage_name, color_token, order_index, ever_reached")
    .eq("vacancy_id", vacancyId)
    .order("order_index");
  if (error) throw error;
  return data as FunnelRow[];
}

export async function getSlaBreaches(): Promise<SlaBreach[]> {
  if (isDemoMode) {
    return demoApplications
      .filter((a) => a.status === "active" && a.sla_due_at && new Date(a.sla_due_at) < new Date())
      .map((a) => {
        const v = demo.vacancies.find((x) => x.id === a.vacancy_id);
        return {
          id: `sla-${a.id}`, application_id: a.id, candidate_name: a.candidate_name,
          vacancy_title: a.vacancy_title,
          responsible_name: v?.hiring_manager_name ?? "—",
          hours_overdue: Math.round((Date.now() - new Date(a.sla_due_at!).getTime()) / 3600_000),
          state: "escalated",
        };
      })
      .sort((a, b) => b.hours_overdue - a.hours_overdue);
  }
  const { data, error } = await db()
    .from("v_sla_breaches")
    .select("id, application_id, responsible_name, hours_overdue, state, applications ( vacancies ( title ), candidates ( full_name ) )")
    .order("hours_overdue", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id, application_id: r.application_id,
    candidate_name: r.applications?.candidates?.full_name ?? "—",
    vacancy_title: r.applications?.vacancies?.title ?? "—",
    responsible_name: r.responsible_name ?? "—",
    hours_overdue: Math.round(r.hours_overdue), state: r.state,
  }));
}

/**
 * «Ждут меня» — стартовый экран руководителя подразделения.
 * В настоящей базе фильтрация делается RLS: он и так видит только своё.
 */
export async function getWaitingForMe(userId: string): Promise<Application[]> {
  const apps = await listApplications();
  if (isDemoMode) {
    const mine = demo.vacancies
      .filter((v) => v.hiring_manager_id === userId || v.line_manager_id === userId)
      .map((v) => v.id);
    const scope = mine.length ? mine : demo.vacancies.map((v) => v.id);
    return apps
      .filter((a) => a.status === "active" && scope.includes(a.vacancy_id))
      .filter((a) => ["s3", "s4", "s5"].includes(a.stage_id))
      .sort((a, b) => (a.sla_due_at ?? "").localeCompare(b.sla_due_at ?? ""));
  }
  return apps
    .filter((a) => a.status === "active")
    .sort((a, b) => (a.sla_due_at ?? "").localeCompare(b.sla_due_at ?? ""));
}

// ===========================================================================
// КАЛЕНДАРЬ И САМОЗАПИСЬ (фишка 34)
// Поиск слотов в переписке — крупнейший пожиратель времени HR.
// ===========================================================================

let demoSlots: InterviewSlot[] = [...demo.slots];

export async function listSlots(vacancyId?: string): Promise<InterviewSlot[]> {
  if (isDemoMode) {
    return demoSlots
      .filter((s) => !vacancyId || s.vacancy_id === vacancyId || s.vacancy_id === null)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }
  let q = db().from("interview_slots").select(
    "id, owner_id, vacancy_id, kind, starts_at, ends_at, work_format, location, is_booked, booked_by_application_id, profiles ( full_name )",
  );
  if (vacancyId) q = q.eq("vacancy_id", vacancyId);
  const { data, error } = await q.order("starts_at");
  if (error) throw error;
  return (data ?? []).map((s: any) => ({ ...s, owner_name: s.profiles?.full_name ?? "—" }));
}

/** Кандидат сам выбирает слот — переписка «когда вам удобно» исчезает. */
export async function bookSlot(slotId: string, applicationId: string): Promise<void> {
  if (isDemoMode) {
    demoSlots = demoSlots.map((s) =>
      s.id === slotId ? { ...s, is_booked: true, booked_by_application_id: applicationId } : s,
    );
    return;
  }
  const { error } = await db()
    .from("interview_slots")
    .update({ is_booked: true, booked_by_application_id: applicationId })
    .eq("id", slotId)
    .eq("is_booked", false);
  if (error) throw error;
}

export async function releaseSlot(slotId: string): Promise<void> {
  if (isDemoMode) {
    demoSlots = demoSlots.map((s) =>
      s.id === slotId ? { ...s, is_booked: false, booked_by_application_id: null } : s,
    );
    return;
  }
  const { error } = await db()
    .from("interview_slots")
    .update({ is_booked: false, booked_by_application_id: null })
    .eq("id", slotId);
  if (error) throw error;
}

export async function createSlot(input: {
  owner_id: string;
  owner_name: string;
  vacancy_id: string | null;
  kind: string;
  starts_at: string;
  duration_min: number;
  work_format: WorkFormat;
  location: string | null;
}): Promise<void> {
  const ends = new Date(
    new Date(input.starts_at).getTime() + input.duration_min * 60000,
  ).toISOString();

  if (isDemoMode) {
    demoSlots = [
      ...demoSlots,
      {
        id: `sl-${Date.now()}`,
        owner_id: input.owner_id,
        owner_name: input.owner_name,
        vacancy_id: input.vacancy_id,
        kind: input.kind,
        starts_at: input.starts_at,
        ends_at: ends,
        work_format: input.work_format,
        location: input.location,
        is_booked: false,
        booked_by_application_id: null,
      },
    ];
    return;
  }
  const { error } = await db().from("interview_slots").insert({
    owner_id: input.owner_id,
    vacancy_id: input.vacancy_id,
    kind: input.kind,
    starts_at: input.starts_at,
    ends_at: ends,
    work_format: input.work_format,
    location: input.location,
  });
  if (error) throw error;
}

// ===========================================================================
// ОФФЕР (фишка 39). Самый дорогой шаг воронки — нельзя терять его в почте.
// ===========================================================================

let demoOffers: Offer[] = [...demo.offers];

export async function listOffers(): Promise<Offer[]> {
  if (isDemoMode) return demoOffers;
  const { data, error } = await db()
    .from("offers")
    .select(`
      id, application_id, status, salary, is_net, weekly_hours, start_date,
      probation_months, body_md, approved_at, sent_at, respond_by, responded_at,
      applications ( candidates ( full_name ), vacancies ( title ) ),
      creator:profiles!offers_created_by_fkey ( full_name ),
      approver:profiles!offers_approved_by_fkey ( full_name )
    `)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((o: any) => ({
    ...o,
    candidate_name: o.applications?.candidates?.full_name ?? "—",
    vacancy_title: o.applications?.vacancies?.title ?? "—",
    created_by_name: o.creator?.full_name ?? null,
    approved_by_name: o.approver?.full_name ?? null,
  }));
}

/**
 * Шаблон оффера.
 *
 * Лежит в базе: текст предложения о работе — то, что компания меняет под
 * себя, и переразвёртывать ради него приложение незачем. Таблица
 * `offer_templates` засеяна миграцией 06; если её опустошили, остаётся
 * встроенный текст — оффер нужно уметь выписать в любом случае.
 */
export async function getOfferTemplate(): Promise<string> {
  if (isDemoMode) return demo.offerTemplate;
  const { data, error } = await db()
    .from("offer_templates")
    .select("body_md")
    .eq("is_active", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.body_md as string) ?? demo.offerTemplate;
}

export async function getOfferForApplication(applicationId: string): Promise<Offer | null> {
  const all = await listOffers();
  return all.find((o) => o.application_id === applicationId) ?? null;
}

export async function createOffer(input: {
  application_id: string;
  candidate_name: string;
  vacancy_title: string;
  salary: number;
  weekly_hours: number | null;
  start_date: string;
  probation_months: number;
  body_md: string;
  respond_by: string;
  created_by_name: string;
}): Promise<string> {
  if (isDemoMode) {
    const id = `of-${Date.now()}`;
    demoOffers = [
      {
        id,
        application_id: input.application_id,
        candidate_name: input.candidate_name,
        vacancy_title: input.vacancy_title,
        status: "pending_approval",
        salary: input.salary,
        is_net: true,
        weekly_hours: input.weekly_hours,
        start_date: input.start_date,
        probation_months: input.probation_months,
        body_md: input.body_md,
        created_by_name: input.created_by_name,
        approved_by_name: null,
        approved_at: null,
        sent_at: null,
        respond_by: input.respond_by,
        responded_at: null,
      },
      ...demoOffers,
    ];
    return id;
  }
  const { data: sess } = await db().auth.getUser();
  const { data, error } = await db()
    .from("offers")
    .insert({
      application_id: input.application_id,
      status: "pending_approval",
      salary: input.salary,
      weekly_hours: input.weekly_hours,
      start_date: input.start_date,
      probation_months: input.probation_months,
      body_md: input.body_md,
      respond_by: input.respond_by,
      created_by: sess.user?.id,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function setOfferStatus(
  offerId: string,
  status: OfferStatus,
  actorName: string,
): Promise<void> {
  if (isDemoMode) {
    demoOffers = demoOffers.map((o) =>
      o.id === offerId
        ? {
            ...o,
            status,
            approved_by_name: status === "approved" ? actorName : o.approved_by_name,
            approved_at: status === "approved" ? new Date().toISOString() : o.approved_at,
            sent_at: status === "sent" ? new Date().toISOString() : o.sent_at,
            responded_at: ["accepted", "declined"].includes(status)
              ? new Date().toISOString()
              : o.responded_at,
          }
        : o,
    );
    return;
  }
  const patch: Record<string, unknown> = { status };
  if (status === "approved") patch.approved_at = new Date().toISOString();
  if (status === "sent") patch.sent_at = new Date().toISOString();
  if (status === "accepted" || status === "declined")
    patch.responded_at = new Date().toISOString();
  const { error } = await db().from("offers").update(patch).eq("id", offerId);
  if (error) throw error;
}

// ===========================================================================
// СОГЛАСОВАНИЕ И ВЕРСИИ ВАКАНСИИ (фишки 26, 27)
// ===========================================================================

let demoApprovals: VacancyApproval[] = [...demo.vacancyApprovals];

export async function listApprovals(vacancyId?: string): Promise<VacancyApproval[]> {
  if (isDemoMode) {
    return demoApprovals.filter((a) => !vacancyId || a.vacancy_id === vacancyId);
  }
  let q = db()
    .from("vacancy_approvals")
    .select("id, vacancy_id, decision, comment, decided_at, created_at, profiles ( full_name )");
  if (vacancyId) q = q.eq("vacancy_id", vacancyId);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((a: any) => ({ ...a, approver_name: a.profiles?.full_name ?? "—" }));
}

export async function decideApproval(
  approvalId: string,
  decision: "approved" | "rejected",
  comment: string,
): Promise<void> {
  if (isDemoMode) {
    demoApprovals = demoApprovals.map((a) =>
      a.id === approvalId
        ? { ...a, decision, comment: comment || null, decided_at: new Date().toISOString() }
        : a,
    );
    return;
  }
  const { error } = await db()
    .from("vacancy_approvals")
    .update({ decision, comment, decided_at: new Date().toISOString() })
    .eq("id", approvalId);
  if (error) throw error;
}

export async function listVersions(vacancyId: string): Promise<VacancyVersion[]> {
  if (isDemoMode) {
    return demo.vacancyVersions
      .filter((v) => v.vacancy_id === vacancyId)
      .sort((a, b) => b.version_no - a.version_no);
  }
  const { data, error } = await db()
    .from("vacancy_versions")
    .select("id, vacancy_id, version_no, snapshot, change_note, created_at, profiles ( full_name )")
    .eq("vacancy_id", vacancyId)
    .order("version_no", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((v: any) => ({
    id: v.id,
    vacancy_id: v.vacancy_id,
    version_no: v.version_no,
    changed_by_name: v.profiles?.full_name ?? "—",
    change_note: v.change_note,
    created_at: v.created_at,
    changes: (v.snapshot?.changes ?? []) as VacancyVersion["changes"],
  }));
}

// ===========================================================================
// ЦЕННОСТИ (топливо фишки 24) И ВОПРОСЫ ПОД РОЛЬ (фишка 28)
// ===========================================================================

let demoValues: CompanyValue[] = [...demo.companyValues];

export async function listValues(): Promise<CompanyValue[]> {
  if (isDemoMode) return demoValues;
  const { data, error } = await db()
    .from("company_values")
    .select("id, code, name, description, good_example, bad_example, is_active")
    .order("order_index");
  if (error) throw error;
  return data as CompanyValue[];
}

export async function saveValue(value: CompanyValue): Promise<void> {
  if (isDemoMode) {
    demoValues = demoValues.map((v) => (v.id === value.id ? value : v));
    return;
  }
  const { error } = await db()
    .from("company_values")
    .update({
      name: value.name,
      description: value.description,
      good_example: value.good_example,
      bad_example: value.bad_example,
      is_active: value.is_active,
    })
    .eq("id", value.id);
  if (error) throw error;
}

/**
 * Вопросы под конкретную роль. Строятся из критериев вакансии, поэтому
 * интервью проверяет ровно то, по чему потом принимается решение.
 */
export async function listQuestions(vacancyId: string) {
  const criteria = await listCriteria(vacancyId);
  return generateQuestions(vacancyId, criteria);
}

// ===========================================================================
// ДЕМО-УРОК (фишка 51)
// ===========================================================================

let checksState: PracticalCheck[] = [...demo.practicalChecks];

export async function listPracticalChecks(applicationId?: string): Promise<PracticalCheck[]> {
  if (isDemoMode) {
    return checksState.filter((d) => !applicationId || d.application_id === applicationId);
  }
  const { data, error } = await db().from("practical_checks").select(`
    id, interview_id, task, context, audience, verdict, comment,
    interviews ( application_id, scheduled_at, applications ( candidates ( full_name ) ) ),
    profiles ( full_name ),
    practical_check_scores ( id, aspect, result, comment, profiles ( full_name ) )
  `);
  if (error) throw error;
  return (data ?? [])
    .map((d: any) => ({
      id: d.id,
      interview_id: d.interview_id,
      application_id: d.interviews?.application_id ?? "",
      candidate_name: d.interviews?.applications?.candidates?.full_name ?? "—",
      task: d.task,
      context: d.context,
      audience: d.audience,
      reviewer_name: d.profiles?.full_name ?? null,
      verdict: d.verdict,
      comment: d.comment,
      scheduled_at: d.interviews?.scheduled_at ?? "",
      scores: (d.practical_check_scores ?? []).map((s: any) => ({
        id: s.id,
        aspect: s.aspect,
        result: s.result,
        comment: s.comment,
        reviewer_name: s.profiles?.full_name ?? "—",
      })),
    }))
    .filter((d: PracticalCheck) => !applicationId || d.application_id === applicationId);
}

export async function saveCheckScores(
  checkId: string,
  scores: { aspect: string; result: CriterionResult; comment: string }[],
  reviewerName: string,
  verdict: string,
  reviewerComment: string,
): Promise<void> {
  if (isDemoMode) {
    checksState = checksState.map((d) =>
      d.id === checkId
        ? {
            ...d,
            verdict,
            comment: reviewerComment || null,
            reviewer_name: reviewerName,
            scores: scores.map((s, i) => ({
              id: `${checkId}-s${i}`,
              aspect: s.aspect,
              result: s.result,
              comment: s.comment || null,
              reviewer_name: reviewerName,
            })),
          }
        : d,
    );
    return;
  }
  const { data: sess } = await db().auth.getUser();
  await db()
    .from("practical_checks")
    .update({ verdict, comment: reviewerComment, reviewer_id: sess.user?.id })
    .eq("id", checkId);
  await db().from("practical_check_scores").delete().eq("practical_check_id", checkId);
  const { error } = await db()
    .from("practical_check_scores")
    .insert(
      scores.map((s) => ({
        practical_check_id: checkId,
        reviewer_id: sess.user?.id,
        aspect: s.aspect,
        result: s.result,
        comment: s.comment,
      })),
    );
  if (error) throw error;
}

// ===========================================================================
// СОГЛАСИЯ И ПРАВО НА ЗАБВЕНИЕ (фишки 61, 62)
// ===========================================================================

let demoConsents: Consent[] = [...demo.consents];

export async function listConsents(candidateId?: string): Promise<Consent[]> {
  if (isDemoMode) {
    return demoConsents
      .filter((c) => !candidateId || c.candidate_id === candidateId)
      .sort((a, b) => (b.granted_at ?? "").localeCompare(a.granted_at ?? ""));
  }
  let q = db()
    .from("consents")
    .select(
      "id, candidate_id, kind, granted_at, revoked_at, text_version, evidence, candidates ( full_name )",
    );
  if (candidateId) q = q.eq("candidate_id", candidateId);
  const { data, error } = await q.order("granted_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((c: any) => ({
    ...c,
    candidate_name: c.candidates?.full_name ?? "—",
    source: c.evidence?.source ?? "—",
  }));
}

/** Отзыв в один клик. Не опция, а условие, без которого базу нельзя хранить. */
export async function revokeConsent(consentId: string): Promise<void> {
  if (isDemoMode) {
    demoConsents = demoConsents.map((c) =>
      c.id === consentId ? { ...c, revoked_at: new Date().toISOString() } : c,
    );
    return;
  }
  const { error } = await db()
    .from("consents")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", consentId);
  if (error) throw error;
}

export async function requestDeletion(candidateId: string): Promise<void> {
  if (isDemoMode) {
    demoConsents = demoConsents.map((c) =>
      c.candidate_id === candidateId ? { ...c, revoked_at: new Date().toISOString() } : c,
    );
    return;
  }
  const { error } = await db().from("deletion_requests").insert({ candidate_id: candidateId });
  if (error) throw error;
}

// ===========================================================================
// ПОДМЕНЫ (фишка 55) И РЕФЕРАЛЫ (фишка 60)
// ===========================================================================

let demoReferrals: Referral[] = [...demo.referrals];

export async function listUrgentNeeds(): Promise<UrgentNeed[]> {
  if (isDemoMode) return demo.urgentNeeds;
  const { data, error } = await db()
    .from("urgent_needs")
    .select(
      "id, role, needed_on, hours, rate, status, departments ( name ), candidates ( full_name )",
    )
    .order("needed_on");
  if (error) throw error;
  return (data ?? []).map((s: any) => ({
    ...s,
    department_name: s.departments?.name ?? "—",
    filled_by_name: s.candidates?.full_name ?? null,
  }));
}

export async function listReferrals(): Promise<Referral[]> {
  if (isDemoMode) return demoReferrals;
  const { data, error } = await db()
    .from("referrals")
    .select(
      "id, status, bonus_amount, created_at, referrer:profiles ( full_name ), referred:candidates ( full_name ), vacancies ( title )",
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    referrer_name: r.referrer?.full_name ?? "—",
    referred_name: r.referred?.full_name ?? "—",
    vacancy_title: r.vacancies?.title ?? null,
    status: r.status,
    bonus_amount: r.bonus_amount,
    created_at: r.created_at,
  }));
}

/**
 * Рекомендация знакомого (фишка 60).
 *
 * В базе это одна функция `submit_referral`: завести кандидата обычный
 * сотрудник по политикам не может — и не должен, иначе базу пополняет кто
 * угодно чем угодно. Функция делает три шага от имени владельца: находит
 * или заводит кандидата по контакту, вешает реферала на вошедшего и
 * сохраняет объяснение заметкой в карточке. Миграция sql/15_referrals.sql.
 */
export async function createReferral(input: {
  referrer_name: string;
  referred_name: string;
  contact: string;
  why?: string | null;
  vacancy_title: string | null;
}): Promise<void> {
  if (isDemoMode) {
    demoReferrals = [
      {
        id: `rf-${Date.now()}`,
        referrer_name: input.referrer_name,
        referred_name: input.referred_name,
        vacancy_title: input.vacancy_title,
        status: "submitted",
        bonus_amount: 15000,
        created_at: new Date().toISOString(),
      },
      ...demoReferrals,
    ];
    return;
  }
  const { error } = await db().rpc("submit_referral", {
    _name: input.referred_name,
    _contact: input.contact,
    _why: input.why ?? null,
    _vacancy_title: input.vacancy_title,
  });
  if (error) throw new Error(error.message);
}

// ===========================================================================
// ПОДБОР ИЗ АРХИВА (фишка 9)
// «ИИ сам приносит пятерых из базы под новую вакансию» — мечта HR.
// ===========================================================================

export async function getArchiveMatches(vacancyId: string, limit = 5): Promise<ArchiveMatch[]> {
  const [vacancy, criteria, candidates, applications, reasons] = await Promise.all([
    getVacancy(vacancyId),
    listCriteria(vacancyId),
    listCandidates(),
    listApplications(),
    listRejectionReasons(),
  ]);
  if (!vacancy) return [];

  // Кому нельзя писать прямо сейчас — считаем один раз, а не в цикле
  const touchBlocked = new Set<string>();
  await Promise.all(
    candidates.map(async (c) => {
      const ok = await canTouchCandidate(c.id);
      if (!ok) touchBlocked.add(c.id);
    }),
  );

  return matchFromArchive(
    { vacancy, criteria, candidates, applications, reasons, touchBlocked },
    limit,
  );
}

// ===========================================================================
// ЗАРПЛАТНАЯ АНАЛИТИКА (фишка 23)
// Разговор с руководителем на языке денег: вилка X, рынок Y, переплата Z.
// ===========================================================================

export async function getSalaryGaps(): Promise<SalaryGap[]> {
  const [applications, vacancies] = await Promise.all([listApplications(), listVacancies()]);
  return applications
    .filter((a) => a.status === "active" && a.expected_salary)
    .map((a) => {
      const v = vacancies.find((x) => x.id === a.vacancy_id);
      const c = v?.compensation ?? null;
      return {
        application_id: a.id,
        candidate_name: a.candidate_name,
        vacancy_title: a.vacancy_title,
        expected: a.expected_salary,
        band_min: c?.salary_min ?? null,
        band_max: c?.salary_max ?? null,
        market_p50: c?.market_p50 ?? null,
        over_band:
          c?.salary_max != null && a.expected_salary != null
            ? a.expected_salary - c.salary_max
            : null,
        over_market:
          c?.market_p50 != null && a.expected_salary != null
            ? a.expected_salary - c.market_p50
            : null,
      };
    })
    .sort((a, b) => (b.over_band ?? -1e9) - (a.over_band ?? -1e9));
}

// ===========================================================================
// ПРИЧИНЫ ОТСЕВА (фишка 48)
// ===========================================================================

export async function getRejectionBreakdown(): Promise<
  { reason: string; segment: string; count: number }[]
> {
  const [applications, reasons] = await Promise.all([
    listApplications(),
    listRejectionReasons(),
  ]);
  const map = new Map<string, { reason: string; segment: string; count: number }>();
  applications
    .filter((a) => a.status === "rejected" && a.rejection_reason_id)
    .forEach((a) => {
      const r = reasons.find((x) => x.id === a.rejection_reason_id);
      if (!r) return;
      const cur = map.get(r.id) ?? { reason: r.name, segment: r.segment, count: 0 };
      cur.count += 1;
      map.set(r.id, cur);
    });
  return [...map.values()].sort((a, b) => b.count - a.count);
}

// ===========================================================================
// ДЕЙСТВИЯ ПО ОТКЛИКУ
// ===========================================================================

/**
 * Мнение команды о кандидате прямо в карточке отклика (фишка 38).
 * «Мнение о кандидате никто не спрашивает» — боль сотрудников.
 */
export async function addTeamOpinion(
  applicationId: string,
  verdict: "yes" | "doubt" | "no",
  comment: string,
  authorName: string,
): Promise<void> {
  if (isDemoMode) {
    const existing = demo.teamOpinions.findIndex(
      (o) => o.application_id === applicationId && o.author_name === authorName,
    );
    const row = {
      id: existing >= 0 ? demo.teamOpinions[existing].id : `to-${Date.now()}`,
      application_id: applicationId,
      author_name: authorName,
      verdict,
      comment: comment || null,
      created_at: new Date().toISOString(),
    };
    if (existing >= 0) demo.teamOpinions[existing] = row;
    else demo.teamOpinions.push(row);
    return;
  }
  const { data: sess } = await db().auth.getUser();
  const { error } = await db()
    .from("team_opinions")
    .upsert({ application_id: applicationId, author_id: sess.user?.id, verdict, comment });
  if (error) throw error;
}

/**
 * Стоп-лист (фишка 7). Явная сущность с причиной и датой, а не тег:
 * при новом отклике система предупредит HR сама.
 */
export async function setBlacklist(
  candidateId: string,
  value: boolean,
  reason: string,
): Promise<void> {
  if (isDemoMode) {
    const c = demo.candidates.find((x) => x.id === candidateId);
    if (c) {
      c.is_blacklisted = value;
      c.blacklist_reason = value ? reason : null;
    }
    return;
  }
  const { error } = await db()
    .from("candidates")
    .update({
      is_blacklisted: value,
      blacklist_reason: value ? reason : null,
      blacklisted_at: value ? new Date().toISOString() : null,
    })
    .eq("id", candidateId);
  if (error) throw error;
}

/**
 * Документы для оформления (фишка 50).
 *
 * Перевод на оффер блокируется, пока не закрыты документы, обязательные
 * именно для этой вакансии. Их список задаётся в вакансии: у разработчика,
 * бухгалтера и водителя он разный. Узнать о нехватке в день выхода —
 * значит потерять и человека, и месяц.
 */
export async function checkAdmission(
  candidateId: string,
  vacancyId?: string,
): Promise<{ ok: boolean; missing: string[] }> {
  const docs = await listDocuments(candidateId);

  // Какие документы обязательны — решает вакансия, а не зашитый список:
  // у курьера, бухгалтера и разработчика он разный.
  let required: DocumentKind[] = ["passport", "snils", "inn"];
  if (vacancyId) {
    const v = await getVacancy(vacancyId);
    if (v?.required_documents?.length) required = v.required_documents;
  }

  const missing = required
    .filter((kind) => {
      const d = docs.find((x) => x.kind === kind);
      return !d || !["valid", "expiring"].includes(d.state);
    })
    .map((kind) => DOCUMENT_LABEL[kind].toLowerCase());

  return { ok: missing.length === 0, missing };
}

/**
 * Автодействия этапа (фишка 10): при переходе задание выдаётся само.
 * Закрывает боль HR «тестовое приходится отправлять вручную».
 */
const STAGE_AUTO_ASSESSMENT: Record<string, { code: string; name: string; kind: string }> = {
  s2: { code: "test_15min", name: "Короткий тест на 15 минут", kind: "test" },
  s4: { code: "case_incident", name: "Кейс: разбор инцидента", kind: "case" },
};

export async function runStageAutoActions(
  applicationId: string,
  stageId: string,
): Promise<string[]> {
  const done: string[] = [];
  const tpl = STAGE_AUTO_ASSESSMENT[stageId];
  if (!tpl) return done;

  if (isDemoMode) {
    const already = demo.assessments.some(
      (a) => a.application_id === applicationId && a.template_name === tpl.name,
    );
    if (!already) {
      demo.assessments.push({
        id: `as-${Date.now()}`,
        application_id: applicationId,
        template_name: tpl.name,
        kind: tpl.kind,
        status: "assigned",
        assigned_at: new Date().toISOString(),
        submitted_at: null,
        verdict: null,
        feedback_internal: null,
        feedback_for_candidate: null,
      });
      done.push(`Выдано задание «${tpl.name}»`);
    }
    return done;
  }

  const { data: template } = await db()
    .from("assessment_templates")
    .select("id")
    .eq("code", tpl.code)
    .maybeSingle();
  if (!template) return done;
  const { error } = await db()
    .from("assessments")
    .insert({ application_id: applicationId, template_id: template.id, is_auto_assigned: true });
  if (!error) done.push(`Выдано задание «${tpl.name}»`);
  return done;
}

/**
 * Напоминание ответственному (фишки 13, 40). Через сутки молчания —
 * напоминание, через двое — эскалация выше.
 */
export async function nudgeResponsible(applicationId: string): Promise<string> {
  const app = await getApplication(applicationId);
  if (!app) return "Отклик не найден";
  if (isDemoMode) {
    return "Напоминание отправлено. Если решения не будет ещё сутки, уйдёт эскалация выше.";
  }
  const { error } = await db().from("notifications").insert({
    kind: "sla_warning",
    title: `${app.candidate_name} ждёт решения`,
    body: "Кандидат уходит к тому, кто ответил первым.",
    entity_kind: "application",
    entity_id: applicationId,
  });
  if (error) throw error;
  return "Напоминание отправлено";
}

/**
 * Итог звонка (обзвон на экране «Все люди»).
 *
 * Интерфейс обещает, что результат сохранится в карточке — значит, он
 * обязан там оказаться. Иначе обзвон превращается в блокнот на коленке,
 * а история общения, ради которой всё затевалось, снова теряется.
 */
export async function logCall(
  candidateId: string,
  applicationId: string | null,
  result: string,
  note: string,
  authorName: string,
): Promise<void> {
  const body = note.trim() ? `Звонок: ${result}. ${note.trim()}` : `Звонок: ${result}`;

  if (isDemoMode) {
    demo.notes.unshift({
      id: `n-call-${Date.now()}-${candidateId}`,
      candidate_id: candidateId,
      application_id: applicationId,
      author_name: authorName,
      body,
      visibility: "hiring_team",
      is_ai: false,
      created_at: new Date().toISOString(),
    });
    const c = demo.candidates.find((x) => x.id === candidateId);
    if (c) c.last_activity_at = new Date().toISOString();

    // Звонок — это касание. Он идёт в тот же счётчик, что и сообщения,
    // иначе лимит антиспама можно обойти телефоном.
    demoTouches.push({ candidateId, at: Date.now() });
    return;
  }

  const { data: sess } = await db().auth.getUser();
  const { error } = await db().from("candidate_notes").insert({
    candidate_id: candidateId,
    application_id: applicationId,
    author_id: sess.user?.id,
    body,
    visibility: "hiring_team",
  });
  if (error) throw error;

  await db().from("candidate_touches").insert({
    candidate_id: candidateId,
    channel: "phone",
    kind: "call",
    application_id: applicationId,
  });
}

// ===========================================================================
// ЖИЗНЬ ПОСЛЕ НАЙМА
//
// Найм заканчивался этапом «Вышел». Дальше тишина — хотя именно там видно,
// тех ли мы брали. Оценка на испытательном по тем же критериям, что были
// на отборе, превращает качество найма из мнения в цифру.
// ===========================================================================

export async function listEmployees(): Promise<Employee[]> {
  if (isDemoMode) return [...demo.employees];
  const { data, error } = await db()
    .from("employees")
    .select(`
      id, candidate_id, application_id, position_title, status,
      hired_on, probation_ends_on,
      candidates ( full_name ),
      departments ( name ),
      mentor:profiles!employees_mentor_id_fkey ( full_name ),
      manager:profiles!employees_line_manager_id_fkey ( full_name )
    `)
    .order("hired_on", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((e: any) => ({
    id: e.id,
    candidate_id: e.candidate_id,
    application_id: e.application_id,
    full_name: e.candidates?.full_name ?? "Сотрудник",
    position_title: e.position_title,
    department_name: e.departments?.name ?? null,
    status: e.status,
    hired_on: e.hired_on,
    probation_ends_on: e.probation_ends_on,
    mentor_name: e.mentor?.full_name ?? null,
    line_manager_name: e.manager?.full_name ?? null,
    days_worked: Math.max(
      0,
      Math.floor((Date.now() - new Date(e.hired_on).getTime()) / 86_400_000),
    ),
  }));
}

export async function listOnboardingTasks(employeeId: string): Promise<OnboardingTask[]> {
  if (isDemoMode) {
    return demo.onboardingTasks.filter((t: any) => t.employee_id === employeeId);
  }
  const { data, error } = await db()
    .from("onboarding_tasks")
    .select("id, horizon, title, description, due_on, done_at, order_index, onboarding_plans!inner ( employee_id )")
    .eq("onboarding_plans.employee_id", employeeId)
    .order("horizon")
    .order("order_index");
  if (error) throw error;
  return (data ?? []) as unknown as OnboardingTask[];
}

export async function toggleOnboardingTask(taskId: string, done: boolean): Promise<void> {
  const at = done ? new Date().toISOString() : null;
  if (isDemoMode) {
    const t = demo.onboardingTasks.find((x: any) => x.id === taskId);
    if (t) t.done_at = at;
    return;
  }
  const { error } = await db().from("onboarding_tasks").update({ done_at: at }).eq("id", taskId);
  if (error) throw error;
}

export async function getIdpPlan(employeeId: string): Promise<IdpPlan | null> {
  if (isDemoMode) return demo.idpPlans.find((p: any) => p.employee_id === employeeId) ?? null;
  const { data, error } = await db()
    .from("idp_plans")
    .select(`
      id, goal, horizon_months, is_ai_generated, created_at,
      idp_items ( id, what_to_learn, where_to_learn, expected_result, why, due_on, done_at, order_index )
    `)
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as any;
  return {
    id: row.id, goal: row.goal, horizon_months: row.horizon_months,
    is_ai_generated: row.is_ai_generated, created_at: row.created_at,
    items: (row.idp_items ?? []).sort((a: any, b: any) => a.order_index - b.order_index),
  };
}

export async function saveIdpPlan(
  employeeId: string,
  goal: string,
  horizonMonths: number,
  items: { what_to_learn: string; where_to_learn: string; expected_result: string; why: string }[],
): Promise<void> {
  if (isDemoMode) {
    const plan: any = {
      id: `idp-${Date.now()}`, employee_id: employeeId, goal,
      horizon_months: horizonMonths, is_ai_generated: false,
      created_at: new Date().toISOString(),
      items: items.map((it, i) => ({ id: `idpi-${Date.now()}-${i}`, ...it, due_on: null, done_at: null })),
    };
    const ix = demo.idpPlans.findIndex((p: any) => p.employee_id === employeeId);
    if (ix >= 0) demo.idpPlans[ix] = plan;
    else demo.idpPlans.push(plan);
    return;
  }
  const { data: plan, error } = await db()
    .from("idp_plans")
    .insert({ employee_id: employeeId, goal, horizon_months: horizonMonths, is_ai_generated: false })
    .select("id")
    .single();
  if (error) throw error;
  if (items.length) {
    await db().from("idp_items").insert(
      items.map((it, i) => ({ plan_id: plan.id, ...it, order_index: i })),
    );
  }
}

export async function toggleIdpItem(itemId: string, done: boolean): Promise<void> {
  const at = done ? new Date().toISOString() : null;
  if (isDemoMode) {
    for (const p of demo.idpPlans as any[]) {
      const it = p.items.find((x: any) => x.id === itemId);
      if (it) it.done_at = at;
    }
    return;
  }
  const { error } = await db().from("idp_items").update({ done_at: at }).eq("id", itemId);
  if (error) throw error;
}

/**
 * Оценка на испытательном (фишка 59).
 *
 * По тем же критериям, по которым отбирали. В этом весь смысл: если на
 * отборе критерий стоял «закрыт», а через два месяца «не закрыт» — вопрос
 * не к сотруднику, а к тому, чем мы этот критерий проверяли.
 */
export async function listProbationReviews(employeeId: string): Promise<ProbationReview[]> {
  if (isDemoMode) return demo.probationReviews.filter((r: any) => r.employee_id === employeeId);
  const { data, error } = await db()
    .from("probation_reviews")
    .select(`
      id, checkpoint, criterion_id, result, comment, created_at,
      vacancy_criteria ( name ), profiles ( full_name )
    `)
    .eq("employee_id", employeeId)
    .order("checkpoint");
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id, checkpoint: r.checkpoint, criterion_id: r.criterion_id,
    criterion_name: r.vacancy_criteria?.name ?? null,
    result: r.result, comment: r.comment,
    reviewer_name: r.profiles?.full_name ?? null,
    created_at: r.created_at,
  }));
}

export async function saveProbationReview(
  employeeId: string,
  checkpoint: number,
  rows: { criterion_id: string | null; criterion_name: string | null; result: CriterionResult; comment: string }[],
): Promise<void> {
  if (isDemoMode) {
    for (const r of rows) {
      (demo.probationReviews as any[]).push({
        id: `pr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        employee_id: employeeId, checkpoint,
        criterion_id: r.criterion_id, criterion_name: r.criterion_name,
        result: r.result, comment: r.comment,
        reviewer_name: "Вы", created_at: new Date().toISOString(),
      });
    }
    return;
  }
  const { data: sess } = await db().auth.getUser();
  const { error } = await db().from("probation_reviews").insert(
    rows.map((r) => ({
      employee_id: employeeId, reviewer_id: sess.user?.id, checkpoint,
      criterion_id: r.criterion_id, result: r.result, comment: r.comment || null,
    })),
  );
  if (error) throw error;
}

/** Оценка качества найма заказчиком через 1, 3 и 6 месяцев (фишка 43). */
export async function listSatisfaction(employeeId: string): Promise<HiringSatisfaction[]> {
  if (isDemoMode) return demo.satisfaction.filter((s: any) => s.employee_id === employeeId);
  const { data, error } = await db()
    .from("hiring_satisfaction")
    .select("id, month_mark, score, would_hire_again, comment, created_at, profiles ( full_name )")
    .eq("employee_id", employeeId)
    .order("month_mark");
  if (error) throw error;
  return (data ?? []).map((s: any) => ({
    id: s.id, month_mark: s.month_mark, score: s.score,
    would_hire_again: s.would_hire_again, comment: s.comment,
    manager_name: s.profiles?.full_name ?? null, created_at: s.created_at,
  }));
}

export async function saveSatisfaction(
  employeeId: string,
  monthMark: number,
  score: number,
  wouldHireAgain: boolean,
  comment: string,
): Promise<void> {
  if (isDemoMode) {
    (demo.satisfaction as any[]).push({
      id: `hs-${Date.now()}`, employee_id: employeeId, month_mark: monthMark,
      score, would_hire_again: wouldHireAgain, comment,
      manager_name: "Вы", created_at: new Date().toISOString(),
    });
    return;
  }
  const { data: sess } = await db().auth.getUser();
  const { error } = await db().from("hiring_satisfaction").upsert(
    {
      employee_id: employeeId, manager_id: sess.user?.id, month_mark: monthMark,
      score, would_hire_again: wouldHireAgain, comment: comment || null,
    },
    { onConflict: "employee_id,manager_id,month_mark" },
  );
  if (error) throw error;
}

/** Что назрело по календарю: контрольные точки и опросы руководителя. */
export async function listCheckpoints(): Promise<PeopleCheckpoint[]> {
  if (isDemoMode) return demo.checkpoints;
  const { data, error } = await db()
    .from("v_people_checkpoints")
    .select("*")
    .order("due_on");
  if (error) throw error;
  return (data ?? []) as PeopleCheckpoint[];
}

/**
 * База материалов (фишка 58).
 *
 * Возражение «материалы устареют, никто их не обновит» снимается не
 * обещанием, а механикой: у каждого есть владелец и срок пересмотра.
 * Просроченные видны сразу и первыми.
 */
function isStale(actualized: string, everyDays: number): boolean {
  return Date.now() - new Date(actualized).getTime() > everyDays * 86_400_000;
}

export async function listMaterials(): Promise<LearningMaterial[]> {
  if (isDemoMode) {
    return demo.materials.map((m: any) => ({
      ...m, is_stale: isStale(m.actualized_on, m.review_every_days),
    }));
  }
  const { data, error } = await db()
    .from("learning_materials")
    .select("id, title, url, body_md, actualized_on, review_every_days, tags, profiles ( full_name )")
    .eq("is_active", true)
    .order("actualized_on");
  if (error) throw error;
  return (data ?? []).map((m: any) => ({
    id: m.id, title: m.title, url: m.url, body_md: m.body_md,
    owner_name: m.profiles?.full_name ?? null,
    actualized_on: m.actualized_on, review_every_days: m.review_every_days,
    tags: m.tags ?? [],
    is_stale: isStale(m.actualized_on, m.review_every_days),
  }));
}

export async function saveMaterial(input: {
  title: string; url: string; tags: string[]; reviewEveryDays: number;
}): Promise<void> {
  if (isDemoMode) {
    (demo.materials as any[]).unshift({
      id: `lm-${Date.now()}`, title: input.title, url: input.url || null, body_md: null,
      owner_name: "Вы", actualized_on: new Date().toISOString().slice(0, 10),
      review_every_days: input.reviewEveryDays, tags: input.tags, is_stale: false,
    });
    return;
  }
  const { data: sess } = await db().auth.getUser();
  const { error } = await db().from("learning_materials").insert({
    title: input.title, url: input.url || null, owner_id: sess.user?.id,
    tags: input.tags, review_every_days: input.reviewEveryDays,
  });
  if (error) throw error;
}

/** Подтвердить, что материал ещё актуален: сдвигает срок пересмотра. */
export async function actualizeMaterial(id: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  if (isDemoMode) {
    const m = demo.materials.find((x: any) => x.id === id);
    if (m) m.actualized_on = today;
    return;
  }
  const { error } = await db()
    .from("learning_materials")
    .update({ actualized_on: today })
    .eq("id", id);
  if (error) throw error;
}

/** Наставничество: видно и учитывается (фишка 57). */
export async function listMentorships(): Promise<Mentorship[]> {
  if (isDemoMode) return demo.mentorships;
  const { data, error } = await db()
    .from("mentorships")
    .select(`
      id, started_on, ended_on, hours_logged, bonus_amount, bonus_paid_at,
      profiles ( full_name ),
      employees ( candidates ( full_name ) )
    `)
    .order("started_on", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((m: any) => ({
    id: m.id,
    mentor_name: m.profiles?.full_name ?? "—",
    employee_name: m.employees?.candidates?.full_name ?? "—",
    started_on: m.started_on, ended_on: m.ended_on,
    hours_logged: Number(m.hours_logged ?? 0),
    bonus_amount: Number(m.bonus_amount ?? 0),
    bonus_paid_at: m.bonus_paid_at,
  }));
}

/** Сезонность найма по месяцам (фишка 54). */
export async function getSeasonality(): Promise<SeasonalityRow[]> {
  if (isDemoMode) return demo.seasonality;
  const { data, error } = await db()
    .from("v_hiring_seasonality")
    .select("*")
    .order("month_no");
  if (error) throw error;
  return (data ?? []) as SeasonalityRow[];
}

/**
 * Экспорт своих данных (фишка 63).
 *
 * Право на переносимость — не только буква закона. Человек, который видит,
 * что именно о нём хранят, охотнее соглашается это отдать. Собираем всё,
 * что с ним связано, в один файл.
 */
export async function exportMyData(candidateId: string): Promise<Record<string, unknown>> {
  if (isDemoMode) {
    const c = demo.candidates.find((x) => x.id === candidateId);
    const myConvIds = demo.conversations
      .filter((cv) => cv.candidate_id === candidateId)
      .map((cv) => cv.id);
    return {
      выгружено: new Date().toISOString(),
      профиль: c ?? null,
      отклики: demo.applications.filter((a) => a.candidate_id === candidateId),
      переписка: demoMessages.filter((m) => myConvIds.includes(m.conversation_id)),
      документы: demo.documents.filter((d) => d.candidate_id === candidateId),
    };
  }

  const [profile, applications, conversations, documents, consents] = await Promise.all([
    db().from("candidates").select("*").eq("id", candidateId).maybeSingle(),
    db().from("applications").select("*, vacancies ( title )").eq("candidate_id", candidateId),
    db().from("conversations").select("id").eq("candidate_id", candidateId),
    db().from("candidate_documents").select("kind, state, issued_on, expires_on").eq("candidate_id", candidateId),
    db().from("consents").select("kind, granted_at, revoked_at, text_version").eq("candidate_id", candidateId),
  ]);

  const convIds = (conversations.data ?? []).map((c: any) => c.id);
  const messages = convIds.length
    ? await db().from("messages").select("direction, author_kind, body, sent_at").in("conversation_id", convIds)
    : { data: [] };

  // Служебные поля наружу не отдаём: поисковый вектор и индекс человеку
  // ничего не говорят, а файл раздувают.
  const raw = (profile.data ?? {}) as any;
  delete raw.embedding;
  delete raw.search_tsv;

  return {
    выгружено: new Date().toISOString(),
    профиль: raw,
    отклики: applications.data ?? [],
    переписка: messages.data ?? [],
    документы: documents.data ?? [],
    согласия: consents.data ?? [],
  };
}

// ===========================================================================
// HH.RU (фишка 30)
//
// Вакансия заводится один раз — здесь, — и уходит на hh кнопкой. Отклики
// приходят обратно в ту же воронку. Рекрутер перестаёт вести две системы.
//
// Токены доступа сюда не попадают: они живут в базе под RLS, а операции
// выполняют серверные функции.
// ===========================================================================

export interface HhAccount {
  id: string;
  employer_id: string | null;
  employer_name: string | null;
  manager_name: string | null;
  is_active: boolean;
  last_error: string | null;
  last_sync_at: string | null;
  token_valid: boolean;
  expires_at: string;
  published_count: number;
  created_at: string;
}

export interface VacancyPublication {
  id: string;
  vacancy_id: string;
  board: string;
  external_id: string | null;
  external_url: string | null;
  published_at: string | null;
  archived_at: string | null;
  sync_error: string | null;
  last_sync_at: string | null;
}

export async function listHhAccounts(): Promise<HhAccount[]> {
  if (isDemoMode) return [];
  const { data, error } = await db()
    .from("v_hh_accounts")
    .select("*")
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as HhAccount[];
}

async function callHh(fn: string, body: Record<string, unknown>) {
  const { data, error } = await db().functions.invoke(fn, { body });
  if (error) {
    const detail = (data as any)?.error ?? error.message;
    throw new Error(detail);
  }
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as any;
}

/** Ссылка, по которой человек разрешает доступ к своему работодателю. */
export async function startHhConnect(): Promise<string> {
  if (isDemoMode) throw new Error("В демо-режиме подключить hh нельзя: нужна база.");
  const r = await callHh("hh-oauth", { action: "start" });
  return r.url;
}

/** Обмен кода на доступ. Вызывается страницей возврата после авторизации. */
export async function finishHhConnect(code: string, state: string | null) {
  return callHh("hh-oauth", { action: "callback", code, state });
}

export async function removeHhAccount(accountId: string) {
  return callHh("hh-oauth", { action: "remove", account_id: accountId });
}

export async function listPublications(vacancyId: string): Promise<VacancyPublication[]> {
  if (isDemoMode) return [];
  const { data, error } = await db()
    .from("vacancy_publications")
    .select("id, vacancy_id, board, external_id, external_url, published_at, archived_at, sync_error, last_sync_at")
    .eq("vacancy_id", vacancyId);
  if (error) throw error;
  return (data ?? []) as VacancyPublication[];
}

export async function publishToHh(vacancyId: string, billingType = "standard") {
  return callHh("hh-publish", { action: "publish", vacancy_id: vacancyId, billing_type: billingType });
}

export async function updateOnHh(vacancyId: string) {
  return callHh("hh-publish", { action: "update", vacancy_id: vacancyId });
}

export async function archiveOnHh(vacancyId: string) {
  return callHh("hh-publish", { action: "archive", vacancy_id: vacancyId });
}

/** Забрать новые отклики. Возвращает, сколько завелось. */
export async function syncHh(): Promise<{ новых: number; просмотрено: number; проблемы?: string[] }> {
  return callHh("hh-sync", {});
}

// ===========================================================================
// ФАЙЛЫ
//
// Хранилище закрытое: прямых ссылок на файлы не существует. Чтобы открыть
// скан, система выписывает временную ссылку — и выписывает её только тому,
// кому база и так разрешает видеть карточку. Права проверяются в двух местах
// сразу: политика на строке документа и политика на самом объекте.
// ===========================================================================

const DOCS_BUCKET = "candidate-docs";

/**
 * Кладёт файл к документу кандидата.
 *
 * Путь начинается с id кандидата — по первой папке хранилище и определяет
 * права. Имя файла заменяется на случайное: в исходном бывают пробелы,
 * кириллица и нередко фамилия человека, а имя объекта видно в ссылке.
 * Настоящее имя сохраняем отдельным полем и показываем его в интерфейсе.
 */
export async function uploadCandidateDocument(
  candidateId: string,
  kind: DocumentKind,
  file: File,
): Promise<void> {
  if (isDemoMode) {
    throw new Error("В демо-режиме файлы не загружаются: для них нужно хранилище.");
  }

  const ext = (file.name.split(".").pop() ?? "bin")
    .toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
  const path = `${candidateId}/${kind}/${crypto.randomUUID()}.${ext}`;

  // Что лежало раньше — узнаём до загрузки: после upsert строка уже другая,
  // и старый файл остался бы в хранилище навсегда.
  const { data: prev } = await db()
    .from("candidate_documents")
    .select("storage_path")
    .eq("candidate_id", candidateId)
    .eq("kind", kind)
    .maybeSingle();

  const { error: upErr } = await db().storage
    .from(DOCS_BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (upErr) throw upErr;

  const userId = (await db().auth.getUser()).data.user?.id ?? null;

  const { error } = await db().from("candidate_documents").upsert(
    {
      candidate_id: candidateId,
      kind,
      storage_path: path,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || null,
      uploaded_by: userId,
      uploaded_at: new Date().toISOString(),
      // Состояние не задаём: его считает триггер. Новый файл — «на проверке»,
      // пока кадровик не подтвердил.
      verified_by: null,
      verified_at: null,
    },
    { onConflict: "candidate_id,kind" },
  );

  if (error) {
    // Строка не записалась — файл в хранилище не нужен: иначе он останется
    // висеть без карточки, и никто уже не узнает, чей он.
    await db().storage.from(DOCS_BUCKET).remove([path]);
    throw error;
  }

  if (prev?.storage_path && prev.storage_path !== path) {
    await db().storage.from(DOCS_BUCKET).remove([prev.storage_path]);
  }
}

/**
 * Временная ссылка на файл. Живёт минуту — этого хватает, чтобы открыть,
 * и мало, чтобы переслать в чужой чат «на посмотреть».
 */
export async function documentFileUrl(storagePath: string): Promise<string> {
  if (isDemoMode) throw new Error("В демо-режиме файлов нет.");
  const { data, error } = await db().storage
    .from(DOCS_BUCKET)
    .createSignedUrl(storagePath, 60);
  if (error) throw error;
  return data.signedUrl;
}

/** Убрать файл, оставив саму отметку: документ снова «не загружен». */
export async function removeCandidateDocumentFile(documentId: string, storagePath: string) {
  if (isDemoMode) throw new Error("В демо-режиме файлов нет.");

  const { error } = await db().from("candidate_documents").update({
    storage_path: null, file_name: null, file_size: null, mime_type: null,
    verified_by: null, verified_at: null,
  }).eq("id", documentId);
  if (error) throw error;

  await db().storage.from(DOCS_BUCKET).remove([storagePath]);
}

/**
 * Кадровик подтверждает документ. Состояние после этого посчитает база:
 * бессрочный станет «в порядке», истекающий через месяц — «истекает».
 * Поэтому здесь проставляется только факт проверки, а не сам статус.
 */
export async function verifyCandidateDocument(documentId: string, expiresOn?: string | null) {
  if (isDemoMode) throw new Error("В демо-режиме документы не проверяются.");
  const userId = (await db().auth.getUser()).data.user?.id ?? null;
  const patch: Record<string, unknown> = {
    verified_by: userId,
    verified_at: new Date().toISOString(),
  };
  if (expiresOn !== undefined) patch.expires_on = expiresOn;

  const { error } = await db().from("candidate_documents").update(patch).eq("id", documentId);
  if (error) throw error;
}

/** Заводит пустую отметку под документ, которого ещё нет в списке. */
export async function addCandidateDocument(candidateId: string, kind: DocumentKind) {
  if (isDemoMode) throw new Error("В демо-режиме документы не заводятся.");
  const { error } = await db().from("candidate_documents")
    .upsert({ candidate_id: candidateId, kind }, { onConflict: "candidate_id,kind" });
  if (error) throw error;
}

/**
 * Просит убрать файлы, помеченные к удалению.
 *
 * Обезличивание кандидата ставит его файлы в очередь: удалять из хранилища
 * прямо из базы платформа не даёт, и правильно делает — строку убрать легко,
 * а байты остались бы навсегда. Очередь разбирает серверная функция.
 *
 * Зовём молча при входе кадровика. Право на забвение не должно зависеть от
 * того, вспомнил ли кто-то нажать кнопку.
 */
export async function purgeQueuedFiles(): Promise<{ убрано: number; осталось: number }> {
  if (isDemoMode) return { убрано: 0, осталось: 0 };
  const { data, error } = await db().functions.invoke("storage-purge", { body: {} });
  if (error) throw error;
  return data;
}
