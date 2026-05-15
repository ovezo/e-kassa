import { ipcMain } from "electron";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { dispatchIpc } from "../../src/lib/server/ipc/index";

const envelope = z.object({
  channel: z.string(),
  payload: z.unknown().optional(),
});

export function registerIpcHandlers(prisma: PrismaClient): void {
  ipcMain.removeHandler("ikassir");
  ipcMain.handle("ikassir", async (_evt, raw: unknown) => {
    const parsed = envelope.safeParse(raw);
    if (!parsed.success) {
      throw new Error("Invalid IPC envelope");
    }
    return dispatchIpc(prisma, parsed.data.channel, parsed.data.payload);
  });
}
