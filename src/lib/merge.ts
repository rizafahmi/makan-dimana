type Slot = "1" | "2" | "3" | "4";

type Counters = Partial<Record<Slot, number>>;

export type SessionDoc = {
  device: string;
  title: string | null;
  places: string[] | null;
  created_at: string | null;
  closed: boolean;
  deleted?: boolean;
  round?: number;
  up: Counters;
  down: Counters;
};

export const emptyDoc = (device: string) => ({
  device,
  title: null,
  places: null,
  created_at: null,
  closed: false,
  deleted: false,
  round: 0,
  up: {},
  down: {},
});

export const creatorDoc = (
  device: string,
  title: string,
  places: string[],
  createdAt: string,
) => ({ ...emptyDoc(device), title, places, created_at: createdAt });

const bump = (counters: Record<string, number | undefined>, slot: number) => ({
  ...counters,
  [slot]: (counters[slot] ?? 0) + 1,
});

export const applyVote = (doc: SessionDoc, slot: number, delta: number) =>
  delta < 0
    ? { ...doc, down: bump(doc.down, slot) }
    : { ...doc, up: bump(doc.up, slot) };

const counted = (counters: Record<string, number | undefined>, slot: number) =>
  counters[slot] ?? 0;

export const votesCast = (doc: SessionDoc, slot: number) =>
  counted(doc.up, slot) - counted(doc.down, slot);

export const applyClose = (doc: SessionDoc) => ({ ...doc, closed: true });

export const applyDelete = (doc: SessionDoc) => ({ ...doc, deleted: true });

export const applyReset = (doc: SessionDoc, round: number) => ({
  ...doc,
  round,
  up: {},
  down: {},
});

export const parseDoc = (raw: string): SessionDoc | null => {
  try {
    const doc = JSON.parse(raw) as SessionDoc | null;
    return typeof doc?.device === "string" ? doc : null;
  } catch {
    return null;
  }
};

export const mergeDocs = (docs: SessionDoc[]) => {
  if (docs.some((doc) => doc.deleted)) return null;
  const claimants = docs.filter((doc) => doc.title !== null);
  if (claimants.length === 0) return null;
  const creator = claimants.reduce((lowest, doc) =>
    doc.device < lowest.device ? doc : lowest,
  );
  const round = Math.max(...docs.map((doc) => doc.round ?? 0));
  const current = docs.filter((doc) => (doc.round ?? 0) === round);
  const tally = (slot: Slot) =>
    current.reduce(
      (sum, doc) => sum + (doc.up[slot] ?? 0) - (doc.down[slot] ?? 0),
      0,
    );
  return {
    title: creator.title,
    round,
    created_at: creator.created_at,
    is_open: docs.some((doc) => doc.closed) ? 0 : 1,
    place1_name: creator.places?.[0] ?? null,
    place2_name: creator.places?.[1] ?? null,
    place3_name: creator.places?.[2] ?? null,
    place4_name: creator.places?.[3] ?? null,
    place1_votes: tally("1"),
    place2_votes: tally("2"),
    place3_votes: tally("3"),
    place4_votes: tally("4"),
  };
};
