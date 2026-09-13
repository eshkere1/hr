/**
 * storage-purge — убирает файлы, которые база пометила к удалению.
 *
 * Зачем отдельная функция. Обезличивание кандидата (152-ФЗ, право на
 * забвение) обязано убирать не только строки, но и файлы: скан паспорта,
 * оставшийся в хранилище после «удаления данных», — это те же персональные
 * данные. Но удалять из storage напрямую в SQL платформа запрещает
 * триггером, и правильно: строку убрать легко, а байты остались бы навсегда.
 *
 * Поэтому база складывает пути в очередь, а разбирает её эта функция —
 * у неё есть служебный ключ и доступ к API хранилища.
 *
 * Кто зовёт: приложение, когда его открывает кадровик, и планировщик, если
 * его настроить. Оба варианта равноправны — очередь переживает и то, что
 * сегодня не пришёл никто.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });

// За один заход берём столько, чтобы уложиться в время выполнения функции.
// Остальное подождёт следующего вызова — очередь никуда не денется.
const BATCH = 200;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const isService = auth.includes(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

  if (!isService) {
    const { data: userData } = await admin.auth.getUser(auth.replace("Bearer ", ""));
    const userId = userData.user?.id;
    if (!userId) return json({ error: "не авторизован" }, 401);

    const [hr, su] = await Promise.all([
      admin.rpc("has_role", { _user_id: userId, _role: "hr_manager" }),
      admin.rpc("has_role", { _user_id: userId, _role: "superuser" }),
    ]);
    if (!hr.data && !su.data) return json({ error: "нужны права кадровика" }, 403);
  }

  const { data: rows, error } = await admin
    .from("storage_purge_queue")
    .select("id, bucket, path")
    .is("purged_at", null)
    .order("queued_at")
    .limit(BATCH);

  if (error) return json({ error: error.message }, 500);
  if (!rows || rows.length === 0) return json({ убрано: 0, осталось: 0 });

  // Хранилище принимает пути пачкой, но только в пределах одной корзины.
  const byBucket = new Map<string, { id: string; path: string }[]>();
  for (const r of rows) {
    const list = byBucket.get(r.bucket) ?? [];
    list.push({ id: r.id, path: r.path });
    byBucket.set(r.bucket, list);
  }

  let done = 0;
  const problems: string[] = [];

  for (const [bucket, list] of byBucket) {
    const { error: rmErr } = await admin.storage.from(bucket).remove(list.map((x) => x.path));

    if (rmErr) {
      // Отмечаем ошибку в самих записях, а не только в ответе: запись
      // останется в очереди, и через неделю будет видно, что мешает.
      problems.push(`${bucket}: ${rmErr.message}`);
      await admin.from("storage_purge_queue")
        .update({ last_error: rmErr.message })
        .in("id", list.map((x) => x.id));
      continue;
    }

    // Хранилище отвечает успехом и на путь, которого уже нет. Это то, что
    // нужно: повторная уборка не должна застревать на файле, убранном руками.
    await admin.from("storage_purge_queue")
      .update({ purged_at: new Date().toISOString(), last_error: null })
      .in("id", list.map((x) => x.id));

    done += list.length;
  }

  const { count } = await admin
    .from("storage_purge_queue")
    .select("id", { count: "exact", head: true })
    .is("purged_at", null);

  return json({ убрано: done, осталось: count ?? 0, проблемы: problems.length ? problems : undefined });
});
