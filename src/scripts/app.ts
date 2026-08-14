import { generateSessionId, normalizeSessionId } from "../lib/id.ts";
import {
  applyClose,
  applyVote,
  creatorDoc,
  mergeDocs,
  type SessionDoc,
} from "../lib/merge.ts";
import { listPlaces, tallyView, winnerView } from "../lib/session.ts";
import {
  applyPulled,
  localList,
  mergePulled,
  ownDoc,
  upsertDoc,
} from "../lib/store.ts";
import { relativeTime, utcTimestamp } from "../lib/time.ts";
import { validateCreate } from "../lib/validate.ts";
import { allSessions, deviceId, readSession, writeSession } from "./idb.ts";
import {
  exchange,
  keepListening,
  keepSynced,
  pushDoc,
  retrying,
} from "./sync.ts";

type Session = NonNullable<ReturnType<typeof mergeDocs>>;

const holdDelay = 500;
const hintText =
  "Ketuk baris buat vote. Tahan atau Shift+klik buat batalin.";
const missingText = "Sesi tidak ditemukan";

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

const mountSession = async (root: HTMLElement) => {
  const share = document.querySelector<HTMLElement>("[data-share]");

  const missing = () => {
    message(root, "missing", missingText);
    document.title = missingText;
    if (share) share.hidden = true;
  };

  const canonical = normalizeSessionId(location.pathname.split("/")[2] ?? "");
  if (canonical === null) return missing();

  const id = canonical;
  if (share && root.dataset.id !== id) {
    share.querySelector(".km-share-plate")?.remove();
    const url = share.querySelector(".km-share-url");
    if (url) url.textContent = `${location.origin}/s/${id}`;
  }

  const device = await deviceId();
  const first = await readSession(id);
  let stored = first ?? { id, docs: [] };
  if (first === undefined) await writeSession(stored);
  let voted: string | null = null;
  let held = false;
  let timer = 0;

  const stopHold = () => {
    if (timer !== 0) clearTimeout(timer);
    timer = 0;
  };

  function placeRow(slot: string) {
    const node = el("button");
    node.dataset.place = slot;

    node.addEventListener("pointerdown", () => {
      held = false;
      stopHold();
      timer = window.setTimeout(() => {
        held = true;
        void vote(Number(slot), -1);
      }, holdDelay);
    });
    for (const name of ["pointerup", "pointerleave", "pointercancel"]) {
      node.addEventListener(name, stopHold);
    }
    node.addEventListener("click", (event) => {
      stopHold();
      if (held) {
        held = false;
        return;
      }
      void vote(Number(slot), event.shiftKey ? -1 : 1);
    });
    return node;
  }

  function focusedPlace() {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return null;
    return active.dataset.place ?? null;
  }

  function restore(place: string | null) {
    if (place === null) return;
    root.querySelector<HTMLElement>(`button[data-place="${place}"]`)?.focus();
  }

  function draw(session: Session) {
    clear(root);
    root.dataset.state = "ready";

    const title = session.title ?? "";
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

    if (isOpen) {
      const summary = el("p", tally.text);
      summary.className = "km-tally";
      root.append(summary);
    }

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
      const row = isOpen ? placeRow(slot) : item;

      row.className = isOpen ? "km-place km-bar" : "km-place";
      row.dataset.place = slot;
      row.dataset.votes = String(place.votes);
      row.dataset.open = open;
      if (slot === voted) row.dataset.voted = "true";

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
    if (others.length > 0) root.append(list);

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

    if (isOpen) {
      const actions = el("div");
      actions.className = "km-actions";
      const toggle = button("Tutup sesi", () => void close());
      toggle.className = "km-button";
      toggle.dataset.variant = "outline";
      actions.append(toggle);
      root.append(actions);
    }
    voted = null;
  }

  function render() {
    const merged = mergeDocs(stored.docs);
    if (merged === null) return missing();
    draw(merged);
  }

  function repaint() {
    const focused = focusedPlace();
    render();
    restore(focused);
  }

  const resync = retrying(sync);

  async function change(transform: (doc: SessionDoc) => SessionDoc) {
    const next = transform(ownDoc(stored.docs, device));
    stored = { id, docs: upsertDoc(stored.docs, next) };
    await writeSession(stored);
    void pushDoc(id, device, next).then((sent) => {
      if (!sent) resync();
    });
  }

  async function vote(slot: number, delta: number) {
    await change((doc) => applyVote(doc, slot, delta));
    voted = String(slot);
    repaint();
  }

  async function close() {
    await change(applyClose);
    render();
  }

  async function sync() {
    const answer = await exchange(id, device, ownDoc(stored.docs, device));
    if (answer === null) return false;
    const next = applyPulled(stored, answer.docs, device);
    if (next !== null) {
      stored = next;
      await writeSession(stored);
      repaint();
    }
    return answer.sent;
  }

  render();
  keepSynced(resync);
  keepListening(id, resync);
};

const mountLanding = async (root: HTMLElement) => {
  const device = await deviceId();
  let stored = await allSessions();

  function draw() {
    clear(root);
    root.dataset.state = "ready";

    const sessions = localList(stored);
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

      const title = el("span", session.title ?? "");
      title.className = "km-row-title";

      const state = el(
        "span",
        session.is_open === 1 ? "Masih buka" : "Sudah ditutup",
      );
      state.className = "km-row-state";

      const created = new Date(
        `${(session.created_at ?? "").replace(" ", "T")}Z`,
      );
      const time = el("span", relativeTime(created, now));
      time.className = "km-row-time";

      link.append(title, state, time);
      item.append(link);
      list.append(item);
    }
    root.append(head, list);
  }

  async function sync() {
    const answers = await Promise.all(
      stored.map((session) =>
        exchange(session.id, device, ownDoc(session.docs, device)),
      ),
    );
    stored = stored.map((session, index) => ({
      id: session.id,
      docs: mergePulled(session.docs, answers[index]?.docs ?? [], device),
    }));
    await Promise.all(stored.map(writeSession));
    draw();
    return answers.every((answer) => answer !== null && answer.sent);
  }

  draw();
  keepSynced(retrying(sync));
};

const fieldNames = ["title", "place1", "place2", "place3", "place4"];

const showErrors = (form: HTMLFormElement, errors: Record<string, string>) => {
  for (const stale of form.querySelectorAll(".km-error, .km-form-error")) {
    stale.remove();
  }

  for (const name of fieldNames) {
    const input = form.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    const field = input?.closest<HTMLElement>(".km-field");
    if (!input || !field) continue;

    delete field.dataset.invalid;
    input.removeAttribute("aria-describedby");

    const text = errors[name];
    if (text === undefined) continue;

    field.dataset.invalid = "true";
    input.setAttribute("aria-describedby", `${name}-error`);
    const note = el("span", text);
    note.className = "km-error";
    note.id = `${name}-error`;
    field.append(note);
  }

  if (errors.places !== undefined) {
    const note = el("p", errors.places);
    note.className = "km-form-error";
    form.querySelector("button")?.before(note);
  }
};

const startSession = async (title: string, places: string[]) => {
  const id = generateSessionId();
  const stamp = utcTimestamp(new Date());
  const doc = creatorDoc(await deviceId(), title, places, stamp);
  await writeSession({ id, docs: [doc] });
  location.assign(`/s/${id}`);
};

const mountCreate = (form: HTMLFormElement) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const read = (name: string) => String(data.get(name) ?? "");
    const result = validateCreate({
      title: read("title"),
      places: fieldNames.slice(1).map(read),
    });
    if (!result.ok) return showErrors(form, result.errors);
    void startSession(result.title, result.places);
  });
};

const create = document.querySelector<HTMLFormElement>("[data-create]");
const session = document.querySelector<HTMLElement>("[data-session]");
const sessions = document.querySelector<HTMLElement>("[data-sessions]");

if (create) mountCreate(create);
if (session) void mountSession(session);
if (sessions) void mountLanding(sessions);

if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
