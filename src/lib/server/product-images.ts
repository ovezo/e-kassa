import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";

const MAX_BYTES = 2 * 1024 * 1024;

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const ALLOWED_MIMES = new Set(Object.keys(MIME_TO_EXT));

/** Stored paths look like `/api/product-images/<hex32>.<ext>`. */
const STORED_BASENAME_RE = /^[a-f0-9]{32}\.(jpg|png|webp|gif)$/;

/** Electron + `next dev` write this so the Next process resolves the same folder as IPC (no env on Next). */
export const PRODUCT_IMAGES_DEV_POINTER_FILENAME = ".unikassa-product-images-root";

function readDevPointerRoot(): string | null {
  try {
    const pointerPath = path.join(process.cwd(), PRODUCT_IMAGES_DEV_POINTER_FILENAME);
    if (!fs.existsSync(pointerPath)) return null;
    const raw = fs.readFileSync(pointerPath, "utf8").trim();
    const line = raw.split(/\n/)[0]?.trim() ?? "";
    if (!line) return null;
    const resolved = path.resolve(line);
    if (path.basename(resolved) !== "product-images") return null;
    if (!fs.existsSync(resolved)) return null;
    return resolved;
  } catch {
    return null;
  }
}

export function getProductImagesRoot(): string {
  const fromEnv = process.env.UNIKASSA_PRODUCT_IMAGES_ROOT?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  const fromPointer = readDevPointerRoot();
  if (fromPointer) return fromPointer;
  // Browser-only next dev (no Electron): no pointer — project-local folder.
  return path.resolve(process.cwd(), "product-images");
}

export function ensureProductImagesDir(): void {
  const root = getProductImagesRoot();
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
}

export function publicPathForFilename(filename: string): string {
  return `/api/product-images/${filename}`;
}

export function basenameFromImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl?.trim()) return null;
  const u = imageUrl.trim();
  const prefix = "/api/product-images/";
  if (!u.startsWith(prefix)) return null;
  const base = path.basename(u);
  return STORED_BASENAME_RE.test(base) ? base : null;
}

function looksLikeImage(buf: Buffer, mime: string): boolean {
  if (buf.length < 12) return false;
  if (mime === "image/jpeg") return buf[0] === 0xff && buf[1] === 0xd8;
  if (mime === "image/png") {
    return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  }
  if (mime === "image/gif") {
    const h = buf.toString("ascii", 0, 6);
    return h === "GIF87a" || h === "GIF89a";
  }
  if (mime === "image/webp") {
    return buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP";
  }
  return false;
}

export function saveProductImageFromBase64(
  base64: string,
  mimeType: string,
): { ok: true; imageUrl: string } | { ok: false; error: string } {
  if (!ALLOWED_MIMES.has(mimeType)) {
    return { ok: false, error: "Unsupported image type" };
  }
  let buf: Buffer;
  try {
    buf = Buffer.from(base64, "base64");
  } catch {
    return { ok: false, error: "Invalid image data" };
  }
  if (buf.length === 0) return { ok: false, error: "Empty image" };
  if (buf.length > MAX_BYTES) return { ok: false, error: "Image too large (max 2 MB)" };
  if (!looksLikeImage(buf, mimeType)) {
    return { ok: false, error: "File does not match declared image type" };
  }

  ensureProductImagesDir();
  const ext = MIME_TO_EXT[mimeType];
  const filename = `${randomBytes(16).toString("hex")}.${ext}`;
  const diskPath = path.join(getProductImagesRoot(), filename);
  try {
    fs.writeFileSync(diskPath, buf);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Write failed" };
  }
  return { ok: true, imageUrl: publicPathForFilename(filename) };
}

export function tryDeleteProductImageFile(imageUrl: string | null | undefined): void {
  const base = basenameFromImageUrl(imageUrl);
  if (!base) return;
  const disk = path.join(getProductImagesRoot(), base);
  try {
    if (fs.existsSync(disk)) fs.unlinkSync(disk);
  } catch {
    /* missing or locked — ignore */
  }
}

export function isSafeProductImageBasename(name: string): boolean {
  return STORED_BASENAME_RE.test(name);
}

export function extToContentType(ext: string): string {
  switch (ext.toLowerCase()) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}
