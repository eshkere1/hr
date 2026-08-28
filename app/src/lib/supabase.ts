import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Пока ключей нет, приложение работает на встроенных данных: экраны, роли
 * и переходы можно смотреть сразу, не поднимая базу. Как только в .env
 * появятся ключи — тот же код пойдёт в настоящий PostgreSQL, потому что
 * весь доступ к данным идёт через один слой (lib/api.ts).
 */
export const isDemoMode = !url || !anonKey;

export const supabase: SupabaseClient | null = isDemoMode
  ? null
  : createClient(url!, anonKey!, {
      auth: { persistSession: true, autoRefreshToken: true },
    });

/** Клиент там, где мы уже точно знаем, что не в демо-режиме. */
export function db(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      "Supabase не настроен. Заполните VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env",
    );
  }
  return supabase;
}
