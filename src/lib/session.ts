export const listPlaces = (session: Record<string, unknown>) =>
  [1, 2, 3, 4].flatMap((slot) => {
    const name = session[`place${slot}_name`];
    if (name === null || name === undefined) return [];
    return [
      {
        slot,
        name: String(name),
        votes: Number(session[`place${slot}_votes`]),
      },
    ];
  });
