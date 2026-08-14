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

export const tallyView = (places: Place[]) => {
  const total = places.reduce((sum, place) => sum + place.votes, 0);
  return {
    total,
    text: `${total} suara masuk · ${places.length} tempat`,
    places: places.map((place) => ({
      ...place,
      share: total === 0 ? 0 : Math.round((place.votes / total) * 100),
    })),
  };
};

export const winnerView = <T extends Place>(places: T[], isOpen: boolean) => {
  const top = isOpen ? [] : winningSlots(places);
  const winners = places.filter((place) => top.includes(place.slot));
  const others = places.filter((place) => !top.includes(place.slot));
  const votes = winners[0]?.votes ?? 0;
  const kicker =
    winners.length === 0 ? null : winners.length === 1 ? "Pemenang" : "Seri";
  const sub =
    winners.length === 0
      ? null
      : winners.length === 1
        ? `${votes} dari ${tallyView(places).total} suara`
        : `${votes} suara masing-masing`;
  const note = isOpen || winners.length > 0 ? null : "Belum ada pemenang";
  return { winners, others, kicker, sub, note };
};
