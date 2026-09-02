import { useState } from "react";
import { Bot, CheckCircle2, Plus, RefreshCw, Trash2, AlertTriangle } from "lucide-react";
import * as api from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { Button, Card, Field, Input, Modal, Skeleton, Tag } from "@/components/ui";
import { EmptyState, PageHeader } from "@/components/app/primitives";
import { dateTimeRu } from "@/lib/utils";
import { isDemoMode } from "@/lib/supabase";

/**
 * Боты.
 *
 * Один бот на компанию — допущение, которое ломается почти сразу: массовый
 * подбор говорит не тем тоном, что точечный, у филиала свой аккаунт, под
 * кампанию заводят отдельный. Поэтому бот здесь — строка в списке, а не
 * переменная окружения, которую меняют переразвёртыванием.
 *
 * Подключение сведено к одному полю. Всё остальное — проверку токена,
 * секрет вебхука, регистрацию адреса у Телеграма — делает серверная
 * функция. Принцип «ноль ручного ввода» касается и настройки тоже.
 */
export default function Bots() {
  const bots = useAsync(() => api.listBots(), []);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function recheck(id: string) {
    setBusyId(id);
    setNote(null);
    try {
      const r = await api.recheckBot(id);
      setNote(
        r.ok
          ? "Бот на связи, ошибок нет."
          : `Телеграм жалуется: ${r.error ?? "причина не указана"}`,
      );
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Проверка не прошла");
    } finally {
      setBusyId(null);
      bots.reload();
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Отключить бота «${name}»? Переписка останется, но новые сообщения приходить перестанут.`)) return;
    setBusyId(id);
    try {
      await api.removeBot(id);
      setNote(`Бот «${name}» отключён.`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Не удалось отключить");
    } finally {
      setBusyId(null);
      bots.reload();
    }
  }

  const list = bots.data ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Настройка"
        title="Боты"
        description="Через них идёт вся переписка с кандидатами. Ботов может быть несколько: у массового подбора и точечного разный тон, у филиала — свой аккаунт."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Подключить бота
          </Button>
        }
      />

      {note && (
        <div className="mb-4">
          <Tag tone={note.includes("жалуется") || note.includes("не ") ? "warn" : "good"}>{note}</Tag>
        </div>
      )}

      {bots.loading ? (
        <Skeleton className="h-40 w-full" />
      ) : list.length === 0 ? (
        <EmptyState
          title="Бот пока не подключён"
          description="Заведите бота у @BotFather в Телеграме и вставьте сюда его токен. Адрес вебхука и секрет система пропишет сама — руками ничего выполнять не нужно."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((b) => (
            <Card key={b.id} className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Bot className="h-[18px] w-[18px] text-primary" />
                  <b className="font-display text-[17px] font-semibold">{b.name}</b>
                  {b.is_default && <Tag tone="info">основной</Tag>}
                  {!b.is_active && <Tag tone="mute">выключен</Tag>}
                  {b.last_error ? (
                    <Tag tone="crit">
                      <AlertTriangle className="h-3 w-3" /> не доставляет
                    </Tag>
                  ) : (
                    <Tag tone="good">
                      <CheckCircle2 className="h-3 w-3" /> на связи
                    </Tag>
                  )}
                </div>

                <p className="m-0 text-[13px] text-ink-2">
                  {b.username ? (
                    <a
                      href={`https://t.me/${b.username}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      @{b.username}
                    </a>
                  ) : (
                    "без имени пользователя"
                  )}
                  {b.department_name && ` · ${b.department_name}`}
                  {" · "}
                  <span className="font-mono text-[12px] text-ink-3">{b.token_hint}</span>
                </p>

                <p className="m-0 mt-1 text-[12.5px] text-ink-3">
                  Диалогов: {b.conversations_count}
                  {b.last_seen_at && ` · последнее сообщение ${dateTimeRu(b.last_seen_at)}`}
                </p>

                {b.last_error && (
                  <p className="m-0 mt-2 max-w-[70ch] rounded-md border border-crit-soft bg-crit-soft px-[10px] py-2 text-[12.5px] text-crit">
                    {b.last_error}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => recheck(b.id)}
                  disabled={busyId === b.id}
                >
                  <RefreshCw className="h-4 w-4" /> Проверить
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove(b.id, b.name)}
                  disabled={busyId === b.id}
                >
                  <Trash2 className="h-4 w-4" /> Отключить
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {adding && (
        <AddBot
          onClose={() => setAdding(false)}
          onDone={(msg) => {
            setAdding(false);
            setNote(msg);
            bots.reload();
          }}
        />
      )}
    </>
  );
}

function AddBot({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const clean = token.trim();
    if (!clean) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.addBot(clean, name.trim());
      setToken("");
      onDone(
        r.warning
          ? `Бот добавлен, но Телеграм не принял адрес: ${r.warning}`
          : `Бот «${r.name}» подключён и готов принимать сообщения.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не получилось подключить");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Подключить бота">
      <div className="flex flex-col gap-4">
        <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 text-[13px] text-ink-2">
          <li>
            В Телеграме напишите{" "}
            <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">
              @BotFather
            </a>{" "}
            команду <code className="font-mono">/newbot</code>
          </li>
          <li>Придумайте имя и адрес бота — он ответит строкой с токеном</li>
          <li>Вставьте эту строку сюда целиком</li>
        </ol>

        <Field label="Токен от BotFather">
          <Input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="123456789:AAH..."
            autoFocus
            spellCheck={false}
          />
        </Field>

        <Field
          label="Название внутри системы"
          hint="Как называть его в списке: «Массовый подбор», «IT-направление». Если оставить пустым — возьмём имя из Телеграма."
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Необязательно"
          />
        </Field>

        {isDemoMode && (
          <Tag tone="warn">
            Демо-режим: подключить настоящего бота нельзя, нужна база. Заполните ключи в .env
          </Tag>
        )}
        {error && <Tag tone="crit">{error}</Tag>}

        <p className="m-0 text-[12.5px] text-ink-3">
          Токен уйдёт на сервер и останется в базе под защитой политик доступа.
          В браузер он не возвращается: в списке видно только последние символы,
          чтобы отличить одного бота от другого. Адрес вебхука и секрет система
          пропишет сама.
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={submit} disabled={!token.trim() || busy}>
            {busy ? "Проверяем токен…" : "Подключить"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
