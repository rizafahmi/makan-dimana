const first = 500;
const attempts = 6;

export const retryDelay = (attempt: number) =>
  attempt < 1 || attempt > attempts ? null : first * 2 ** (attempt - 1);
