import type { SessionDoc } from "../lib/merge.ts";
import { retryDelay } from "../lib/retry.ts";

const endpoint = (id: string) => `/api/sessions/${id}`;

export const retrying = (run: () => Promise<boolean>) => {
  let timer = 0;
  let attempt = 0;

  const go = async () => {
    if (await run()) {
      attempt = 0;
      return;
    }
    attempt += 1;
    const delay = retryDelay(attempt);
    if (delay === null) return;
    timer = window.setTimeout(() => void go(), delay);
  };

  return () => {
    clearTimeout(timer);
    attempt = 0;
    void go();
  };
};

export const keepSynced = (run: () => void) => {
  run();
  addEventListener("online", run);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) run();
  });
};

export const keepListening = (id: string, run: () => void) => {
  let missable = false;

  const connect = () =>
    new Promise<boolean>((settle) => {
      const stream = new EventSource(`${endpoint(id)}/events`);
      let pending = true;

      stream.addEventListener("open", () => {
        if (missable) run();
        missable = true;
        if (!pending) return;
        pending = false;
        settle(true);
      });

      stream.addEventListener("message", run);

      stream.addEventListener("error", () => {
        if (stream.readyState !== EventSource.CLOSED) return;
        missable = true;
        if (!pending) return revive();
        pending = false;
        settle(false);
      });
    });

  const revive = retrying(connect);
  revive();
};

export const pushDoc = async (id: string, device: string, doc: SessionDoc) => {
  try {
    const sent = await fetch(endpoint(id), {
      method: "POST",
      body: new URLSearchParams({ device, doc: JSON.stringify(doc) }),
    });
    return sent.ok;
  } catch {
    return false;
  }
};

export const exchange = async (id: string, device: string, own: SessionDoc) => {
  const sent = await pushDoc(id, device, own);
  try {
    const pulled = await fetch(endpoint(id));
    return { sent, docs: (await pulled.json()) as string[] };
  } catch {
    return null;
  }
};
