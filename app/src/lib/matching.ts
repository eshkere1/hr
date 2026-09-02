/**
 * Смысловой поиск по базе и подбор кандидатов из архива.
 *
 * Фишки 9, 15, 16. Здесь нет обращения к модели — и это осознанно:
 * ключ модели не должен попадать в клиентский код, а сам подбор обязан
 * быть проверяемым. Поэтому правила явные, а каждое совпадение
 * возвращается вместе с фразой, объясняющей, почему человек предложен.
 *
 * Словари ниже отраслево-нейтральные и лежат в одном месте специально:
 * под своё направление их дополняют здесь, не трогая логику ранжирования.
 * Когда подключите edge function с моделью, она заменит только parseQuery;
 * ранжирование и объяснения останутся, потому что «показываем основание,
 * а не балл» относится и к подбору тоже.
 */
import type {
  ApplicationStatus, ArchiveMatch, Candidate, GradeLevel, ParsedQuery,
  RejectionReason, Application, VacancyCriterion, Vacancy,
} from "./types";
import { GRADE_LABEL } from "./types";

// ---------------------------------------------------------------------------
// СЛОВАРИ
// ---------------------------------------------------------------------------

/** Направления. Ключ — как показываем, значения — как могут написать. */
const SPECIALIZATIONS: Record<string, string[]> = {
  Разработка: ["разработ", "программист", "backend", "бэкенд", "frontend", "фронтенд", "девелопер"],
  Тестирование: ["тестировщ", "qa", "автотест"],
  Аналитика: ["аналитик", "данн", "отчётност", "отчетност"],
  Дизайн: ["дизайн", "ux", "макет"],
  Продажи: ["продаж", "sales", "клиентск"],
  Маркетинг: ["маркетинг", "smm", "трафик", "реклам", "контент"],
  Поддержка: ["поддержк", "саппорт", "оператор", "колл-центр"],
  Бухгалтерия: ["бухгалтер", "учёт", "учет", "первичк"],
  Финансы: ["финанс", "экономист", "казначей"],
  Логистика: ["логист", "склад", "закупк", "снабжен"],
  Производство: ["производств", "технолог", "наладчик", "мастер участка"],
  Персонал: ["hr", "рекрут", "кадров", "подбор персонал"],
  Юристы: ["юрист", "правов", "договорн"],
  Руководители: ["руководител", "директор", "начальник", "тимлид"],
};

/** Навыки и инструменты. По ним ищем, когда направление не названо. */
const SKILL_STEMS = [
  "python", "java", "javascript", "typescript", "react", "node", "php",
  "sql", "postgres", "excel", "1с", "1c", "sap", "битрикс", "crm", "amocrm",
  "figma", "tableau", "power bi", "директ", "английск", "b2b", "b2c",
  "холодн", "переговор", "презентац", "selenium", "docker", "kubernetes",
];

const GRADE_SYNONYMS: Record<GradeLevel, string[]> = {
  intern: ["стажёр", "стажер", "интерн", "без опыта"],
  junior: ["джун", "junior", "младш", "начинающ"],
  middle: ["мидл", "middle", "самостоятельн"],
  senior: ["сеньор", "senior", "опытн", "старш"],
  lead: ["лид", "lead", "ведущ", "тимлид"],
};

/**
 * Города сравниваем по основе: в запросе они в любом падеже.
 * Ключ — основа для сравнения, значение — как показать человеку.
 */
const CITIES: Record<string, string> = {
  "москв": "Москва",
  "петербург": "Санкт-Петербург",
  "спб": "Санкт-Петербург",
  "новосибирск": "Новосибирск",
  "екатеринбург": "Екатеринбург",
  "казан": "Казань",
  "челябинск": "Челябинск",
  "самар": "Самара",
  "омск": "Омск",
  "ростов": "Ростов-на-Дону",
  "красноярск": "Красноярск",
  "воронеж": "Воронеж",
  "пермь": "Пермь",
  "волгоград": "Волгоград",
  "краснодар": "Краснодар",
  "саратов": "Саратов",
  "тюмен": "Тюмень",
  "нижн новгород": "Нижний Новгород",
};
const CITY_STEMS = Object.keys(CITIES);

const REMOTE_WORDS = ["удалён", "удален", "remote", "из дома", "дистанц"];
const URGENT_WORDS = ["срочно", "завтра", "на замену", "замен", "выйти сразу", "горит"];

function normalize(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е").trim();
}

// ---------------------------------------------------------------------------
// РАЗБОР ЗАПРОСА
// ---------------------------------------------------------------------------
/**
 * Превращает фразу вроде «опытный python из Москвы, готов удалённо,
 * опыт от 5 лет» в структуру. HR не должна собирать boolean-запрос.
 */
export function parseQuery(raw: string): ParsedQuery {
  const q = normalize(raw);

  const specializations = Object.entries(SPECIALIZATIONS)
    .filter(([, stems]) => stems.some((st) => q.includes(normalize(st))))
    .map(([name]) => name);

  const skills = SKILL_STEMS.filter((st) => q.includes(normalize(st)));

  const grades = (Object.keys(GRADE_SYNONYMS) as GradeLevel[]).filter((g) =>
    GRADE_SYNONYMS[g].some((st) => q.includes(normalize(st))),
  );

  const city = CITY_STEMS.find((c) => q.includes(c)) ?? null;

  // «опыт от 3 лет», «стаж 5 лет», «от 7 лет»
  const expMatch = q.match(/(?:опыт|стаж)?\s*(?:от|более|больше)?\s*(\d{1,2})\s*(?:год|года|лет)/);
  const minExperience = expMatch ? Number(expMatch[1]) : null;

  const remoteOnly = REMOTE_WORDS.some((w) => q.includes(w));
  const readyUrgently = URGENT_WORDS.some((w) => q.includes(w));

  // Слова, которые ни во что не легли: ищем их по резюме как есть
  const consumed = new Set<string>();
  specializations.flatMap((s) => SPECIALIZATIONS[s]).forEach((st) => consumed.add(normalize(st)));
  skills.forEach((st) => consumed.add(normalize(st)));
  grades.flatMap((g) => GRADE_SYNONYMS[g]).forEach((st) => consumed.add(normalize(st)));

  const freeWords = q
    .split(/[\s,.;]+/)
    .filter((w) => w.length > 3)
    .filter((w) => !CITY_STEMS.some((c) => w.startsWith(c.slice(0, 5))))
    .filter((w) => ![...consumed].some((st) => w.startsWith(st.slice(0, 4))))
    .filter((w) => !/^\d+$/.test(w))
    .filter(
      (w) =>
        !["кандидат", "специалист", "сотрудник", "найти", "показать", "всех", "все", "нужен", "ищем"].some(
          (s) => w.startsWith(s),
        ),
    );

  return { specializations, skills, grades, city, minExperience, remoteOnly, readyUrgently, freeWords };
}

/** Человеческое описание того, что система поняла. Без него поиск — чёрный ящик. */
export function describeQuery(p: ParsedQuery): string[] {
  const parts: string[] = [];
  if (p.specializations.length) parts.push(`направление: ${p.specializations.join(", ")}`);
  if (p.skills.length) parts.push(`навыки: ${p.skills.join(", ")}`);
  if (p.grades.length) parts.push(`уровень: ${p.grades.map((g) => GRADE_LABEL[g]).join(", ")}`);
  if (p.city) parts.push(`город: ${CITIES[p.city] ?? p.city}`);
  if (p.minExperience) parts.push(`опыт от ${p.minExperience} лет`);
  if (p.remoteOnly) parts.push("готов удалённо");
  if (p.readyUrgently) parts.push("готов выйти срочно");
  if (p.freeWords.length) parts.push(`по резюме: ${p.freeWords.join(", ")}`);
  return parts;
}

// ---------------------------------------------------------------------------
// ПОИСК ПО БАЗЕ
// ---------------------------------------------------------------------------
export function searchCandidates(candidates: Candidate[], raw: string): Candidate[] {
  const q = raw.trim();
  if (!q) return candidates;

  const p = parseQuery(q);
  const nothingParsed =
    !p.specializations.length && !p.skills.length && !p.grades.length &&
    !p.city && !p.minExperience && !p.remoteOnly && !p.readyUrgently;

  return candidates.filter((c) => {
    const t = c.profile;
    const hay = normalize(
      [c.full_name, c.city ?? "", c.resume_text ?? "", t?.specialization ?? "", ...(t?.skills ?? [])].join(" "),
    );

    if (p.specializations.length && !p.specializations.includes(t?.specialization ?? "")) return false;
    if (p.skills.length && !p.skills.some((sk) => hay.includes(normalize(sk)))) return false;
    if (p.grades.length && !p.grades.some((g) => t?.grades.includes(g))) return false;
    if (p.city && !normalize(c.city ?? "").includes(p.city)) return false;
    if (p.minExperience && (t?.total_experience_years ?? 0) < p.minExperience) return false;
    if (p.remoteOnly && !t?.work_formats.some((f) => f === "remote" || f === "hybrid")) return false;
    if (p.readyUrgently && !t?.ready_for_urgent_start) return false;

    if (p.freeWords.length) {
      const hit = p.freeWords.some((w) => hay.includes(w.slice(0, Math.max(4, w.length - 2))));
      if (!hit && nothingParsed) return false;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// ПОДБОР ИЗ АРХИВА ПОД ВАКАНСИЮ (фишка 9)
// ---------------------------------------------------------------------------
interface MatchInput {
  vacancy: Vacancy;
  criteria: VacancyCriterion[];
  candidates: Candidate[];
  applications: Application[];
  reasons: RejectionReason[];
  /** Кому нельзя писать прямо сейчас — лимит касаний (фишка 41) */
  touchBlocked: Set<string>;
}

const GRADE_ORDER: GradeLevel[] = ["intern", "junior", "middle", "senior", "lead"];

/**
 * «Открыли вакансию — система сама приносит пятерых из базы».
 *
 * Считаем не абстрактный балл, а сумму проверяемых совпадений, и каждое
 * из них возвращаем словами. Стоп-лист исключается жёстко: тратить на этих
 * людей время мы решили заранее.
 */
export function matchFromArchive(input: MatchInput, limit = 5): ArchiveMatch[] {
  const { vacancy, candidates, applications, reasons, touchBlocked } = input;
  const activeStatuses: ApplicationStatus[] = ["active", "on_hold"];

  const matches: ArchiveMatch[] = candidates
    .map((c) => {
      const t = c.profile;
      const reasonsList: string[] = [];
      const blockers: string[] = [];
      let score = 0;

      // Уже в работе по этой вакансии — предлагать бессмысленно
      const onThisVacancy = applications.find(
        (a) => a.candidate_id === c.id && a.vacancy_id === vacancy.id,
      );
      if (onThisVacancy && activeStatuses.includes(onThisVacancy.status)) return null;
      if (c.is_blacklisted) return null;

      // Направление — главный признак, а не один из. Предлагать бухгалтера
      // на вакансию разработчика значит приучить HR пролистывать подбор.
      if (vacancy.specialization && t?.specialization) {
        if (t.specialization === vacancy.specialization) {
          score += 40;
          reasonsList.push(`Направление совпадает: ${vacancy.specialization.toLowerCase()}`);
        } else {
          return null;
        }
      }

      // Уровень позиции
      if (vacancy.grade && t?.grades.length) {
        if (t.grades.includes(vacancy.grade)) {
          score += 20;
          reasonsList.push(`Уровень подходит: ${GRADE_LABEL[vacancy.grade]}`);
        } else {
          const want = GRADE_ORDER.indexOf(vacancy.grade);
          const best = Math.max(...t.grades.map((g) => GRADE_ORDER.indexOf(g)));
          if (best > want) {
            score += 8;
            blockers.push(`Уровень выше вакансии: ${GRADE_LABEL[GRADE_ORDER[best]]}`);
          } else {
            blockers.push(`Уровень ниже вакансии: ${GRADE_LABEL[GRADE_ORDER[best]]}`);
          }
        }
      }

      // Город и формат работы
      if (vacancy.city && c.city && normalize(c.city) === normalize(vacancy.city)) {
        score += 18;
        reasonsList.push(`Живёт в городе вакансии — ${c.city}`);
      } else if (vacancy.city && c.city) {
        if (t?.work_formats.some((f) => f === "remote" || f === "hybrid")) {
          score += 8;
          reasonsList.push(`Другой город (${c.city}), но готов работать удалённо`);
        } else {
          blockers.push(`Другой город: ${c.city}`);
        }
      }

      // Опыт в направлении
      const years = t?.years_in_specialty ?? 0;
      if (years >= 5) {
        score += 20;
        reasonsList.push(`Опыт в направлении: ${years} лет`);
      } else if (years >= 3) {
        score += 10;
        reasonsList.push(`Опыт в направлении: ${years} года`);
      } else if (years > 0) {
        blockers.push(`Небольшой опыт в направлении — ${years}`);
      }

      // Деньги: разрыв виден до первого письма, а не на этапе оффера
      const band = vacancy.compensation?.salary_max ?? null;
      if (band && t?.expected_salary) {
        const over = t.expected_salary - band;
        if (over > 0) {
          blockers.push(`Ожидания выше вилки на ${Math.round(over / 1000)} тыс`);
        } else {
          score += 10;
          reasonsList.push("Ожидания укладываются в вилку");
        }
      }

      // Прошлый отказ — не минус, а контекст. Из «не сейчас» получаются
      // лучшие закрытия: человек уже прошёл наш отбор.
      const past = applications
        .filter((a) => a.candidate_id === c.id && a.archive_segment)
        .sort((a, b) => b.applied_at.localeCompare(a.applied_at))[0];

      let lastRejection: ArchiveMatch["lastRejection"] = null;
      if (past?.archive_segment) {
        const reason = reasons.find((r) => r.id === past.rejection_reason_id);
        lastRejection = {
          segment: past.archive_segment,
          reason: reason?.name ?? "причина не указана",
          when: past.applied_at,
        };
        if (past.archive_segment === "stop_list") return null;
        if (past.archive_segment === "not_now") {
          score += 25;
          reasonsList.push("Прошлый отказ — «не сейчас»: подходил, не было места");
        }
        if (past.archive_segment === "not_ready") {
          score += 5;
          blockers.push(`Прошлый отказ: ${reason?.name ?? "не готов"}`);
        }
        if (past.archive_segment === "not_our_profile") {
          blockers.push(`Прошлый отказ: ${reason?.name ?? "не наш профиль"}`);
        }

        if (past.criteria_total > 0) {
          reasonsList.push(
            `Уже проходил отбор: закрыл ${past.criteria_met} из ${past.criteria_total} критериев`,
          );
          score += past.criteria_met * 3;
        }
      }

      // Согласие на хранение данных — без него писать нельзя вообще
      if (!c.consent_pd_granted) {
        blockers.push("Нет согласия на обработку данных");
        score -= 100;
      }

      const canTouch = !touchBlocked.has(c.id);
      if (!canTouch) blockers.push("Лимит касаний на этой неделе исчерпан");

      return { candidate: c, score, reasons: reasonsList, blockers, lastRejection, canTouch };
    })
    .filter((m): m is ArchiveMatch => m !== null && m.score > 20)
    .sort((a, b) => b.score - a.score);

  return matches.slice(0, limit);
}

// ---------------------------------------------------------------------------
// ГЕНЕРАТОР ВОПРОСОВ ПОД РОЛЬ (фишка 28)
// ---------------------------------------------------------------------------
/**
 * «Не знает, какие вопросы задавать для проверки компетенций» — боль
 * руководителя подразделения. Вопросы строятся из критериев вакансии,
 * поэтому интервью проверяет ровно то, по чему потом принимается решение.
 */
const QUESTION_PATTERNS: { test: RegExp; build: (c: string) => { q: string; good: string } }[] = [
  {
    test: /опыт|стаж|лет|работал/i,
    build: (c) => ({
      q: "Расскажите про самый сложный проект за последний год. Что конкретно делали вы, а что команда?",
      good: `Конкретный проект, своя роль и результат. Ответ «мы делали вместе» критерий «${c}» не закрывает.`,
    }),
  },
  {
    test: /конфликт|команд|коммуникац|общен|клиент/i,
    build: () => ({
      q: "Вспомните последний рабочий конфликт. С чего он начался и чем закончился?",
      good: "Называет свою часть ответственности и конкретный шаг к развязке. Плохой ответ — во всём виноват коллега или руководитель.",
    }),
  },
  {
    test: /самостоятельн|инициатив|решени/i,
    build: () => ({
      q: "Приведите случай, когда вы приняли решение без согласования. Что было на кону и чем закончилось?",
      good: "Понимает границы своей ответственности и оценивает риск. «Я всегда согласую» означает, что задачу придётся вести за него.",
    }),
  },
  {
    test: /срок|нагрузк|график|режим|час/i,
    build: () => ({
      q: "Какой режим для вас реально рабочий, а не «в принципе возможный»? Что не подходит категорически?",
      good: "Называет границы прямо. Расплывчатое «я гибкий» через месяц превращается в отказ от переработок.",
    }),
  },
  {
    test: /обучен|развит|курс|образован|диплом/i,
    build: () => ({
      q: "Чему вы научились за последний год и где это применили?",
      good: "Конкретное умение и конкретное применение. Сертификат сам по себе ничего не говорит.",
    }),
  },
  {
    test: /документ|допуск|оформлен|провер/i,
    build: () => ({
      q: "Какие документы для оформления у вас уже есть, а какие нужно получать? В какой срок?",
      good: "Знает, что нужно, и называет срок. Медосмотр и проверка занимают недели — это должно всплыть до оффера, а не в день выхода.",
    }),
  },
  {
    test: /результат|метрик|показател|план|качеств/i,
    build: () => ({
      q: "По каким числам оценивали вашу работу на прошлом месте? Какие из них вы вытянули, а какие нет?",
      good: "Называет конкретные показатели и честно говорит про провалы. Только победы означают, что человек не измерял себя вовсе.",
    }),
  },
];

export function generateQuestions(vacancyId: string, criteria: VacancyCriterion[]) {
  return criteria.map((c) => {
    const pattern = QUESTION_PATTERNS.find((p) => p.test.test(c.name));
    const built = pattern
      ? pattern.build(c.name)
      : {
          q: `Приведите пример из практики, который показывает: «${c.name.toLowerCase()}». Что именно сделали вы?`,
          good: "Конкретная ситуация, действия кандидата и результат. Общие рассуждения критерий не закрывают.",
        };
    return {
      id: `q-${c.id}`,
      vacancy_id: vacancyId,
      criterion_id: c.id,
      criterion_name: c.name,
      question: built.q,
      good_answer: built.good,
      is_ai_generated: true,
    };
  });
}

// ---------------------------------------------------------------------------
// ШАБЛОН ОФФЕРА (фишка 39)
// ---------------------------------------------------------------------------
/** Подстановка {{ключ}} в шаблон. Пропущенные ключи видно, а не молча пусто. */
export function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) =>
    values[key] !== undefined && values[key] !== "" ? values[key] : `⟨${key} не заполнено⟩`,
  );
}
