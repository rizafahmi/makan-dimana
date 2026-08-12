import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const entry = "dist/server/entry.mjs";
const startTimeout = 20_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const startServer = async () => {
  const dir = await mkdtemp(join(tmpdir(), "makan-e2e-"));
  const db = resolve(dir, "makan.db");
  assert.notEqual(db, resolve("data/makan.db"));

  const child = spawn(process.execPath, [entry], {
    env: { ...process.env, MAKAN_DB: db, HOST: "127.0.0.1", PORT: "0" },
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
