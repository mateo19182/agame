import type { PhotoEntry } from "@shared/game";

const MAX_DIMENSION = 800;
const JPEG_QUALITY = 0.78;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = src;
  });
}

function resizeToBlob(src: string, maxDim = MAX_DIMENSION, quality = JPEG_QUALITY): Promise<Blob> {
  return loadImage(src).then(
    (img) =>
      new Promise<Blob>((resolve, reject) => {
        const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const c = canvas.getContext("2d");
        if (!c) {
          reject(new Error("No 2D context"));
          return;
        }
        c.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("Encoding failed"))),
          "image/jpeg",
          quality
        );
      })
  );
}

/** Upload an image blob to R2 via the auth-gated route; returns its object key. */
async function uploadBlob(blob: Blob): Promise<string> {
  const res = await fetch("/api/photos", {
    method: "POST",
    headers: { "content-type": blob.type || "image/jpeg" },
    body: blob,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  const { key } = (await res.json()) as { key: string };
  return key;
}

export async function fileToPhoto(file: File): Promise<PhotoEntry> {
  const rawUrl = await readFileAsDataUrl(file);
  const blob = await resizeToBlob(rawUrl);
  const key = await uploadBlob(blob);
  return {
    id: `ph-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    key,
    where: "",
    when: "",
  };
}
