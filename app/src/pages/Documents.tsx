import * as api from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import {
  Card, Skeleton, Table, TableWrap, Tag, Td, Th,
} from "@/components/ui";
import { CandidateLine, EmptyState, PageHeader } from "@/components/app/primitives";
import { DOCUMENT_LABEL, type DocumentState } from "@/lib/types";
import { dateRu } from "@/lib/utils";

/**
 * Допуск к работе с детьми.
 *
 * Ниша, которой нет у универсальных конкурентов: без справки и медкнижки
 * педагога просто не пустят к детям. Статус считается из даты триггером
 * в базе и не редактируется руками — иначе он врёт.
 */
const STATE_VIEW: Record<DocumentState, { tone: "good" | "warn" | "crit" | "info" | "mute"; label: string }> = {
  valid: { tone: "good", label: "В порядке" },
  expiring: { tone: "warn", label: "Истекает" },
  expired: { tone: "crit", label: "Просрочен" },
  missing: { tone: "mute", label: "Не загружен" },
  pending: { tone: "info", label: "На проверке" },
  rejected: { tone: "crit", label: "Отклонён" },
};

export default function Documents() {
  const docs = useAsync(() => api.listDocuments(), []);
  const list = docs.data ?? [];

  const problems = list.filter((d) => ["expired", "expiring", "missing"].includes(d.state));

  return (
    <>
      <PageHeader
        eyebrow="Допуск к работе с детьми"
        title="Документы"
        description="Сначала то, что горит: просроченное и истекающее в ближайший месяц. Без действующей справки и медкнижки отклик нельзя двинуть на оффер."
      />

      {docs.loading ? (
        <Skeleton className="h-56 w-full" />
      ) : list.length === 0 ? (
        <EmptyState
          title="Документов пока нет"
          description="Кандидаты присылают справки прямо в чат бота — здесь появится чек-лист по каждому."
        />
      ) : (
        <>
          {problems.length > 0 && (
            <Card className="mb-4 border-l-[3px] border-l-warn">
              <p className="m-0 text-[13.5px] text-ink-2">
                Требует действий:{" "}
                <b className="font-mono tabular-nums">{problems.length}</b> из{" "}
                <span className="font-mono tabular-nums">{list.length}</span> документов.
                Продление медкнижки занимает до двух недель — напоминать нужно заранее,
                а не в день выхода.
              </p>
            </Card>
          )}

          <TableWrap>
            <Table className="min-w-[680px]">
              <thead>
                <tr>
                  <Th>Педагог</Th>
                  <Th>Документ</Th>
                  <Th>Статус</Th>
                  <Th className="text-right">Действует до</Th>
                </tr>
              </thead>
              <tbody>
                {list.map((d) => {
                  const view = STATE_VIEW[d.state];
                  return (
                    <tr key={d.id} className="hover:bg-surface-2">
                      <Td>
                        <CandidateLine name={d.candidate_name} />
                      </Td>
                      <Td className="text-ink-2">{DOCUMENT_LABEL[d.kind]}</Td>
                      <Td>
                        <Tag tone={view.tone}>{view.label}</Tag>
                      </Td>
                      <Td className="text-right font-mono tabular-nums text-ink-2">
                        {d.expires_on ? dateRu(d.expires_on) : "бессрочно"}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableWrap>
        </>
      )}
    </>
  );
}
