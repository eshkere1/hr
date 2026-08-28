import { useCallback, useEffect, useRef, useState } from "react";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Загрузка данных без внешней библиотеки: в этом приложении запросов немного,
 * и лишний слой кеширования только скрыл бы, что откуда берётся.
 *
 * deps — как у useEffect: список значений, при смене которых надо перечитать.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // Чтобы ответ отменённого запроса не перезаписал свежий
  const runId = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    const id = ++runId.current;
    setLoading(true);
    setError(null);
    fnRef
      .current()
      .then((result) => {
        if (id === runId.current) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (id === runId.current) {
          setError(e instanceof Error ? e.message : "Не удалось загрузить данные");
          setLoading(false);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload };
}
