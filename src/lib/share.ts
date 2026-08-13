import QRCode from "qrcode";

export const qrSvg = async (url: string) => {
  try {
    return await QRCode.toString(url, { type: "svg" });
  } catch {
    return null;
  }
};
