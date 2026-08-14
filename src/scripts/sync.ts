import type { SessionDoc } from "../lib/merge.ts";

const endpoint = (id: string) => `/api/sessions/${id}`;

const post = (id: string, device: string, doc: SessionDoc) =>
  fetch(endpoint(id), {
    method: "POST",
    body: new URLSearchParams({ device, doc: JSON.stringify(doc) }),
  });

export const keepSynced = (run: () => void) => {
  run();
  addEventListener("online", run);
};

export const keepListening = (id: string, run: () => void) => {
  const stream = new EventSource(`${endpoint(id)}/events`);
  stream.addEventListener("message", run);
};

export const pushDoc = async (id: string, device: string, doc: SessionDoc) => {
  try {
    await post(id, device, doc);
  } catch {}
};

export const exchange = async (id: string, device: string, own: SessionDoc) => {
  try {
    await post(id, device, own);
    const pulled = await fetch(endpoint(id));
    return (await pulled.json()) as string[];
  } catch {
    return [];
  }
};
