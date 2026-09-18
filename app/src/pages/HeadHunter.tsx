import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle, CheckCircle2, Download, ExternalLink, Link2, RefreshCw, Trash2,
} from "lucide-react";
import * as api from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { Button, Card, Skeleton, Tag } from "@/components/ui";
import { EmptyState, PageHeader } from "@/components/app/primitives";
import { dateTimeRu } from "@/lib/utils";
import { isDemoMode } from "@/lib/supabase";

/**
 * hh.ru.
 *
 * Смысл интеграции в одном: вакансия заводится один раз. Сейчас её пишут
 * в системе, потом перенабирают на hh, через неделю правят требования —
 * и версии расходятся. Кандидат читает одно, отбирают по другому.
 *
 * Отклики идут обратно в ту же воронку, что и Телеграм с архивом. Рекрутер
 * отвечает в одном месте, а сроки считаются по одной системе, а не по двум.
 */
export default function HeadHunter() {
  const accounts = useAsync(() => api.listHhAccounts(), []);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: "good" | "warn" | "crit"; text: string } | null>(null);

  const list = accounts.data ?? [];

  async function connect() {
    setBusy(true);
    setNote(null);
    try {
      // Уходим на hh за разрешением. Вернёмся на /auth/hh/callback.
      window.location.href = await api.startHhConnect();
    } catch (e) {
      setNote({ tone: "crit", text: e instanceof Error ? e.message : "Не получилось" });
      setBusy(false);
    }
  }

  async function sync() {
    setBusy(true);
    setNote(null);
    try {
      const r = await api.syncHh();
      setNote({
        tone: r.проблемы?.length ? "warn" : "good",
        text: r.новых > 0
          ? `Новых откликов: ${r.новых}. Они уже в воронке.`
          : `Новых откликов нет. Просмотрено: ${r.просмотрено}.`,
      });
    } catch (e) {
      setNote({ tone: "crit", text: e instanceof Error ? e.message : "Синхронизация не прошла" });
    } finally {
      setBusy(false);
      accounts.reload();
    }
  }

  async function disconnect(id: string, name: string) {
    if (!confirm(`Отключить «${name}»? Опубликованные вакансии на hh останутся, но обновлять их и забирать отклики система перестанет.`)) return;
    setBusy(true);
    try {
      await api.removeHhAccount(id);
      setNote({ tone: "good", text: "Работодатель отключён." });
    } catch (e) {
      setNote({ tone: "crit", text: e instanceof Error ? e.message : "Не удалось отключить" });
    } finally {
      setBusy(false);
      accounts.reload();
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Настройка"
        title="hh.ru"
        description="Вакансии уходят на hh отсюда, отклики возвращаются в общую воронку. Заводить вакансию дважды и переносить людей руками больше не нужно."
        actions={
          list.length > 0 ? (
            <Button onClick={sync} disabled={busy}>
              <Download className="h-4 w-4" /> Забрать отклики
            </Button>
          ) : undefined
        }
      />

      {note && (
        <div className="mb-4">
          <Tag tone={note.tone}>{note.text}</Tag>
        </div>
      )}

      {isDemoMode && (
        <Card className="mb-4 border-l-[3px] border-l-warn">
          <p className="m-0 text-[13.5px] text-ink-2">
            Демо-режим: подключить hh нельзя, нужна база и секреты приложения.
          </p>
        </Card>
      )}

      {accounts.loading ? (
        <Skeleton className="h-40 w-full" />
      ) : list.length === 0 ? (
        <div className="flex flex-col items-start gap-4">
          <EmptyState
            title="Работодатель не подключён"
            description="Нажмите «Подключить» — hh спросит разрешение и вернёт вас обратно. Логин и пароль система не увидит: доступ выдаётся по протоколу, где пароль остаётся у hh."
          />
          <Button onClick={connect} disabled={busy || isDemoMode}>
            <Link2 className="h-4 w-4" /> Подключить работодателя
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((a) => (
            <Card key={a.id} className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <b className="font-display text-[17px] font-semibold">
                    {a.employer_name ?? "Работодатель"}
                  </b>
                  {a.is_active && a.token_valid ? (
                    <Tag tone="good">
                      <CheckCircle2 className="h-3 w-3" /> на связи
                    </Tag>
                  ) : a.is_active ? (
                    <Tag tone="warn">доступ обновится при первой операции</Tag>
                  ) : (
                    <Tag tone="crit">
                      <AlertTriangle className="h-3 w-3" /> нужно подключить заново
                    </Tag>
                  )}
                </div>

                <p className="m-0 text-[13px] text-ink-2">
                  Подключил: {a.manager_name ?? "—"} · опубликовано вакансий: {a.published_count}
                </p>
                <p className="m-0 mt-1 text-[12.5px] text-ink-3">
                  {a.last_sync_at
                    ? `Отклики забирали ${dateTimeRu(a.last_sync_at)}`
                    : "Отклики ещё не забирали"}
                </p>

                {a.last_error && (
                  <p className="m-0 mt-2 max-w-[70ch] rounded-md border border-crit-soft bg-crit-soft px-[10px] py-2 text-[12.5px] text-crit">
                    {a.last_error}
                  </p>
                )}
              </div>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => disconnect(a.id, a.employer_name ?? "работодатель")}
                disabled={busy}
              >
                <Trash2 className="h-4 w-4" /> Отключить
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Card className="mt-6 max-w-[74ch]">
        <b className="mb-2 block font-display text-[15px] font-semibold">
          Что уходит на hh
        </b>
        <p className="m-0 mb-2 text-[13px] text-ink-2">
          Название, описание, требования, условия и вилка — из карточки вакансии.
          Отдельно уходит поле «что реально будет в первый месяц»: на hh такого
          почти никто не пишет, и оно отсеивает не тех до отклика, а не после
          собеседования.
        </p>
        <p className="m-0 text-[13px] text-ink-2">
          Регион и профессиональную роль hh хранит числами. Система подбирает
          их по городу и направлению, но если не угадает — скажет об этом и не
          станет публиковать наугад: вакансия не в том регионе стоит денег
          и приводит не тех людей.
        </p>
      </Card>
    </>
  );
}

/**
 * Страница возврата после авторизации на hh.
 *
 * hh присылает сюда код в адресе. Обмениваем его на доступ и уходим обратно
 * в настройки — задерживаться тут человеку незачем.
 */
export function HhCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string | null>(null);

  useEffect(() => {
    const code = params.get("code");
    const denied = params.get("error");

    if (denied) {
      // Показываем ровно то, что ответил hh. Своя обобщённая фраза вместо
      // его текста уже один раз стоила вечера разбирательств: «доступ не
      // выдан» одинаково выглядит и когда человек нажал «отклонить», и
      // когда не сошёлся адрес возврата, и когда приложению не хватает
      // прав. Диагноз пишет источник, а не мы.
      setError(HH_ERROR[denied] ?? "hh отказал в доступе.");
      setDetails(
        [
          `код: ${denied}`,
          params.get("error_description") ? `hh пишет: ${params.get("error_description")}` : null,
        ].filter(Boolean).join(" · "),
      );
      return;
    }

    if (!code) {
      setError("hh не прислал код авторизации. Попробуйте подключить заново.");
      setDetails(null);
      return;
    }

    api.finishHhConnect(code, params.get("state"))
      .then(() => navigate("/hh", { replace: true }))
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Не удалось подключить");
        setDetails(null);
      });
  }, [params, navigate]);

  return (
    <>
      <PageHeader eyebrow="hh.ru" title={error ? "Не подключилось" : "Подключаем…"} />
      {error ? (
        <Card className="max-w-[72ch] border-l-[3px] border-l-crit">
          <p className="m-0 mb-2 text-[13.5px] text-ink-2">{error}</p>

          {details && (
            <p className="m-0 mb-3 rounded-md border border-border bg-surface-2 px-[10px] py-2 font-mono text-[12px] text-ink-3">
              {details}
            </p>
          )}

          <p className="m-0 mb-3 text-[12.5px] text-ink-3">
            Что проверить в кабинете приложения на dev.hh.ru: адрес возврата
            должен совпадать с этим символ в символ —{" "}
            <span className="font-mono">{window.location.origin}/auth/hh/callback</span>{" "}
            — а входить нужно учётной записью сотрудника компании, не соискателя.
          </p>

          <Button onClick={() => navigate("/hh")}>Вернуться к настройке</Button>
        </Card>
      ) : (
        <Skeleton className="h-24 max-w-[62ch]" />
      )}
    </>
  );
}

/**
 * Коды, которыми отвечает hh при отказе.
 *
 * Перевод не украшательство: «invalid_client» человеку не говорит ничего,
 * а «приложение не узнало себя — проверьте Client Id» отправляет его ровно
 * туда, где ошибка.
 */
const HH_ERROR: Record<string, string> = {
  access_denied:
    "Вы отклонили запрос доступа — или hh счёл, что эта учётная запись не может им распоряжаться. " +
    "Входить нужно сотрудником компании: у соискательского аккаунта таких прав нет.",
  invalid_client:
    "hh не узнал приложение. Обычно это несовпадение Client Id: после перевыпуска ключей " +
    "в секретах проекта должен лежать новый, а не прежний.",
  invalid_request:
    "hh не принял сам запрос. Чаще всего это адрес возврата: он сверяется целиком, " +
    "и лишний слэш в конце уже расхождение.",
  redirect_uri_mismatch:
    "Адрес возврата не совпал с тем, что указан в кабинете приложения. Сверять надо символ в символ.",
  unauthorized_client:
    "Приложению не разрешено запрашивать этот доступ. Проверьте в кабинете на dev.hh.ru, " +
    "что заявка одобрена именно для работодателей.",
};

/**
 * Блок публикации в карточке вакансии.
 *
 * Живёт рядом с самой вакансией, а не в настройках: публикуют её отсюда,
 * и статус нужен там же, где принимают решение.
 */
export function PublishBlock({ vacancyId }: { vacancyId: string }) {
  const pubs = useAsync(() => api.listPublications(vacancyId), [vacancyId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hh = (pubs.data ?? []).find((p) => p.board === "hh" && !p.archived_at);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не получилось");
    } finally {
      setBusy(false);
      pubs.reload();
    }
  }

  if (pubs.loading) return <Skeleton className="h-20 w-full" />;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="font-display text-[15px] font-semibold">Публикация на hh.ru</b>
        {hh ? <Tag tone="good">опубликована</Tag> : <Tag tone="mute">не опубликована</Tag>}
      </div>

      {hh?.external_url && (
        <a
          href={hh.external_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-[6px] text-[13px]"
        >
          <ExternalLink className="h-[14px] w-[14px]" /> Открыть на hh
        </a>
      )}

      {(error || hh?.sync_error) && (
        <p className="m-0 max-w-[70ch] rounded-md border border-crit-soft bg-crit-soft px-[10px] py-2 text-[12.5px] text-crit">
          {error ?? hh?.sync_error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {!hh ? (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => run(() => api.publishToHh(vacancyId))}
          >
            Опубликовать
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => run(() => api.updateOnHh(vacancyId))}
            >
              <RefreshCw className="h-4 w-4" /> Обновить на hh
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => run(() => api.archiveOnHh(vacancyId))}
            >
              Снять с публикации
            </Button>
          </>
        )}
      </div>

      <p className="m-0 text-[12px] text-ink-3">
        Публикация тратит платное размещение из пакета вашего работодателя на hh.
        Обновление — бесплатно.
      </p>
    </Card>
  );
}
