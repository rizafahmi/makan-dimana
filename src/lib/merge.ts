type Counters = Partial<Record<"1" | "2" | "3" | "4", number>>;

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
  const creator = docs[0];
  return {
    title: creator.title,
    created_at: creator.created_at,
    is_open: 1,
    place1_name: creator.places?.[0] ?? null,
    place2_name: creator.places?.[1] ?? null,
    place3_name: creator.places?.[2] ?? null,
    place4_name: creator.places?.[3] ?? null,
    place1_votes: 0,
    place2_votes: 0,
    place3_votes: 0,
    place4_votes: 0,
  };
};
