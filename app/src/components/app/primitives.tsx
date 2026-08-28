/**
 * Компоненты, которых нет ни в одной библиотеке, потому что они про наш
 * продукт: чип этапа, индикатор закрытых критериев, индикатор срока.
 * Каждый закрывает конкретный принцип из дизайн-системы.
 */
import React from "react";
import { Link } from "react-router-dom";
import { cn, slaView, initials } from "@/lib/utils";
import type { PipelineStage } from "@/lib/types";

// ---------------------------------------------------------------------------
// Чип этапа. Цвет никогда не работает один: рядом всегда подпись словом,
// иначе доска нечитаема при дальтонизме и в чёрно-белой печати.
// ---------------------------------------------------------------------------
export function StageChip({
  stage,
  className,
}: {
  stage: Pick<PipelineStage, "name" | "color_token">;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[7px] rounded-full border border-border bg-surface-2",
        "py-1 pl-[9px] pr-[11px] text-[12.5px] font-medium text-ink",
        className,
      )}
    >
      <i
        aria-hidden="true"
        className="h-[9px] w-[9px] shrink-0 rounded-full"
        style={{ background: `hsl(var(--${stage.color_token}))` }}
      />
      {stage.name}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Закрытые критерии. Никаких «7,4 балла»: только «4 из 6», а клик
// раскрывает, какие именно и чем подтверждены.
// ---------------------------------------------------------------------------
export function CriteriaMeter({
  met,
  total,
  className,
}: {
  met: number;
  total: number;
  className?: string;
}) {
  const bars = Math.max(total, 1);
  return (
    <span className={cn("inline-flex items-center gap-[9px]", className)}>
      <span className="flex gap-[2px]" aria-hidden="true">
        {Array.from({ length: bars }).map((_, i) => (
          <i
            key={i}
            className={cn(
              "block h-[7px] w-[15px] rounded-[2px]",
              i < met ? "bg-primary" : "bg-surface-3",
            )}
          />
        ))}
      </span>
      <span className="font-mono text-xs tabular-nums text-ink-2">
        {met} из {total}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Срок ответа. Полоса плюс обязательно число: тишина — это ошибка,
// и у неё должен быть видимый размер.
// ---------------------------------------------------------------------------
export function SlaIndicator({
  dueAt,
  startedAt,
  compact = false,
}: {
  dueAt: string | null | undefined;
  startedAt?: string | null;
  compact?: boolean;
}) {
  const sla = slaView(dueAt, startedAt);
  if (!sla) return null;

  const toneClass = {
    good: "text-good",
    warn: "text-warn",
    crit: "text-crit",
  }[sla.tone];
  const barColor = {
    good: "hsl(var(--good))",
    warn: "hsl(var(--warn))",
    crit: "hsl(var(--destructive))",
  }[sla.tone];

  return (
    <span className={cn("inline-flex items-center gap-[7px] text-[12.5px] font-semibold", toneClass)}>
      {!compact && (
        <span className="h-[6px] w-[74px] overflow-hidden rounded-full bg-surface-3">
          <span
            className="block h-full rounded-full"
            style={{ width: `${sla.progress * 100}%`, background: barColor }}
          />
        </span>
      )}
      {sla.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Пустой экран — подсказка, а не извинение. Называет одно действие,
// которое имеет смысл сделать прямо сейчас.
// ---------------------------------------------------------------------------
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[430px] rounded-lg border border-dashed border-border-strong bg-surface px-[22px] py-[34px] text-center">
      <b className="mb-[6px] block font-display text-[17px] font-semibold">{title}</b>
      <p className="m-0 mb-4 text-[13.5px] text-ink-2">{description}</p>
      {action}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Шапка экрана
// ---------------------------------------------------------------------------
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
            {eyebrow}
          </div>
        )}
        <h1 className="mt-2 font-display text-[clamp(24px,3vw,32px)] font-bold leading-[1.1] tracking-[-0.02em]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-[64ch] text-[14px] text-ink-2">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Строка кандидата: имя с инициалами, ведёт в карточку отклика
// ---------------------------------------------------------------------------
export function CandidateLine({
  name,
  to,
  subtitle,
}: {
  name: string;
  to?: string;
  subtitle?: string | null;
}) {
  const content = (
    <span className="flex items-center gap-[9px]">
      <span
        aria-hidden="true"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border bg-primary-soft text-[11px] font-bold text-primary"
      >
        {initials(name)}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium">{name}</span>
        {subtitle && <span className="block truncate text-xs text-ink-3">{subtitle}</span>}
      </span>
    </span>
  );
  return to ? (
    <Link to={to} className="text-ink hover:text-primary hover:no-underline">
      {content}
    </Link>
  ) : (
    content
  );
}

// ---------------------------------------------------------------------------
// Плитка дашборда
// ---------------------------------------------------------------------------
export function Kpi({
  label,
  value,
  unit,
  delta,
  deltaTone = "mute",
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  delta?: string;
  deltaTone?: "good" | "warn" | "crit" | "mute";
}) {
  const toneClass = {
    good: "text-good",
    warn: "text-warn",
    crit: "text-crit",
    mute: "text-ink-3",
  }[deltaTone];
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
        {label}
      </div>
      <div className="mt-[7px] font-display text-[31px] font-bold leading-none tracking-[-0.02em] tabular-nums">
        {value}
        {unit && <small className="ml-1 font-sans text-sm font-medium text-ink-3">{unit}</small>}
      </div>
      {delta && <div className={cn("mt-[9px] text-[12.5px]", toneClass)}>{delta}</div>}
    </div>
  );
}
