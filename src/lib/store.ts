import { emptyDoc, mergeDocs, parseDoc, type SessionDoc } from "./merge.ts";

export type StoredSession = { id: string; docs: SessionDoc[] };

const descending = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);

const same = (a: SessionDoc, b: SessionDoc) =>
  JSON.stringify(a) === JSON.stringify(b);

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

export const mergePulled = (
  docs: SessionDoc[],
  pulled: string[],
  device: string,
) =>
  pulled.reduce((held, raw) => {
    const doc = parseDoc(raw);
    return doc === null ||
      doc.device === device ||
      held.some((kept) => same(kept, doc))
      ? held
      : upsertDoc(held, doc);
  }, docs);

export const applyPulled = (
  session: StoredSession,
  pulled: string[],
  device: string,
): StoredSession | null => {
  const docs = mergePulled(session.docs, pulled, device);
  return docs === session.docs ? null : { id: session.id, docs };
};
