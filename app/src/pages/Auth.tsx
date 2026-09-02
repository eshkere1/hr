import { useState } from "react";
import { useNavigate } from "react-router-dom";
import * as api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { isDemoMode } from "@/lib/supabase";
import { Button, Card, Field, Input, Tabs } from "@/components/ui";
import { ROLE_LABEL, type AppRole } from "@/lib/types";
import * as demo from "@/lib/demoData";
import { HOME_BY_ROLE } from "@/components/app/AppLayout";

/**
 * Вход.
 *
 * В демо-режиме вместо пароля предлагается выбрать роль: смысл платформы
 * в том, что у каждой роли свой экран, и увидеть это можно только войдя
 * каждой из них.
 */
export default function Auth() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function enterAsDemo(userId: string, roles: AppRole[]) {
    await api.signInDemo(userId, roles);
    await refresh();
    navigate(HOME_BY_ROLE[roles[0]], { replace: true });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        await api.signIn(email, password);
        await refresh();
        navigate("/", { replace: true });
      } else {
        await api.signUp(email, password, fullName);
        setSent(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось войти");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[1000px] flex-col justify-center px-5 py-10">
      <header className="mb-8">
        <div className="font-display text-[22px] font-bold tracking-[-0.015em]">Растим</div>
        <p className="mt-2 max-w-[52ch] text-[15px] text-ink-2">
          Платформа найма. Срок закрытия вакансии и отсев на
          испытательном — два числа, которыми меряется её работа.
        </p>
      </header>

      {isDemoMode ? (
        <Card>
          <h1 className="m-0 font-display text-[19px] font-semibold tracking-[-0.01em]">
            Войдите ролью
          </h1>
          <p className="mb-5 mt-2 max-w-[62ch] text-[13.5px] text-ink-2">
            Ключи Supabase не заданы, поэтому приложение работает на встроенных
            данных. Каждая роль видит свой набор экранов — это главное решение
            продукта, и проверять его нужно именно так.
          </p>

          <div className="grid gap-2 sm:grid-cols-2">
            {api.DEMO_USERS.map((u, i) => {
              const person = demo.staff.find((s) => s.id === u.id);
              const label = u.roles.map((r) => ROLE_LABEL[r]).join(" + ");
              return (
                <button
                  key={i}
                  onClick={() => void enterAsDemo(u.id, u.roles)}
                  className="flex flex-col gap-1 rounded-md border border-border bg-surface p-4 text-left transition-colors hover:border-primary hover:bg-primary-soft"
                >
                  <b className="text-[14px]">{label}</b>
                  <span className="text-[12.5px] text-ink-3">
                    {person?.full_name}
                    {person?.position_title ? ` · ${person.position_title}` : ""}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mb-0 mt-5 border-t border-border pt-4 text-[12.5px] text-ink-3">
            Чтобы работать с настоящей базой, скопируйте <code className="font-mono">.env.example</code>{" "}
            в <code className="font-mono">.env</code>, впишите ключи проекта Supabase
            и перезапустите сервер — этот экран сменится на обычный вход.
          </p>
        </Card>
      ) : (
        <Card className="max-w-[420px]">
          <Tabs
            value={mode}
            onChange={(m) => {
              setMode(m);
              setError(null);
              setSent(false);
            }}
            tabs={[
              { id: "signin", label: "Войти" },
              { id: "signup", label: "Регистрация" },
            ]}
          />

          {sent ? (
            <p className="mt-5 text-[13.5px] text-ink-2">
              Мы отправили письмо на {email}. Откройте его и перейдите по ссылке,
              чтобы подтвердить почту.
            </p>
          ) : (
            <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
              {mode === "signup" && (
                <Field label="Как вас зовут" htmlFor="name">
                  <Input
                    id="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    autoComplete="name"
                    required
                  />
                </Field>
              )}

              <Field label="Рабочая почта" htmlFor="email">
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </Field>

              <Field
                label="Пароль"
                htmlFor="password"
                hint={mode === "signup" ? "Не короче шести символов" : undefined}
                error={error}
              >
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  aria-invalid={Boolean(error)}
                  required
                />
              </Field>

              <Button type="submit" disabled={busy}>
                {mode === "signin" ? "Войти" : "Создать аккаунт"}
              </Button>

              {mode === "signup" && (
                <p className="m-0 text-xs text-ink-3">
                  Новый аккаунт получает роль «Кандидат». Повысить её может только
                  суперпользователь — это защита от того, чтобы человек назначил
                  права себе сам.
                </p>
              )}
            </form>
          )}
        </Card>
      )}
    </div>
  );
}
