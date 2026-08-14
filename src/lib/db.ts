import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const file = resolve(process.env.MAKAN_DB ?? "data/makan.db");

const open = () => {
  mkdirSync(dirname(file), { recursive: true });

  const connection = new DatabaseSync(file);
  const mode = connection
    .prepare("PRAGMA journal_mode = DELETE")
    .get()?.journal_mode;

  if (mode !== "delete") {
    throw new Error(
      `MAKAN_DB opened with journal_mode ${mode}, expected delete`,
    );
  }
  connection.exec(`
  CREATE TABLE IF NOT EXISTS session_docs (
      session_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      doc TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (session_id, device_id)
    )
  `);
  return connection;
};

const store = globalThis as typeof globalThis & { makanDb?: DatabaseSync };

export const db = (store.makanDb ??= open());

export const putDoc = (sessionId: string, deviceId: string, doc: string) => {
  db.prepare(
    "INSERT OR REPLACE INTO session_docs (session_id, device_id, doc) VALUES (?, ?, ?)",
  ).run(sessionId, deviceId, doc);
};

export const listDocs = (sessionId: string) =>
  db
    .prepare("SELECT doc FROM session_docs WHERE session_id = ?")
    .all(sessionId)
    .map((row) => String(row.doc));
