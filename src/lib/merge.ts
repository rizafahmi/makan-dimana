type Slot = "1" | "2" | "3" | "4";

type Counters = Partial<Record<Slot, number>>;

export type SessionDoc = {
  device: string;
  title: string | null;
  places: string[] | null;
  created_at: string | null;
  closed: boolean;
  up: Counters;
  down: Counters;
};

export const mergeDocs = (docs: SessionDoc[]) => {
  const claimants = docs.filter((doc) => doc.title !== null);
  if (claimants.length === 0) return null;
  const creator = claimants.reduce((lowest, doc) =>
    doc.device < lowest.device ? doc : lowest,
  );
  const tally = (slot: Slot) =>
    docs.reduce(
      (sum, doc) => sum + (doc.up[slot] ?? 0) - (doc.down[slot] ?? 0),
      0,
    );
  return {
    title: creator.title,
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
