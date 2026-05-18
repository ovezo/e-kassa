import fs from "fs";
import path from "path";
import { extToContentType } from "./product-images";

/** Electron + `next dev` write this so the Next process resolves the same folder as IPC. */
export const RECEIPT_LOGO_DEV_POINTER_FILENAME = ".unikassa-receipt-logo-root";

const LOGO_BASENAME = "receipt-logo";
const LOGO_EXTS = ["jpg", "png", "webp", "gif"] as const;
const MAX_BYTES = 2 * 1024 * 1024;

const MIME_TO_EXT: Record<string, (typeof LOGO_EXTS)[number]> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const ALLOWED_MIMES = new Set(Object.keys(MIME_TO_EXT));

function readDevPointerRoot(): string | null {
  try {
    const pointerPath = path.join(process.cwd(), RECEIPT_LOGO_DEV_POINTER_FILENAME);
    if (!fs.existsSync(pointerPath)) return null;
    const raw = fs.readFileSync(pointerPath, "utf8").trim();
    const line = raw.split(/\n/)[0]?.trim() ?? "";
    if (!line) return null;
    const resolved = path.resolve(line);
    if (path.basename(resolved) !== "receipt-logo") return null;
    if (!fs.existsSync(resolved)) return null;
    return resolved;
  } catch {
    return null;
  }
}

export function getReceiptLogoRoot(): string {
  const fromEnv = process.env.UNIKASSA_RECEIPT_LOGO_ROOT?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  const fromPointer = readDevPointerRoot();
  if (fromPointer) return fromPointer;
  return path.resolve(process.cwd(), "receipt-logo");
}

export function ensureReceiptLogoDir(): void {
  const root = getReceiptLogoRoot();
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
}

function logoPathForExt(ext: string): string {
  return path.join(getReceiptLogoRoot(), `${LOGO_BASENAME}.${ext}`);
}

export function getReceiptLogoExt(): (typeof LOGO_EXTS)[number] | null {
  for (const ext of LOGO_EXTS) {
    if (fs.existsSync(logoPathForExt(ext))) return ext;
  }
  return null;
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

function clearReceiptLogoFiles(): void {
  for (const ext of LOGO_EXTS) {
    const p = logoPathForExt(ext);
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
  }
}

export function saveReceiptLogoFromBase64(
  base64: string,
  mimeType: string,
): { ok: true } | { ok: false; error: string } {
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

  ensureReceiptLogoDir();
  clearReceiptLogoFiles();
  const ext = MIME_TO_EXT[mimeType];
  const diskPath = logoPathForExt(ext);
  try {
    fs.writeFileSync(diskPath, buf);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Write failed" };
  }
  return { ok: true };
}

export function clearReceiptLogo(): void {
  clearReceiptLogoFiles();
}

export function readReceiptLogoDataUrl(): string | null {
  const ext = getReceiptLogoExt();
  if (!ext) return null;
  try {
    const buf = fs.readFileSync(logoPathForExt(ext));
    if (buf.length === 0) return null;
    const mime = extToContentType(ext);
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export function parseReceiptLogoWidthPercent(raw: string | undefined): number {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(n)) return 60;
  return Math.min(100, Math.max(10, n));
}
