import { listPlaces, winnerView } from "../lib/session.ts";
import { relativeTime } from "../lib/time.ts";

type Row = { id: string; title: string; is_open: number; created_at: string };
type State = (state: string, text: string) => void;

const timeout = 10_000;
const loadingText = "Memuat...";
const failureText = "Gagal memuat. Periksa koneksi.";
const missingText = "Sesi tidak ditemukan";

const reasons: Record<string, string> = {
  closed: "Sesi sudah ditutup",
  no_such_place: "Permintaan tidak valid",
  bad_request: "Permintaan tidak valid",
  not_found: missingText,
};

const el = (tag: string, text?: string) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
};

const button = (label: string, onClick: () => void) => {
  const node = el("button", label);
  node.addEventListener("click", onClick);
  return node;
};

const status = (text: string) => {
  const node = el("p", text);
  node.setAttribute("role", "status");
  return node;
};

const clear = (root: HTMLElement) => {
  while (root.firstChild) root.removeChild(root.firstChild);
};

const message = (root: HTMLElement, state: string, text: string) => {
  clear(root);
  root.dataset.state = state;
  root.append(status(text));
};

const request = (url: string, init?: RequestInit) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(timeout) });

const loader = (
  root: HTMLElement,
  url: string,
  draw: (data: unknown) => void,
  missing: string | null,
  onState: State,
) => {
  const failed = () => {
    message(root, "error", failureText);
    onState("error", failureText);
    root.append(button("Coba lagi", () => void run()));
  };

  const run = async () => {
    message(root, "loading", loadingText);
    try {
      const res = await request(url);
      if (res.status === 404 && missing !== null) {
        message(root, "missing", missing);
        return onState("missing", missing);
      }
      if (!res.ok) return failed();
      draw(await res.json());
    } catch {
      failed();
    }
  };

  return { run, failed };
};

const mountSession = (root: HTMLElement) => {
  const id = root.dataset.id ?? "";
  const share = document.querySelector<HTMLElement>("[data-share]");
  let notice: string | null = null;
  let pending = false;

  const onState: State = (state, text) => {
    document.title = text;
    if (share) share.hidden = state === "missing";
  };

  function control(label: string, action: string, place: string | null) {
    const fields: Record<string, string> = { action };
    if (place !== null) fields.place = place;

    const node = button(label, () => void mutate(fields));
    node.dataset.action = action;
    if (place !== null) node.dataset.place = place;
    return node;
  }

  function focusKey() {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return null;
    if (active.dataset.action === undefined) return null;
    return `${active.dataset.action}|${active.dataset.place ?? ""}`;
  }

  function restore(key: string | null) {
    if (key === null) return;
    const [action, place] = key.split("|");
    const selector =
      place === ""
        ? `button[data-action="${action}"]:not([data-place])`
        : `button[data-action="${action}"][data-place="${place}"]`;
    root.querySelector<HTMLElement>(selector)?.focus();
  }

  function draw(data: unknown) {
    const session = data as Record<string, unknown>;
    clear(root);
    root.dataset.state = "ready";

    const title = String(session.title);
    document.title = title;
    if (share) share.hidden = false;
    root.append(el("h1", title));

    const isOpen = session.is_open === 1;
    const places = listPlaces(session);
    const { winners, label, note } = winnerView(places, isOpen);
    const list = el("ul");

    for (const place of places) {
      const slot = String(place.slot);
      const item = el("li");
      item.dataset.place = slot;
      item.dataset.votes = String(place.votes);
      item.append(el("span", `${place.name}: ${place.votes} suara`));

      if (winners.includes(place.slot)) {
        item.dataset.winner = "true";
        item.append(el("strong", label));
      }
      if (isOpen) {
        item.append(
          control("Naik", "upvote", slot),
          control("Turun", "downvote", slot),
        );
      }
      list.append(item);
    }
    root.append(list);

    if (note !== null) root.append(el("p", note));
    root.append(
      isOpen
        ? control("Tutup sesi", "close", null)
        : control("Buka lagi", "reopen", null),
    );
    if (notice !== null) {
      root.append(status(notice));
      notice = null;
    }
  }

  const { run, failed } = loader(
    root,
    `/api/sessions/${id}`,
    draw,
    missingText,
    onState,
  );

  async function mutate(fields: Record<string, string>) {
    if (pending) return;
    pending = true;

    const key = focusKey();
    root.dataset.state = "loading";
    for (const node of root.querySelectorAll("button")) node.disabled = true;

    try {
      const res = await request(`/api/sessions/${id}`, {
        method: "POST",
        body: new URLSearchParams(fields),
      });
      if (res.ok) {
        draw(await res.json());
        return restore(key);
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 404) {
        message(root, "missing", missingText);
        return onState("missing", missingText);
      }
      notice = reasons[String(body.error)] ?? failureText;
      await run();
      restore(key);
    } catch {
      failed();
    } finally {
      pending = false;
    }
  }

  void run();
};

const mountLanding = (root: HTMLElement) => {
  const draw = (data: unknown) => {
    const sessions = data as Row[];
    clear(root);
    root.dataset.state = "ready";

    if (sessions.length === 0) {
      root.append(status("Belum ada sesi."));
      return;
    }

    const now = new Date();
    const list = el("ul");

    for (const session of sessions) {
      const item = el("li");
      const link = el("a", session.title) as HTMLAnchorElement;
      link.href = `/s/${session.id}`;

      const state = el(
        "span",
        session.is_open === 1 ? "Masih buka" : "Sudah ditutup",
      );
      state.dataset.open = String(session.is_open);

      const created = new Date(`${session.created_at.replace(" ", "T")}Z`);
      item.append(link, state, el("span", relativeTime(created, now)));
      list.append(item);
    }
    root.append(list);
  };

  const { run } = loader(root, "/api/sessions", draw, null, () => {});
  void run();
};

const session = document.querySelector<HTMLElement>("[data-session]");
const sessions = document.querySelector<HTMLElement>("[data-sessions]");

if (session) mountSession(session);
if (sessions) mountLanding(sessions);
