import type { SessionDoc } from "../lib/merge.ts";

const endpoint = (id: string) => `/api/sessions/${id}`;

export const keepSynced = (run: () => void) => {
  run();
  addEventListener("online", run);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") run();
  });
};

export const exchange = async (id: string, device: string, own: SessionDoc) => {
  try {
    await fetch(endpoint(id), {
      method: "POST",
      body: new URLSearchParams({ device, doc: JSON.stringify(own) }),
    });
    const pulled = await fetch(endpoint(id));
    return (await pulled.json()) as string[];
  } catch {
    return [];
  }
};
