import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { audit } from "../audit";
import {
  clearReceiptLogo,
  parseReceiptLogoWidthPercent,
  readReceiptLogoDataUrl,
  saveReceiptLogoFromBase64,
} from "../../receipt-logo";

const DEFAULTS: Record<string, string> = {
  service_fee_percent: "10",
  delivery_fee_tmt: "3",
  venue_name: "uniKassa",
  venue_address: "",
  receipt_footer: "NOŞ BOLSUN !",
  receipt_logo_width_percent: "60",
  /** Optional; partial match. Empty = auto-detect XP-Q80H / Xprinter. */
  receipt_printer_name: "Q80H",
};

const imageMimeEnum = z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]);

async function settingValue(prisma: PrismaClient, key: string): Promise<string | undefined> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value;
}

export async function handleSettingsChannel(
  prisma: PrismaClient,
  channel: string,
  payload: unknown,
): Promise<unknown> {
  switch (channel) {
    case "settings.getAll": {
      const rows = await prisma.setting.findMany();
      const map = { ...DEFAULTS };
      for (const r of rows) {
        map[r.key] = r.value;
      }
      return map;
    }
    case "settings.set": {
      const parsed = z
        .object({
          key: z.string().min(1).max(64),
          value: z.string().max(2000),
          actorUserId: z.string().optional(),
        })
        .safeParse(payload);
      if (!parsed.success) return { ok: false as const, error: "Invalid input" };
      if (parsed.data.key === "receipt_logo_width_percent") {
        const n = Number.parseInt(parsed.data.value.trim(), 10);
        if (!Number.isFinite(n) || n < 10 || n > 100) {
          return { ok: false as const, error: "Width must be between 10 and 100" };
        }
      }
      await prisma.setting.upsert({
        where: { key: parsed.data.key },
        create: { key: parsed.data.key, value: parsed.data.value },
        update: { value: parsed.data.value },
      });
      await audit(prisma, {
        userId: parsed.data.actorUserId,
        action: "settings.set",
        entity: "Setting",
        payload: { key: parsed.data.key },
      });
      return { ok: true as const };
    }
    case "settings.getReceiptLogo": {
      const dataUrl = readReceiptLogoDataUrl();
      if (!dataUrl) return { ok: false as const };
      const widthRaw = await settingValue(prisma, "receipt_logo_width_percent");
      return {
        ok: true as const,
        dataUrl,
        widthPercent: parseReceiptLogoWidthPercent(widthRaw ?? DEFAULTS.receipt_logo_width_percent),
      };
    }
    case "settings.uploadReceiptLogo": {
      const parsed = z
        .object({
          imageBase64: z.string().min(1).max(6_000_000),
          imageMimeType: imageMimeEnum,
          actorUserId: z.string().optional(),
        })
        .safeParse(payload);
      if (!parsed.success) return { ok: false as const, error: "Invalid input" };
      const saved = saveReceiptLogoFromBase64(parsed.data.imageBase64, parsed.data.imageMimeType);
      if (!saved.ok) return saved;
      await audit(prisma, {
        userId: parsed.data.actorUserId,
        action: "settings.uploadReceiptLogo",
        entity: "Setting",
      });
      return { ok: true as const };
    }
    case "settings.clearReceiptLogo": {
      const parsed = z
        .object({ actorUserId: z.string().optional() })
        .safeParse(payload ?? {});
      clearReceiptLogo();
      await audit(prisma, {
        userId: parsed.success ? parsed.data.actorUserId : undefined,
        action: "settings.clearReceiptLogo",
        entity: "Setting",
      });
      return { ok: true as const };
    }
    default:
      throw new Error(`Unknown settings channel: ${channel}`);
  }
}
