import { listPlaces, tallyView, winnerView } from "../lib/session.ts";
import { relativeTime } from "../lib/time.ts";

type Row = { id: string; title: string; is_open: number; created_at: string };
type State = (state: string, text: string) => void;

const timeout = 10_000;
const holdDelay = 500;
const hintText =
  "Ketuk baris buat vote. Tahan atau Shift+klik buat batalin.";
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
    const retry = button("Coba lagi", () => void run());
    retry.className = "km-button";
    retry.dataset.variant = "outline";
    root.append(retry);
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

  function voteRow(slot: string) {
    const node = el("button");
    node.dataset.action = "upvote";
    node.dataset.place = slot;

    let held = false;
    let timer = 0;

    const stop = () => {
      if (timer !== 0) clearTimeout(timer);
      timer = 0;
    };

    node.addEventListener("pointerdown", () => {
      held = false;
      stop();
      timer = window.setTimeout(() => {
        held = true;
        void mutate({ action: "downvote", place: slot });
      }, holdDelay);
    });
    for (const name of ["pointerup", "pointerleave", "pointercancel"]) {
      node.addEventListener(name, stop);
    }
    node.addEventListener("click", (event) => {
      stop();
      if (held) {
        held = false;
        return;
      }
      void mutate({
        action: event.shiftKey ? "downvote" : "upvote",
        place: slot,
      });
    });
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

    const isOpen = session.is_open === 1;
    const open = String(session.is_open);

    const head = el("div");
    head.className = "km-shead";
    const state = el("span", isOpen ? "Masih buka" : "Sudah ditutup");
    state.className = "km-state";
    state.dataset.open = open;
    const sid = el("span", id);
    sid.className = "km-id";
    head.append(state, sid);

    const heading = el("h1", title);
    heading.className = "km-h1";
    root.append(head, heading);

    const places = listPlaces(session);
    const tally = tallyView(places);
    const { winners, others, kicker, sub, note } = winnerView(
      tally.places,
      isOpen,
    );

    const summary = el("p", tally.text);
    summary.className = "km-tally";
    root.append(summary);

    if (kicker !== null) {
      const hero = el("div");
      hero.className = "km-hero";
      if (winners.length > 1) hero.dataset.tie = "true";

      const kick = el("span", kicker);
      kick.className = "km-hero-kick";
      hero.append(kick);

      for (const winner of winners) {
        const who = el("p", winner.name);
        who.className = "km-hero-who";
        hero.append(who);
      }
      if (sub !== null) {
        const line = el("span", sub);
        line.className = "km-hero-sub";
        hero.append(line);
      }
      root.append(hero);
    }

    const list = el("ul");
    list.className = "km-list";

    for (const place of others) {
      const slot = String(place.slot);
      const item = el("li");
      const row = isOpen ? voteRow(slot) : item;

      row.className = isOpen ? "km-place km-bar" : "km-place";
      row.dataset.place = slot;
      row.dataset.votes = String(place.votes);
      row.dataset.open = open;

      if (isOpen) {
        const fill = el("span");
        fill.className = "km-fill";
        fill.style.width = `${place.share}%`;
        row.append(fill);
      }

      const name = el("span", place.name);
      name.className = "km-place-name";
      row.append(name);

      if (isOpen) {
        const pct = el("span", `${place.share}%`);
        pct.className = "km-pct";
        row.append(pct);
      }

      const votes = el("span", String(place.votes));
      votes.className = "km-place-votes";
      const unit = el("span", " suara");
      unit.className = "km-sr";
      row.append(votes, unit);

      if (row !== item) item.append(row);
      list.append(item);
    }
    root.append(list);

    if (isOpen) {
      const hint = el("p", hintText);
      hint.className = "km-hint";
      root.append(hint);
    }

    if (note !== null) {
      const tally = el("p", note);
      tally.className = "km-tally";
      root.append(tally);
    }

    const actions = el("div");
    actions.className = "km-actions";
    const toggle = isOpen
      ? control("Tutup sesi", "close", null)
      : control("Buka lagi", "reopen", null);
    toggle.className = "km-button";
    toggle.dataset.variant = "outline";
    actions.append(toggle);
    root.append(actions);

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
    if (fields.place !== undefined) {
      root
        .querySelector(`button[data-place="${fields.place}"]`)
        ?.setAttribute("data-acting", "true");
    }
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

    const head = el("div");
    head.className = "km-subhead";
    head.append(el("span", "Sesi"), el("span", `${sessions.length} sesi`));

    const now = new Date();
    const list = el("ul");
    list.className = "km-list";

    for (const session of sessions) {
      const item = el("li");
      item.className = "km-row";
      item.dataset.open = String(session.is_open);

      const link = el("a") as HTMLAnchorElement;
      link.href = `/s/${session.id}`;

      const title = el("span", session.title);
      title.className = "km-row-title";

      const state = el(
        "span",
        session.is_open === 1 ? "Masih buka" : "Sudah ditutup",
      );
      state.className = "km-row-state";

      const created = new Date(`${session.created_at.replace(" ", "T")}Z`);
      const time = el("span", relativeTime(created, now));
      time.className = "km-row-time";

      link.append(title, state, time);
      item.append(link);
      list.append(item);
    }
    root.append(head, list);
  };

  const { run } = loader(root, "/api/sessions", draw, null, () => {});
  void run();
};

const session = document.querySelector<HTMLElement>("[data-session]");
const sessions = document.querySelector<HTMLElement>("[data-sessions]");

if (session) mountSession(session);
if (sessions) mountLanding(sessions);
