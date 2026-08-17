export const coalescing = (run: () => Promise<boolean>) => {
  let running = false;
  let pending = false;

  return async () => {
    if (running) {
      pending = true;
      return true;
    }
    running = true;
    let settled = true;
    do {
      pending = false;
      settled = await run();
    } while (pending);
    running = false;
    return settled;
  };
};
