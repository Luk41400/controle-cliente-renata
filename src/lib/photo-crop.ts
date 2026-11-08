import { PHOTO_SIZE } from "./photo-rules.ts";

export type PhotoCrop = { x: number; y: number; zoom: number };
export const initialCrop: PhotoCrop = { x: 50, y: 50, zoom: 1 };

export function cropGeometry(width: number, height: number, crop: PhotoCrop) {
  const side = Math.min(width, height) / crop.zoom;
  return { side, x: (width - side) * crop.x / 100, y: (height - side) * crop.y / 100 };
}

export async function cropPhoto(image: HTMLImageElement, crop: PhotoCrop) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = PHOTO_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível preparar a imagem neste navegador.");
  const { side, x, y } = cropGeometry(image.naturalWidth, image.naturalHeight, crop);
  context.drawImage(image, x, y, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => {
    if (!blob || blob.size > 2_000_000) reject(new Error("A imagem não pôde ser preparada. Selecione outra fotografia."));
    else resolve(blob);
  }, "image/webp", .88));
}

export function photoBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Não foi possível ler a fotografia."));
    reader.readAsDataURL(blob);
  });
}
