import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 78000 → «78 000 ₽». Неразрывный пробел, чтобы сумма не рвалась по строкам. */
export function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value).toLocaleString("ru-RU").replace(/\s/g, " ")} ₽`;
}

export function moneyShort(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value / 1000)}`;
}

export function dateRu(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function timeRu(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function dateTimeRu(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("ru-RU", { day: "2-digit", month: "long" })}, ${timeRu(iso)}`;
}

/** Русское склонение: 1 день, 2 дня, 5 дней */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}

export function daysWord(n: number) {
  return plural(n, "день", "дня", "дней");
}

/** Сколько дней прошло с даты. */
export function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000),
  );
}

export type SlaTone = "good" | "warn" | "crit";

export interface SlaView {
  tone: SlaTone;
  /** Доля прошедшего времени, 0…1 — ширина полосы */
  progress: number;
  /** Готовая подпись: «осталось 4 ч», «просрочено на 2 дня · эскалация» */
  label: string;
}

/**
 * Срок ответа. Цвет никогда не работает один: рядом всегда стоит число,
 * поэтому функция возвращает и тон, и готовую подпись.
 */
export function slaView(
  dueAt: string | null | undefined,
  startedAt?: string | null,
): SlaView | null {
  if (!dueAt) return null;
  const due = new Date(dueAt).getTime();
  const now = Date.now();
  const start = startedAt ? new Date(startedAt).getTime() : due - 24 * 3600_000;
  const total = Math.max(due - start, 1);
  const progress = Math.min(1, Math.max(0, (now - start) / total));

  const diffH = (due - now) / 3600_000;

  if (diffH < 0) {
    const overdueDays = Math.floor(-diffH / 24);
    const label =
      overdueDays >= 1
        ? `просрочено на ${overdueDays} ${daysWord(overdueDays)} · эскалация`
        : `просрочено на ${Math.ceil(-diffH)} ч · эскалация`;
    return { tone: "crit", progress: 1, label };
  }
  if (diffH < 8) {
    return { tone: "warn", progress, label: `осталось ${Math.ceil(diffH)} ч` };
  }
  if (diffH < 48) {
    return { tone: "good", progress, label: `осталось ${Math.ceil(diffH)} ч` };
  }
  const d = Math.ceil(diffH / 24);
  return { tone: "good", progress, label: `осталось ${d} ${daysWord(d)}` };
}

/** Инициалы для аватара. Фотографии в отборе не показываем сознательно. */
export function initials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
