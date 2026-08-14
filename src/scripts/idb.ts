import { generateDeviceId } from "../lib/id.ts";
import type { StoredSession } from "../lib/store.ts";

const sessions = "sessions";
const meta = "meta";
const device = "device";

const wrap = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

const open = () => {
  const request = indexedDB.open("makan", 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore(sessions, { keyPath: "id" });
    request.result.createObjectStore(meta);
  };
  return wrap(request);
};

let connection: Promise<IDBDatabase> | undefined;

const transaction = async (name: string, mode: IDBTransactionMode) => {
  connection ??= open();
  return (await connection).transaction(name, mode);
};

export const allSessions = async () => {
  const tx = await transaction(sessions, "readonly");
  return wrap<StoredSession[]>(tx.objectStore(sessions).getAll());
};

export const readSession = async (id: string) => {
  const tx = await transaction(sessions, "readonly");
  return wrap<StoredSession | undefined>(tx.objectStore(sessions).get(id));
};

export const writeSession = async (session: StoredSession) => {
  const tx = await transaction(sessions, "readwrite");
  tx.objectStore(sessions).put(session);
  return done(tx);
};

export const deviceId = async () => {
  const tx = await transaction(meta, "readwrite");
  const store = tx.objectStore(meta);
  const held = await wrap<string | undefined>(store.get(device));
  if (held !== undefined) return held;

  const id = generateDeviceId();
  store.put(id, device);
  await done(tx);
  return id;
};
