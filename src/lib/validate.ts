type RawCreate = { title: string; places: string[] };

export const validateCreate = (raw: RawCreate) => {
  const title = raw.title.trim();
  const trimmed = raw.places.map((place) => place.trim());
  const places = trimmed.filter((p) => p !== "");
  const errors: Record<string, string> = {};
  if (title === "") errors.title = "Judul wajib diisi";
  else if (title.length > 100) errors.title = "Judul maksimal 100 karakter";
  trimmed.forEach((place, index) => {
    if (place.length > 60)
      errors[`place${index + 1}`] = "Nama tempat maksimal 60 karakter";
  });
  if (places.length < 2) errors.places = "Isi minimal 2 tempat";

  if (Object.keys(errors).length > 0) return { ok: false as const, errors };
  return { ok: true, title, places };
};
