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
import type {
  AppRole, Application, Assessment, Candidate, CandidateDocument,
  Conversation, CriteriaResult, DashboardStats, FunnelRow, Interview,
  Message, Note, PipelineStage, Profile, RejectionReason, Requisition,
  SlaBreach, TeamOpinion, Vacancy, VacancyCriterion,
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

export async function listStages(pipelineId = "p1"): Promise<PipelineStage[]> {
  if (isDemoMode) return demo.stages.filter((s) => s.pipeline_id === pipelineId);
  const { data, error } = await db()
    .from("pipeline_stages")
    .select("id, pipeline_id, code, name, order_index, color_token, sla_hours, is_terminal")
    .eq("pipeline_id", pipelineId)
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
      subject, grades, city, weekly_hours, description, first_month_reality,
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
    subject: row.subject, grades: row.grades, city: row.city,
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
let demoApplications: Application[] = [...demo.applications];

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
      candidates ( full_name, teacher_profiles ( subjects ) ),
      vacancies ( title, grades )
    `);
  if (vacancyId) q = q.eq("vacancy_id", vacancyId);
  const { data, error } = await q.order("applied_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapApplication);
}

function mapApplication(row: any): Application {
  const subject = row.candidates?.teacher_profiles?.subjects?.[0];
  const grades = row.vacancies?.grades;
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
    subtitle: [subject, grades].filter(Boolean).join(" · ") || null,
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
  if (isDemoMode) {
    const q = query.trim().toLowerCase();
    if (!q) return demo.candidates;
    return demo.candidates.filter((c) => {
      const hay = [
        c.full_name, c.city ?? "",
        ...(c.teacher?.subjects ?? []),
        c.resume_text ?? "",
      ].join(" ").toLowerCase();
      return q.split(/\s+/).every((word) => hay.includes(word));
    });
  }
  let q = db().from("candidates").select(`
      id, full_name, phones, emails, city, telegram_username, primary_source,
      is_blacklisted, blacklist_reason, hide_from_current_employer, current_employer,
      consent_pd_granted, last_activity_at, resume_text,
      teacher_profiles ( candidate_id, subjects, education_stages, years_with_children,
                         total_experience_years, available_hours_per_week,
                         schedule_note, ready_for_substitution )
    `);
  if (query.trim()) q = q.ilike("full_name", `%${query.trim()}%`);
  const { data, error } = await q.limit(200);
  if (error) throw error;
  return (data ?? []).map((c: any) => ({ ...c, teacher: c.teacher_profiles ?? null })) as Candidate[];
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
    return [...demo.conversations].sort(
      (a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? ""),
    );
  }
  const { data, error } = await db()
    .from("conversations")
    .select(`
      id, candidate_id, application_id, channel, last_message_at,
      unread_for_staff, is_ai_autopilot,
      candidates ( full_name ), applications ( vacancies ( title ) )
    `)
    .order("last_message_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((c: any) => ({
    id: c.id, candidate_id: c.candidate_id,
    candidate_name: c.candidates?.full_name ?? "—",
    application_id: c.application_id,
    vacancy_title: c.applications?.vacancies?.title ?? null,
    channel: c.channel, last_message_at: c.last_message_at,
    unread_for_staff: c.unread_for_staff, is_ai_autopilot: c.is_ai_autopilot,
  }));
}

export async function listMessages(conversationId: string): Promise<Message[]> {
  if (isDemoMode) {
    return demoMessages
      .filter((m) => m.conversation_id === conversationId)
      .sort((a, b) => a.sent_at.localeCompare(b.sent_at));
  }
  const { data, error } = await db()
    .from("messages")
    .select("id, conversation_id, direction, author_kind, body, sent_at, profiles ( full_name )")
    .eq("conversation_id", conversationId)
    .order("sent_at");
  if (error) throw error;
  return (data ?? []).map((m: any) => ({
    id: m.id, conversation_id: m.conversation_id, direction: m.direction,
    author_kind: m.author_kind, author_name: m.profiles?.full_name ?? null,
    body: m.body, sent_at: m.sent_at,
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
export async function canTouchCandidate(candidateId: string): Promise<boolean> {
  if (isDemoMode) {
    const cv = demo.conversations.filter((c) => c.candidate_id === candidateId).map((c) => c.id);
    const weekAgo = Date.now() - 7 * 86_400_000;
    const touches = demoMessages.filter(
      (m) => cv.includes(m.conversation_id) && m.direction === "outbound" &&
             new Date(m.sent_at).getTime() > weekAgo,
    ).length;
    return touches < 3;
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
    .select("id, candidate_id, kind, state, expires_on, candidates ( full_name )");
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
