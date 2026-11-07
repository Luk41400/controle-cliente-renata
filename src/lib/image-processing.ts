import sharp from "sharp";
import { MAX_PHOTO_BYTES, PHOTO_SIZE, photoFormat } from "./photo-rules.ts";

export async function normalizePhoto(input: Uint8Array) {
  if (!input.byteLength || input.byteLength > MAX_PHOTO_BYTES) throw new Error("size");
  const format = photoFormat(input);
  if (!format) throw new Error("format");
  const image = sharp(input, { limitInputPixels: 40_000_000, failOn: "warning" });
  const metadata = await image.metadata();
  if (metadata.format !== format) throw new Error("format");
  // A saída reprocessada contém apenas pixels. EXIF, GPS e demais metadados são descartados.
  return image.rotate().resize(PHOTO_SIZE, PHOTO_SIZE, { fit: "cover" }).webp({ quality: 88 }).toBuffer();
}
