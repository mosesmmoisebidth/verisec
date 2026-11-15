/**
 * Downscale a picked image to a small data URL in the browser before it is uploaded.
 *
 * Profile photos and org logos only ever render small, so there is no reason to send a multi-megabyte
 * original: we draw it onto a canvas capped at `max` px on its longest side and export a compressed
 * JPEG (or keep PNG transparency when the source has an alpha channel). The result is a data URL the
 * API stores as-is, which keeps every upload well under the server's size cap.
 */
export async function downscaleImage(
  file: File,
  { max = 256, quality = 0.85 }: { max?: number; quality?: number } = {},
): Promise<string> {
  // SVG has no pixels to resample — keep it verbatim (the server caps its size).
  if (file.type === "image/svg+xml") return readAsDataUrl(file);

  const dataUrl = await readAsDataUrl(file);
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  // Keep transparency for PNG/WebP sources; otherwise a smaller JPEG.
  const keepAlpha = file.type === "image/png" || file.type === "image/webp";
  return canvas.toDataURL(keepAlpha ? "image/png" : "image/jpeg", quality);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read the file."));
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load the image."));
    img.src = src;
  });
}
