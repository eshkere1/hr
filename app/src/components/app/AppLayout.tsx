import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutGrid, Briefcase, Users, MessageSquare, FileCheck, BarChart3,
  ClipboardList, CalendarClock, GraduationCap, ShieldCheck, LogOut,
  Columns3, Archive as ArchiveIcon, FileSignature, CalendarDays, SlidersHorizontal,
  Menu as MenuIcon, X, UserCircle, Sun, PanelLeftClose, PanelLeftOpen, Bot,
  UserCheck, Award, CalendarRange, Globe,
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

interface MenuGroup {
  title: string;
  items: MenuItem[];
}

/**
 * Меню собрано от того, что человек делает за день, а не от списка функций.
 *
 * «Сегодня» — то, ради чего HR открывает систему утром: кому ответить,
 * кого обзвонить, кто ждёт решения. «Люди» — работа с базой. «Найм» —
 * ведение вакансий. «Итоги» — цифры для руководителя.
 *
 * Порядок групп повторяет частоту обращения: сверху то, что открывают
 * каждый день, снизу то, что настраивают раз в квартал.
 */
const GROUPS: MenuGroup[] = [
  {
    title: "Сегодня",
    items: [
      { to: "/today", label: "Мой день", icon: Sun, roles: ["hr_manager", "superuser"] },
      { to: "/waiting", label: "Ждут меня", icon: CalendarClock, roles: ["dept_head", "line_manager"] },
      { to: "/inbox", label: "Мессенджер", icon: MessageSquare, roles: ["hr_manager", "superuser"] },
      { to: "/dashboard", label: "Дашборд", icon: LayoutGrid, roles: ["director"] },
    ],
  },
  {
    title: "Люди",
    items: [
      { to: "/people", label: "Все люди", icon: Users, roles: ["hr_manager", "director", "superuser"] },
      { to: "/archive", label: "Подбор из базы", icon: ArchiveIcon, roles: ["hr_manager", "superuser"] },
      { to: "/compare", label: "Сравнение", icon: Columns3, roles: ["hr_manager", "dept_head", "line_manager", "director", "superuser"] },
    ],
  },
  {
    title: "Найм",
    items: [
      { to: "/pipeline", label: "Воронка", icon: Columns3, roles: ["hr_manager", "superuser"] },
      { to: "/vacancies", label: "Вакансии", icon: Briefcase, roles: ["director", "hr_manager", "superuser"] },
      { to: "/vacancies", label: "Мои вакансии", icon: Briefcase, roles: ["dept_head", "line_manager"] },
      { to: "/requisitions", label: "Согласования", icon: ClipboardList, roles: ["director", "superuser"] },
      { to: "/requisitions/new", label: "Заявка на подбор", icon: ClipboardList, roles: ["dept_head", "line_manager"] },
      { to: "/calendar", label: "Календарь", icon: CalendarDays, roles: ["hr_manager", "dept_head", "line_manager", "superuser"] },
      { to: "/offers", label: "Офферы", icon: FileSignature, roles: ["hr_manager", "director", "superuser"] },
      { to: "/documents", label: "Документы", icon: FileCheck, roles: ["hr_manager", "director", "superuser"] },
    ],
  },
  {
    title: "После найма",
    items: [
      { to: "/employees", label: "Сотрудники", icon: UserCheck, roles: ["hr_manager", "director", "dept_head", "line_manager", "superuser"] },
      { to: "/mentorships", label: "Наставничество", icon: Award, roles: ["hr_manager", "director", "superuser"] },
      { to: "/materials", label: "Материалы", icon: GraduationCap, roles: ["hr_manager", "director", "dept_head", "line_manager", "employee", "superuser"] },
    ],
  },
  {
    title: "Итоги",
    items: [
      { to: "/dashboard", label: "Дашборд", icon: LayoutGrid, roles: ["superuser"] },
      { to: "/analytics", label: "Аналитика", icon: BarChart3, roles: ["director", "hr_manager", "superuser"] },
      { to: "/seasonality", label: "Сезонность", icon: CalendarRange, roles: ["director", "hr_manager", "superuser"] },
    ],
  },
  {
    title: "Настройка",
    items: [
      { to: "/settings", label: "Ценности и данные", icon: SlidersHorizontal, roles: ["hr_manager", "director", "superuser"] },
      { to: "/bots", label: "Боты", icon: Bot, roles: ["superuser"] },
      { to: "/hh", label: "hh.ru", icon: Globe, roles: ["hr_manager", "director", "superuser"] },
      { to: "/admin", label: "Пользователи и роли", icon: ShieldCheck, roles: ["superuser"] },
    ],
  },
  {
    title: "Моё",
    items: [
      { to: "/me", label: "Мой профиль", icon: UserCircle, roles: ["employee"] },
      { to: "/my-status", label: "Мой статус", icon: GraduationCap, roles: ["candidate"] },
      { to: "/my-documents", label: "Мои документы", icon: FileCheck, roles: ["candidate"] },
    ],
  },
];

/** Куда попадает человек сразу после входа. У каждой роли своё. */
export const HOME_BY_ROLE: Record<AppRole, string> = {
  superuser: "/dashboard",
  director: "/dashboard",
  hr_manager: "/today",
  dept_head: "/waiting",
  line_manager: "/waiting",
  employee: "/me",
  candidate: "/my-status",
};

const COLLAPSE_KEY = "rastim.menu.collapsed";

export function AppLayout() {
  const { profile, roles, primaryRole, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Свёрнутое меню запоминается: человек настроил один раз и не возвращается
  // к этому решению каждое утро.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* приватный режим — просто оставляем развёрнутым */
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* не критично */
      }
      return next;
    });
  }

  // Один маршрут может быть подписан по-разному для разных ролей
  // («Вакансии» и «Мои вакансии»). Показываем его один раз.
  const seen = new Set<string>();
  const visibleGroups = GROUPS.map((g) => ({
    title: g.title,
    items: g.items.filter((m) => {
      if (!m.roles.some((r) => roles.includes(r))) return false;
      if (seen.has(m.to)) return false;
      seen.add(m.to);
      return true;
    }),
  })).filter((g) => g.items.length > 0);

  async function onExit() {
    await signOut();
    navigate("/auth", { replace: true });
  }

  const nav = (
    <nav className="flex flex-col gap-4">
      {visibleGroups.map((g) => (
        <div key={g.title} className="flex flex-col gap-[2px]">
          {collapsed ? (
            <div className="mx-auto mb-1 h-px w-6 bg-border" aria-hidden="true" />
          ) : (
            <div className="px-[11px] pb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
              {g.title}
            </div>
          )}
          {g.items.map((m) => (
            <NavLink
              key={m.to + m.label}
              to={m.to}
              end={m.to === "/vacancies" || m.to === "/requisitions"}
              onClick={() => setMobileOpen(false)}
              title={collapsed ? m.label : undefined}
              className={({ isActive }) =>
                cn(
                  "flex items-center rounded-md text-[13.5px] no-underline transition-colors",
                  collapsed ? "justify-center px-0 py-[10px]" : "gap-[10px] px-[11px] py-[9px]",
                  isActive
                    ? "bg-primary-soft font-semibold text-primary"
                    : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                )
              }
            >
              <m.icon className="h-4 w-4 shrink-0 opacity-85" />
              {!collapsed && m.label}
            </NavLink>
          ))}
        </div>
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

      <div className="mx-auto flex max-w-[1600px] gap-6 px-4 lg:gap-8 lg:px-7">
        <aside
          className={cn(
            "shrink-0 flex-col gap-5 py-6 transition-[width] duration-150 lg:sticky lg:top-0 lg:flex lg:h-screen",
            collapsed ? "lg:w-[60px]" : "lg:w-[214px]",
            mobileOpen
              ? "fixed inset-x-0 top-[57px] z-20 flex h-[calc(100vh-57px)] w-full overflow-y-auto border-b border-border bg-background px-4"
              : "hidden",
          )}
        >
          <div className="hidden items-start justify-between gap-2 lg:flex">
            {!collapsed && (
              <div className="min-w-0">
                <div className="font-display text-[18px] font-bold leading-[1.2] tracking-[-0.015em]">
                  Растим
                </div>
                <span className="mt-[7px] block text-[10.5px] font-medium uppercase tracking-[0.11em] text-ink-3">
                  найм и отбор
                </span>
              </div>
            )}
            <button
              onClick={toggleCollapsed}
              title={collapsed ? "Развернуть меню" : "Свернуть меню"}
              aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
              className={cn(
                "grid h-8 w-8 shrink-0 place-items-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink",
                collapsed && "mx-auto",
              )}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-[18px] w-[18px]" />
              ) : (
                <PanelLeftClose className="h-[18px] w-[18px]" />
              )}
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">{nav}</div>

          <div className="flex flex-col gap-3 border-t border-border pt-4">
            {isDemoMode && !collapsed && (
              <div className="rounded-md border border-warn-soft bg-warn-soft px-[10px] py-2 text-[11.5px] leading-snug text-warn">
                Демо-режим: данные встроенные. Подключите Supabase в <code className="font-mono">.env</code>, чтобы работать с базой.
              </div>
            )}
            <div className={cn("flex items-center gap-[10px]", collapsed && "justify-center")}>
              <Avatar name={profile?.full_name ?? "?"} size="sm" />
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">{profile?.full_name}</div>
                  <div className="truncate text-[11px] text-ink-3">
                    {primaryRole ? ROLE_LABEL[primaryRole] : ""}
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={onExit}
              title={collapsed ? "Выйти" : undefined}
              className={cn(
                "flex items-center rounded-md py-2 text-[13px] text-ink-3 hover:bg-surface-2 hover:text-ink",
                collapsed ? "justify-center px-0" : "gap-2 px-2",
              )}
            >
              <LogOut className="h-4 w-4" />
              {!collapsed && "Выйти"}
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
