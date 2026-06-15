"use client";

import type { PhotoEntry } from "./game";

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

function resizeToDataUrl(src: string, maxDim = MAX_DIMENSION, quality = JPEG_QUALITY): Promise<string> {
  return loadImage(src).then(
    (img) =>
      new Promise<string>((resolve, reject) => {
        const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("No 2D context"));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      })
  );
}

export async function fileToPhoto(file: File): Promise<PhotoEntry> {
  const rawUrl = await readFileAsDataUrl(file);
  const dataUrl = await resizeToDataUrl(rawUrl);
  return {
    id: `ph-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    dataUrl,
    where: "",
    when: "",
  };
}
