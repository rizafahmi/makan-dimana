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
  CREATE TABLE IF NOT EXISTS vote_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL CHECK (length(title) > 0),
      is_open INTEGER NOT NULL DEFAULT 1 CHECK (is_open IN (0, 1)),
      place1_name TEXT NOT NULL CHECK (length(place1_name) > 0),
      place1_votes INTEGER NOT NULL DEFAULT 0 CHECK (place1_votes >= 0),
      place2_name TEXT NOT NULL CHECK (length(place2_name) > 0),
      place2_votes INTEGER NOT NULL DEFAULT 0 CHECK (place2_votes >= 0),
      place3_name TEXT CHECK (place3_name IS NULL OR length(place3_name) >
0),
      place3_votes INTEGER NOT NULL DEFAULT 0 CHECK (place3_votes >= 0),
      place4_name TEXT CHECK (place4_name IS NULL OR length(place4_name) >0),
      place4_votes INTEGER NOT NULL DEFAULT 0 CHECK (place4_votes >= 0),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  return connection;
};

const store = globalThis as typeof globalThis & { makanDb?: DatabaseSync };

export const db = (store.makanDb ??= open());
