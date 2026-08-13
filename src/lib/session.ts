type Place = { slot: number; name: string; votes: number };

export const listPlaces = (session: Record<string, unknown>) =>
  [1, 2, 3, 4]
    .flatMap((slot) => {
      const name = session[`place${slot}_name`];
      if (name === null || name === undefined) return [];
      return [
        {
          slot,
          name: String(name),
          votes: Number(session[`place${slot}_votes`]),
        },
      ];
    })
    .sort((a, b) => b.votes - a.votes);

export const winningSlots = (places: Place[]) => {
  const top = Math.max(0, ...places.map((place) => place.votes));
  if (top === 0) return [];
  return places
    .filter((place) => place.votes === top)
    .map((place) => place.slot);
};
