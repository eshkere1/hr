import { useState } from "react";
import { CalendarPlus, MapPin, Video } from "lucide-react";
import * as api from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { useAuth } from "@/hooks/useAuth";
import { Button, Card, Field, Input, Modal, Select, Skeleton, Tag } from "@/components/ui";
import { EmptyState, PageHeader } from "@/components/app/primitives";
import { WORK_FORMAT_LABEL, type InterviewSlot, type WorkFormat } from "@/lib/types";
import { cn, dateTimeRu, timeRu } from "@/lib/utils";

/**
 * Календарь и самозапись (фишка 34).
 *
 * «Время уходит на переписки и поиск слотов, а не на оценку» — крупнейший
 * пожиратель времени HR. Руководитель выставляет окна один раз, кандидат
 * выбирает сам, напоминание уходит без участия человека.
 */
export default function Calendar() {
  const { userId, profile, can } = useAuth();
  const [adding, setAdding] = useState(false);

  const slots = useAsync(() => api.listSlots(), []);
  const applications = useAsync(() => api.listApplications(), []);

  const list = slots.data ?? [];
  const byDay = groupByDay(list);

  return (
    <>
      <PageHeader
        eyebrow="Слоты и самозапись"
        title="Календарь"
        description="Выставьте окна один раз — дальше кандидат выбирает сам. Переписка «когда вам удобно» исчезает вместе с половиной рабочего дня."
        actions={
          can("dept_head", "line_manager", "hr_manager", "superuser") && (
            <Button onClick={() => setAdding(true)}>
              <CalendarPlus className="h-4 w-4" /> Открыть окно
            </Button>
          )
        }
      />

      {slots.loading ? (
        <Skeleton className="h-64 w-full" />
      ) : list.length === 0 ? (
        <EmptyState
          title="Свободных окон нет"
          description="Пока вы не выставите слоты, HR будет согласовывать время перепиской — а это два-три дня на каждого кандидата."
          action={<Button size="sm" onClick={() => setAdding(true)}>Открыть окно</Button>}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {byDay.map(([day, daySlots]) => (
            <section key={day}>
              <h2 className="mb-3 font-display text-[18px] font-semibold tracking-[-0.01em]">
                {day}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {daySlots.map((s) => (
                  <SlotCard
                    key={s.id}
                    slot={s}
                    bookedBy={
                      (applications.data ?? []).find((a) => a.id === s.booked_by_application_id)
                        ?.candidate_name ?? null
                    }
                    onRelease={async () => {
                      await api.releaseSlot(s.id);
                      slots.reload();
                    }}
                    canRelease={can("hr_manager", "superuser") || s.owner_id === userId}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <NewSlotModal
        open={adding}
        ownerId={userId ?? ""}
        ownerName={profile?.full_name ?? "—"}
        onClose={() => setAdding(false)}
        onDone={() => {
          setAdding(false);
          slots.reload();
        }}
      />
    </>
  );
}

function groupByDay(slots: InterviewSlot[]): [string, InterviewSlot[]][] {
  const map = new Map<string, InterviewSlot[]>();
  slots.forEach((s) => {
    const d = new Date(s.starts_at);
    const key = d.toLocaleDateString("ru-RU", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    map.set(key, [...(map.get(key) ?? []), s]);
  });
  return [...map.entries()];
}

function SlotCard({
  slot, bookedBy, onRelease, canRelease,
}: {
  slot: InterviewSlot;
  bookedBy: string | null;
  onRelease: () => Promise<void>;
  canRelease: boolean;
}) {
  return (
    <Card
      className={cn(
        "flex flex-col gap-3 p-4",
        slot.is_booked ? "border-border" : "border-l-[3px] border-l-good",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-mono text-[15px] font-medium tabular-nums">
            {timeRu(slot.starts_at)}–{timeRu(slot.ends_at)}
          </div>
          <div className="mt-1 text-[12.5px] text-ink-3">{slot.owner_name}</div>
        </div>
        <Tag tone={slot.is_booked ? "info" : "good"}>
          {slot.is_booked ? "Занято" : "Свободно"}
        </Tag>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-ink-2">
        <span className="inline-flex items-center gap-[6px]">
          {slot.work_format === "remote" ? (
            <Video className="h-[13px] w-[13px]" />
          ) : (
            <MapPin className="h-[13px] w-[13px]" />
          )}
          {WORK_FORMAT_LABEL[slot.work_format]}
        </span>
        <span>{slot.kind === "practical_check" ? "практическая проверка" : "интервью"}</span>
      </div>

      {slot.location && <div className="text-[12.5px] text-ink-3">{slot.location}</div>}

      {slot.is_booked && bookedBy && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <span className="text-[13px] font-medium">{bookedBy}</span>
          {canRelease && (
            <Button size="sm" variant="ghost" onClick={onRelease}>
              Освободить
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function NewSlotModal({
  open, ownerId, ownerName, onClose, onDone,
}: {
  open: boolean;
  ownerId: string;
  ownerName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const vacancies = useAsync(() => api.listVacancies(), []);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("15:00");
  const [duration, setDuration] = useState("45");
  const [kind, setKind] = useState("interview");
  const [format, setFormat] = useState<WorkFormat>("remote");
  const [location, setLocation] = useState("");
  const [vacancyId, setVacancyId] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    await api.createSlot({
      owner_id: ownerId,
      owner_name: ownerName,
      vacancy_id: vacancyId || null,
      kind,
      starts_at: new Date(`${date}T${time}`).toISOString(),
      duration_min: Number(duration),
      work_format: format,
      location: format === "onsite" ? location || null : null,
    });
    setBusy(false);
    onDone();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Открыть окно для встречи"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Отмена
          </Button>
          <Button size="sm" disabled={!date || busy} onClick={submit}>
            Открыть окно
          </Button>
        </>
      }
    >
      <p className="m-0 text-sm text-ink-2">
        Кандидат увидит только свободные окна и выберет сам. Подтверждать
        каждое время вручную не придётся.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Дата" htmlFor="d">
          <Input id="d" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Начало" htmlFor="t">
          <Input id="t" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Длительность, минут" htmlFor="dur">
          <Select id="dur" value={duration} onChange={(e) => setDuration(e.target.value)}>
            <option value="30">30</option>
            <option value="45">45</option>
            <option value="60">60</option>
            <option value="90">90</option>
          </Select>
        </Field>
        <Field label="Что за встреча" htmlFor="kind">
          <Select id="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="interview">Интервью</option>
            <option value="practical_check">Практическая проверка</option>
            <option value="screening_call">Телефонный скрининг</option>
          </Select>
        </Field>
        <Field label="Формат" htmlFor="fmt">
          <Select
            id="fmt"
            value={format}
            onChange={(e) => setFormat(e.target.value as WorkFormat)}
          >
            <option value="remote">Удалённо</option>
            <option value="onsite">В офисе</option>
          </Select>
        </Field>
        <Field label="Вакансия" htmlFor="vac" hint="Можно не выбирать — тогда окно общее">
          <Select id="vac" value={vacancyId} onChange={(e) => setVacancyId(e.target.value)}>
            <option value="">Любая</option>
            {(vacancies.data ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {format === "onsite" && (
        <Field label="Где встречаемся" htmlFor="loc" hint="Адрес и переговорная — чтобы кандидат не искал">
          <Input id="loc" value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Самозапись кандидата: тот же список слотов, но с другой стороны стола
// ---------------------------------------------------------------------------
export function SelfBooking({
  applicationId,
  vacancyId,
  onBooked,
}: {
  applicationId: string;
  vacancyId: string;
  onBooked?: () => void;
}) {
  const slots = useAsync(() => api.listSlots(vacancyId), [vacancyId]);
  const [booked, setBooked] = useState<string | null>(null);

  const free = (slots.data ?? []).filter((s) => !s.is_booked);
  const mine = (slots.data ?? []).find((s) => s.booked_by_application_id === applicationId);

  if (slots.loading) return <Skeleton className="h-32 w-full" />;

  if (mine) {
    return (
      <Card className="border-l-[3px] border-l-good">
        <div className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
          Встреча назначена
        </div>
        <div className="mt-1 font-display text-[17px] font-semibold">
          {dateTimeRu(mine.starts_at)}
        </div>
        <div className="mt-1 text-[13px] text-ink-2">
          {WORK_FORMAT_LABEL[mine.work_format]}
          {mine.location ? ` · ${mine.location}` : ""} · {mine.owner_name}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="mt-3"
          onClick={async () => {
            await api.releaseSlot(mine.id);
            slots.reload();
            onBooked?.();
          }}
        >
          Перенести на другое время
        </Button>
      </Card>
    );
  }

  if (free.length === 0) {
    return (
      <Card>
        <p className="m-0 text-[13.5px] text-ink-2">
          Свободных окон сейчас нет. Мы напишем, как только они появятся —
          отдельно следить не нужно.
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <div className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
          Выберите удобное время
        </div>
        <p className="m-0 mt-1 text-[13px] text-ink-2">
          Есть вечерние окна и онлайн — подстраивать текущую работу не нужно.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {free.slice(0, 8).map((s) => (
          <button
            key={s.id}
            onClick={async () => {
              await api.bookSlot(s.id, applicationId);
              setBooked(s.id);
              slots.reload();
              onBooked?.();
            }}
            className={cn(
              "rounded-md border p-3 text-left transition-colors",
              booked === s.id
                ? "border-good bg-good-soft"
                : "border-border bg-surface hover:border-primary hover:bg-primary-soft",
            )}
          >
            <div className="font-mono text-[14px] font-medium tabular-nums">
              {dateTimeRu(s.starts_at)}
            </div>
            <div className="mt-[2px] text-[12px] text-ink-3">
              {WORK_FORMAT_LABEL[s.work_format]}
              {s.location ? ` · ${s.location}` : ""}
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}
