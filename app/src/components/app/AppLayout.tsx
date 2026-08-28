import React, { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutGrid, Briefcase, Users, MessageSquare, FileCheck, BarChart3,
  ClipboardList, CalendarClock, GraduationCap, ShieldCheck, LogOut,
  Menu as MenuIcon, X, UserCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { ROLE_LABEL, type AppRole } from "@/lib/types";
import { isDemoMode } from "@/lib/supabase";
import { Avatar } from "@/components/ui";

interface MenuItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: AppRole[];
}

/**
 * Состав меню зависит от роли. Это не украшение: одинаковый экран для всех
 * означает форму на двадцать полей, которую никто не заполнит.
 *
 * Руководитель подразделения не видит ни базы педагогов, ни аналитики —
 * только свои вакансии. Ограничение настоящее и стоит в RLS; меню лишь
 * не показывает то, что всё равно вернёт пустой ответ.
 */
const MENU: MenuItem[] = [
  { to: "/dashboard", label: "Дашборд", icon: LayoutGrid, roles: ["director", "superuser"] },
  { to: "/pipeline", label: "Воронка", icon: LayoutGrid, roles: ["hr_manager", "superuser"] },
  { to: "/waiting", label: "Ждут меня", icon: CalendarClock, roles: ["dept_head", "line_manager"] },
  { to: "/vacancies", label: "Вакансии", icon: Briefcase, roles: ["director", "hr_manager", "superuser"] },
  { to: "/vacancies", label: "Мои вакансии", icon: Briefcase, roles: ["dept_head", "line_manager"] },
  { to: "/requisitions", label: "Согласования", icon: ClipboardList, roles: ["director", "superuser"] },
  { to: "/requisitions/new", label: "Заявка на подбор", icon: ClipboardList, roles: ["dept_head", "line_manager"] },
  { to: "/candidates", label: "База педагогов", icon: Users, roles: ["hr_manager", "director", "superuser"] },
  { to: "/inbox", label: "Переписка", icon: MessageSquare, roles: ["hr_manager", "superuser"] },
  { to: "/documents", label: "Документы", icon: FileCheck, roles: ["hr_manager", "director", "superuser"] },
  { to: "/analytics", label: "Аналитика", icon: BarChart3, roles: ["director", "hr_manager", "superuser"] },
  { to: "/me", label: "Мой профиль", icon: UserCircle, roles: ["employee"] },
  { to: "/my-status", label: "Мой статус", icon: GraduationCap, roles: ["candidate"] },
  { to: "/my-documents", label: "Мои документы", icon: FileCheck, roles: ["candidate"] },
  { to: "/admin", label: "Пользователи и роли", icon: ShieldCheck, roles: ["superuser"] },
];

/** Куда попадает человек сразу после входа. У каждой роли своё. */
export const HOME_BY_ROLE: Record<AppRole, string> = {
  superuser: "/dashboard",
  director: "/dashboard",
  hr_manager: "/pipeline",
  dept_head: "/waiting",
  line_manager: "/waiting",
  employee: "/me",
  candidate: "/my-status",
};

export function AppLayout() {
  const { profile, roles, primaryRole, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Один маршрут может быть подписан по-разному для разных ролей
  // («Вакансии» и «Мои вакансии»). Показываем его один раз — побеждает
  // подпись, стоящая в списке выше.
  const seen = new Set<string>();
  const visible = MENU.filter((m) => {
    if (!m.roles.some((r) => roles.includes(r))) return false;
    if (seen.has(m.to)) return false;
    seen.add(m.to);
    return true;
  });

  async function onExit() {
    await signOut();
    navigate("/auth", { replace: true });
  }

  const nav = (
    <nav className="flex flex-col gap-[2px]">
      {visible.map((m) => (
        <NavLink
          key={m.to + m.label}
          to={m.to}
          end={m.to === "/vacancies" || m.to === "/requisitions"}
          onClick={() => setMobileOpen(false)}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-[10px] rounded-md px-[11px] py-[9px] text-[13.5px] no-underline transition-colors",
              isActive
                ? "bg-primary-soft font-semibold text-primary"
                : "text-ink-2 hover:bg-surface-2 hover:text-ink",
            )
          }
        >
          <m.icon className="h-4 w-4 shrink-0 opacity-85" />
          {m.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Шапка на узком экране: руководитель заходит с телефона */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface px-4 py-3 lg:hidden">
        <div className="font-display text-[17px] font-bold tracking-[-0.015em]">Растим</div>
        <button
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? "Закрыть меню" : "Открыть меню"}
          className="grid h-11 w-11 place-items-center rounded-md text-ink-2 hover:bg-surface-2"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
        </button>
      </div>

      <div className="mx-auto flex max-w-[1400px] gap-8 px-4 lg:px-7">
        <aside
          className={cn(
            "w-[214px] shrink-0 flex-col gap-5 py-6 lg:sticky lg:top-0 lg:flex lg:h-screen",
            mobileOpen
              ? "fixed inset-x-0 top-[57px] z-20 flex h-[calc(100vh-57px)] w-full overflow-y-auto border-b border-border bg-background px-4"
              : "hidden",
          )}
        >
          <div className="hidden lg:block">
            <div className="font-display text-[18px] font-bold leading-[1.2] tracking-[-0.015em]">
              Растим
            </div>
            <span className="mt-[7px] block text-[10.5px] font-medium uppercase tracking-[0.11em] text-ink-3">
              найм педагогов
            </span>
          </div>

          {nav}

          <div className="mt-auto flex flex-col gap-3 border-t border-border pt-4">
            {isDemoMode && (
              <div className="rounded-md border border-warn-soft bg-warn-soft px-[10px] py-2 text-[11.5px] leading-snug text-warn">
                Демо-режим: данные встроенные. Подключите Supabase в <code className="font-mono">.env</code>, чтобы работать с базой.
              </div>
            )}
            <div className="flex items-center gap-[10px]">
              <Avatar name={profile?.full_name ?? "?"} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{profile?.full_name}</div>
                <div className="truncate text-[11px] text-ink-3">
                  {primaryRole ? ROLE_LABEL[primaryRole] : ""}
                </div>
              </div>
            </div>
            <button
              onClick={onExit}
              className="flex items-center gap-2 rounded-md px-2 py-2 text-[13px] text-ink-3 hover:bg-surface-2 hover:text-ink"
            >
              <LogOut className="h-4 w-4" /> Выйти
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 py-6 lg:py-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
