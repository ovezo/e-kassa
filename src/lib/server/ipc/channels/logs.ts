import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { z } from "zod";

const cursorSchema = z.object({
  createdAt: z.string(),
  id: z.string(),
});

export async function handleLogsChannel(
  prisma: PrismaClient,
  channel: string,
  payload: unknown,
): Promise<unknown> {
  switch (channel) {
    case "logs.list": {
      const q = z
        .object({
          limit: z.number().int().min(1).max(200).optional(),
          cursor: cursorSchema.optional(),
        })
        .safeParse(payload ?? {});
      const limit = q.success ? (q.data.limit ?? 200) : 200;
      const cursor = q.success ? q.data.cursor : undefined;

      const where: Prisma.AuditLogWhereInput =
        cursor !== undefined
          ? {
              OR: [
                { createdAt: { lt: new Date(cursor.createdAt) } },
                {
                  AND: [
                    { createdAt: new Date(cursor.createdAt) },
                    { id: { lt: cursor.id } },
                  ],
                },
              ],
            }
          : {};

      const items = await prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        include: { user: { select: { id: true, displayName: true, login: true } } },
      });

      let nextCursor: { createdAt: string; id: string } | null = null;
      const slice = items.slice(0, limit);
      if (items.length > limit) {
        const last = slice[slice.length - 1]!;
        nextCursor = { createdAt: last.createdAt.toISOString(), id: last.id };
      }

      return {
        items: slice.map((r) => ({
          id: r.id,
          action: r.action,
          entity: r.entity,
          payload: r.payload,
          createdAt: r.createdAt.toISOString(),
          user: r.user,
        })),
        nextCursor,
      };
    }
    default:
      throw new Error(`Unknown logs channel: ${channel}`);
  }
}
