import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { generateSessionId } from "../src/lib/id.ts";
import { creatorDoc } from "../src/lib/merge.ts";

const entry = "dist/server/entry.mjs";
const startTimeout = 20_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const startServer = async (env: Record<string, string> = {}) => {
  const dir = await mkdtemp(join(tmpdir(), "makan-e2e-"));
  const db = resolve(dir, "makan.db");
  assert.notEqual(db, resolve("data/makan.db"));

  const child = spawn(process.execPath, [entry], {
    env: { ...process.env, MAKAN_DB: db, HOST: "127.0.0.1", PORT: "0", ...env },
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf-8");
  child.stderr.setEncoding("utf-8");

  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const stop = async () => {
    if (child.exitCode === null) {
      child.kill();
      await once(child, "exit");
    }
    await rm(dir, { recursive: true, force: true });
  };

  const startupError = (message: string) =>
    new Error(
      `${message}\n--- stdout: ---\n${stdout}\n--- stderr: ---\n${stderr}`,
    );

  const deadline = Date.now() + startTimeout;
  let port = 0;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited with code ${child.exitCode}`);
    }
    if (port === 0) {
      const match = stdout.match(/http:\/\/\S+:(\d+)/);
      if (match?.[1]) port = Number(match[1]);
    } else {
      try {
        const origin = `http://127.0.0.1:${port}`;
        const res = await fetch(`${origin}`, { redirect: "manual" });
        await res.arrayBuffer();
        return { origin, stop };
      } catch {}
    }
    await sleep(50);
  }
  await stop();
  throw startupError("timed out waiting for server to listen");
};

export const postForm = (
  origin: string,
  path: string,
  fields: Record<string, string>,
) =>
  fetch(`${origin}${path}`, {
    method: "POST",
    headers: { origin },
    body: new URLSearchParams(fields),
    redirect: "manual",
  });

export const putDoc = (
  origin: string,
  id: string,
  device: string,
  doc: string,
) => postForm(origin, `/api/sessions/${id}`, { device, doc });

type Seed = { title?: string; places?: string[]; device?: string };

export const seedSession = async (origin: string, seed: Seed = {}) => {
  const id = generateSessionId();
  const device = seed.device ?? "a3f1";
  const doc = creatorDoc(
    device,
    seed.title ?? "Sesi uji",
    seed.places ?? ["Warteg", "Padang"],
    "2026-08-14 03:00:00",
  );

  const res = await putDoc(origin, id, device, JSON.stringify(doc));
  assert.equal(res.status, 204);
  return `/s/${id}`;
};
