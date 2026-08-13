import { listPlaces, winningSlots } from "../lib/session.ts";
import { relativeTime } from "../lib/time.ts";

type Row = { id: string; title: string; is_open: number; created_at: string };

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

const clear = (root: HTMLElement) => {
  while (root.firstChild) root.removeChild(root.firstChild);
};

const message = (root: HTMLElement, state: string, text: string) => {
  clear(root);
  root.dataset.state = state;
  root.append(el("p", text));
};

const failure = (root: HTMLElement, retry: () => void) => {
  message(root, "error", "Gagal memuat. Periksa koneksi.");
  root.append(button("Coba lagi", retry));
};

const mountSession = (root: HTMLElement) => {
  const id = root.dataset.id ?? "";

  const render = (session: Record<string, unknown>) => {
    clear(root);
    root.dataset.state = "ready";

    const title = String(session.title);
    document.title = title;
    root.append(el("h1", title));

    const isOpen = session.is_open === 1;
    const places = listPlaces(session);
    const winners = isOpen ? [] : winningSlots(places);
    const list = el("ul");

    for (const place of places) {
      const slot = String(place.slot);
      const item = el("li");
      item.dataset.place = slot;
      item.dataset.votes = String(place.votes);
      item.append(el("span", `${place.name}: ${place.votes} suara`));

      if (winners.includes(place.slot)) {
        item.dataset.winner = "true";
        item.append(el("strong", "Pemenang"));
      }
      if (isOpen) {
        item.append(
          button("Naik", () => void mutate({ action: "upvote", place: slot })),
          button(
            "Turun",
            () => void mutate({ action: "downvote", place: slot }),
          ),
        );
      }
      list.append(item);
    }
    root.append(list);

    if (!isOpen && winners.length === 0) {
      root.append(el("p", "Belum ada pemenang"));
    }
    if (!isOpen && winners.length > 1) root.append(el("p", "Seri!"));

    root.append(
      isOpen
        ? button("Tutup sesi", () => void mutate({ action: "close" }))
        : button("Buka lagi", () => void mutate({ action: "reopen" })),
    );
  };

  const load = async () => {
    root.dataset.state = "loading";
    try {
      const res = await fetch(`/api/sessions/${id}`);
      if (res.status === 404) {
        return message(root, "missing", "Sesi tidak ditemukan");
      }
      if (!res.ok) return failure(root, () => void load());
      render(await res.json());
    } catch {
      failure(root, () => void load());
    }
  };

  const mutate = async (fields: Record<string, string>) => {
    root.dataset.state = "loading";
    try {
      const res = await fetch(`/api/sessions/${id}`, {
        method: "POST",
        body: new URLSearchParams(fields),
      });
      if (!res.ok) return void load();
      render(await res.json());
    } catch {
      failure(root, () => void load());
    }
  };

  void load();
};

const mountLanding = (root: HTMLElement) => {
  const render = (sessions: Row[]) => {
    clear(root);
    root.dataset.state = "ready";

    if (sessions.length === 0) {
      root.append(el("p", "Belum ada sesi."));
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

  const load = async () => {
    root.dataset.state = "loading";
    try {
      const res = await fetch("/api/sessions");
      if (!res.ok) return failure(root, () => void load());
      render(await res.json());
    } catch {
      failure(root, () => void load());
    }
  };

  void load();
};

const session = document.querySelector<HTMLElement>("[data-session]");
const sessions = document.querySelector<HTMLElement>("[data-sessions]");

if (session) mountSession(session);
if (sessions) mountLanding(sessions);
