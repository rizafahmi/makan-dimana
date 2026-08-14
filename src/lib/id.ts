export const alphabet = "0123456789abcdefghjkmnpqrstvwxyz";

const canonicalId = new RegExp(`^[${alphabet}]{7}$`);

export const normalizeSessionId = (raw: string) => {
  const id = raw
    .toLowerCase()
    .replaceAll("i", "1")
    .replaceAll("l", "1")
    .replaceAll("o", "0");
  return canonicalId.test(id) ? id : null;
};

const randomId = (length: number) => {
  let id = "";
  for (const byte of crypto.getRandomValues(new Uint8Array(length))) {
    id += alphabet[byte % 32];
  }
  return id;
};

export const generateSessionId = () => randomId(7);

export const generateDeviceId = () => randomId(26);
