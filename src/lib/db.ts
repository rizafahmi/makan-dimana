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
  return connection;
};

const store = globalThis as typeof globalThis & { makanDb?: DatabaseSync };

export const db = (store.makanDb ??= open());
