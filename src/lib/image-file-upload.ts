const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type UploadImageMime = (typeof ALLOWED_MIMES)[number];

function uint8ToBase64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(s);
}

export async function readImageFileForUpload(
  file: File,
): Promise<
  | { ok: true; imageBase64: string; imageMimeType: UploadImageMime }
  | { ok: false; error: string }
> {
  if (!ALLOWED_MIMES.includes(file.type as UploadImageMime)) {
    return { ok: false, error: "Use JPEG, PNG, WebP, or GIF." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Image too large (max 2 MB)." };
  }
  const buf = await file.arrayBuffer();
  if (buf.byteLength > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Image too large (max 2 MB)." };
  }
  const mime = file.type as UploadImageMime;
  return { ok: true, imageBase64: uint8ToBase64(new Uint8Array(buf)), imageMimeType: mime };
}
