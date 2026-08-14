import { emptyDoc, mergeDocs, type SessionDoc } from "./merge.ts";

export type StoredSession = { id: string; docs: SessionDoc[] };

const descending = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);

export const localList = (sessions: StoredSession[]) =>
  sessions
    .flatMap((session) => {
      const merged = mergeDocs(session.docs);
      return merged === null ? [] : [{ id: session.id, ...merged }];
    })
    .sort(
      (a, b) =>
        descending(a.created_at ?? "", b.created_at ?? "") ||
        descending(a.id, b.id),
    );

export const ownDoc = (docs: SessionDoc[], device: string) =>
  docs.find((doc) => doc.device === device) ?? emptyDoc(device);

export const upsertDoc = (docs: SessionDoc[], doc: SessionDoc) =>
  docs.some((held) => held.device === doc.device)
    ? docs.map((held) => (held.device === doc.device ? doc : held))
    : [...docs, doc];
