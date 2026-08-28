import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as api from "@/lib/api";
import { isDemoMode, supabase } from "@/lib/supabase";
import type { AppRole, Profile } from "@/lib/types";

interface AuthValue {
  loading: boolean;
  userId: string | null;
  profile: Profile | null;
  roles: AppRole[];
  /** Есть ли у текущего пользователя хотя бы одна из перечисленных ролей. */
  can: (...roles: AppRole[]) => boolean;
  /** Роль, по которой строится меню и стартовый экран. */
  primaryRole: AppRole | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/**
 * Роли читаются ТОЛЬКО из базы. Ни localStorage, ни метаданные пользователя
 * источником прав не являются: то, что лежит на клиенте, клиент и подделает.
 * В демо-режиме роль хранится локально — но там и базы нет, а настоящая
 * проверка всё равно живёт в политиках RLS.
 */
const ROLE_PRIORITY: AppRole[] = [
  "superuser", "director", "hr_manager", "dept_head", "line_manager", "employee", "candidate",
];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);

  const refresh = useCallback(async () => {
    const session = await api.getSession();
    if (session) {
      setUserId(session.userId);
      setProfile(session.profile);
      setRoles(session.roles);
    } else {
      setUserId(null);
      setProfile(null);
      setRoles([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    if (isDemoMode || !supabase) return;
    const { data } = supabase.auth.onAuthStateChange(() => void refresh());
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  const value = useMemo<AuthValue>(() => {
    const can = (...wanted: AppRole[]) => wanted.some((r) => roles.includes(r));
    const primaryRole = ROLE_PRIORITY.find((r) => roles.includes(r)) ?? null;
    return {
      loading, userId, profile, roles, can, primaryRole, refresh,
      signOut: async () => {
        await api.signOut();
        await refresh();
      },
    };
  }, [loading, userId, profile, roles, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth вызван вне AuthProvider");
  return ctx;
}
