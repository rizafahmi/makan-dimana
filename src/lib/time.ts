export const utcTimestamp = (at: Date) =>
  at.toISOString().slice(0, 19).replace("T", " ");

export const relativeTime = (then: Date, now: Date) => {
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  if (hours < 24) return `${hours} jam lalu`;
  if (days < 2) return "kemarin";
  return `${days} hari lalu`;
};
