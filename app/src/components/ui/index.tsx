/**
 * Базовые элементы интерфейса.
 *
 * Написаны вручную и намеренно небольшие: словарь дизайн-системы у нас свой,
 * и тащить ради него библиотеку компонентов значило бы получить второй набор
 * токенов, который придётся согласовывать с первым.
 *
 * Правило одно: ни один цвет и размер здесь не задан напрямую — только классы,
 * за которыми стоят токены из index.css.
 */
import React from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Кнопка. На экране одно основное действие, всё остальное — вторичное.
// Надпись называет результат: «Отправить оффер», а не «ОК».
// ---------------------------------------------------------------------------
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-strong",
  secondary: "bg-surface text-ink border-border-strong hover:bg-surface-2",
  ghost: "bg-transparent text-primary hover:bg-primary-soft",
  danger: "bg-crit text-white hover:brightness-95",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  // Область нажатия не меньше 44×44 обеспечивается min-h
  sm: "px-3 py-[7px] text-[13px] rounded-sm min-h-[32px]",
  md: "px-[18px] py-[11px] text-sm rounded-md min-h-[40px]",
  lg: "px-6 py-[14px] text-[15px] rounded-md min-h-[48px]",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 border border-transparent font-semibold leading-none",
        "transition-colors disabled:opacity-45 disabled:cursor-not-allowed",
        BUTTON_VARIANT[variant],
        BUTTON_SIZE[size],
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Поле. Подпись — всегда Label, никогда плейсхолдер: он исчезает,
// как только начинают печатать.
// ---------------------------------------------------------------------------
export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-[13px] font-semibold text-ink-2", className)}
      {...props}
    />
  );
}

const FIELD_BASE =
  "w-full rounded-md border border-border-strong bg-surface px-3 py-[10px] text-sm text-ink " +
  "placeholder:text-ink-3 focus:border-primary focus:outline-none focus:ring-[3px] focus:ring-ring/30 " +
  "aria-[invalid=true]:border-crit";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(FIELD_BASE, className)} {...props} />;
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(FIELD_BASE, "min-h-[84px] resize-y", className)}
      {...props}
    />
  );
});

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(FIELD_BASE, className)} {...props} />;
}

/** Подпись под полем: что система заполнила сама и что стоит проверить. */
export function Hint({ children }: { children: React.ReactNode }) {
  return <span className="text-xs text-ink-3">{children}</span>;
}

/** Ошибка объясняет, что не так и что сделать. Без извинений. */
export function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-medium text-crit" role="alert">
      {children}
    </span>
  );
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-[6px]", className)}>
      {label && <Label htmlFor={htmlFor}>{label}</Label>}
      {children}
      {error ? <FieldError>{error}</FieldError> : hint ? <Hint>{hint}</Hint> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Карточка
// ---------------------------------------------------------------------------
export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface p-5 shadow-sh-1",
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Плашка статуса. Цвет никогда не работает один — внутри всегда слово.
// ---------------------------------------------------------------------------
type TagTone = "good" | "warn" | "crit" | "info" | "mute";

const TAG_TONE: Record<TagTone, string> = {
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  crit: "bg-crit-soft text-crit",
  info: "bg-info-soft text-info",
  mute: "bg-surface-2 text-ink-3",
};

export function Tag({
  tone = "mute",
  className,
  children,
}: {
  tone?: TagTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[6px] rounded-sm px-[9px] py-[3px] text-xs font-semibold",
        TAG_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Аватар: инициалы. Фотографии в отборе не показываем сознательно.
// ---------------------------------------------------------------------------
export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dims = {
    sm: "h-7 w-7 text-[11px]",
    md: "h-[38px] w-[38px] text-[13.5px]",
    lg: "h-[52px] w-[52px] text-[17px]",
  }[size];
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-full border border-border bg-primary-soft font-bold text-primary",
        dims,
        className,
      )}
    >
      {letters}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Вкладки. Порядок — порядок работы, а не алфавит.
// ---------------------------------------------------------------------------
export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: string; label: string; count?: number }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-[2px] overflow-x-auto border-b border-border" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-[14px] py-[10px] text-[13.5px] font-medium transition-colors",
            value === t.id
              ? "border-primary font-semibold text-primary"
              : "border-transparent text-ink-3 hover:text-ink",
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className="ml-2 font-mono text-[11px] text-ink-3">{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Модальное окно — только для необратимого действия.
// Для обратимого хватает тоста с «Отменить».
// ---------------------------------------------------------------------------
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Для содержимого со вкладками и таблицами: в 520px оно не читается. */
  wide?: boolean;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "flex max-h-[86vh] w-full flex-col gap-[14px] overflow-y-auto rounded-xl border border-border bg-surface p-[22px] shadow-sh-3",
          wide ? "max-w-[820px]" : "max-w-[520px]",
        )}
      >
        <h4 className="m-0 font-display text-[19px] font-semibold tracking-[-0.01em]">
          {title}
        </h4>
        {children}
        {footer && <div className="flex justify-end gap-[9px]">{footer}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Скелетон: показывает форму будущего содержимого, а не крутящийся кружок.
// ---------------------------------------------------------------------------
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-sm bg-[linear-gradient(90deg,hsl(var(--surface-2)),hsl(var(--surface-3)),hsl(var(--surface-2)))] bg-[length:200%_100%] animate-shimmer",
        className,
      )}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="flex max-w-[330px] flex-col gap-[10px] rounded-lg border border-border bg-surface p-[14px]">
      <div className="flex items-center gap-[11px]">
        <Skeleton className="h-[38px] w-[38px] rounded-full" />
        <div className="flex flex-1 flex-col gap-[7px]">
          <Skeleton className="h-[11px] w-[62%]" />
          <Skeleton className="h-[9px] w-[44%]" />
        </div>
      </div>
      <Skeleton className="h-[11px] w-full" />
      <Skeleton className="h-[11px] w-[78%]" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Таблица
// ---------------------------------------------------------------------------
export function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      {children}
    </div>
  );
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("w-full border-collapse text-[13.5px]", className)} {...props} />;
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "whitespace-nowrap border-b border-border bg-surface-2 px-[14px] py-[11px] text-left",
        "text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3",
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn("border-b border-border px-[14px] py-3 align-middle", className)}
      {...props}
    />
  );
}
