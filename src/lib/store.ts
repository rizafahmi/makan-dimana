import { emptyDoc, type SessionDoc } from "./merge.ts";

export const ownDoc = (docs: SessionDoc[], device: string) =>
  docs.find((doc) => doc.device === device) ?? emptyDoc(device);

export const upsertDoc = (docs: SessionDoc[], doc: SessionDoc) =>
  docs.some((held) => held.device === doc.device)
    ? docs.map((held) => (held.device === doc.device ? doc : held))
    : [...docs, doc];
