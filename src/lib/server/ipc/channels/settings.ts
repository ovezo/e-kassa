import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { audit } from "../audit";

const DEFAULTS: Record<string, string> = {
  service_fee_percent: "10",
  delivery_fee_tmt: "3",
  venue_name: "iKassir",
};

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
    default:
      throw new Error(`Unknown settings channel: ${channel}`);
  }
}
