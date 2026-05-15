import type { PrismaClient } from "@prisma/client";
import { OrderStatus } from "@prisma/client";
import { z } from "zod";
import { audit } from "../audit";

const createSchema = z.object({
  label: z.string().min(1).max(64),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
  actorUserId: z.string().optional(),
});

const updateSchema = z.object({
  id: z.string(),
  label: z.string().min(1).max(64).optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
  actorUserId: z.string().optional(),
});

const idSchema = z.object({
  id: z.string(),
  actorUserId: z.string().optional(),
});

const reorderSchema = z.object({
  orderedIds: z.array(z.string()).min(1),
  actorUserId: z.string().optional(),
});

export async function handleTableChannel(
  prisma: PrismaClient,
  channel: string,
  payload: unknown,
): Promise<unknown> {
  switch (channel) {
    case "tables.list": {
      return prisma.cafeTable.findMany({
        orderBy: { sortOrder: "asc" },
        include: {
          _count: {
            select: {
              orders: { where: { status: OrderStatus.OPEN } },
            },
          },
        },
      });
    }
    case "tables.create": {
      const parsed = createSchema.safeParse(payload);
      if (!parsed.success) return { ok: false as const, error: "Invalid input" };
      const maxSort = await prisma.cafeTable.aggregate({ _max: { sortOrder: true } });
      const sortOrder =
        parsed.data.sortOrder ?? (maxSort._max.sortOrder != null ? maxSort._max.sortOrder + 1 : 0);
      const row = await prisma.cafeTable.create({
        data: {
          label: parsed.data.label.trim(),
          sortOrder,
          active: parsed.data.active ?? true,
        },
      });
      await audit(prisma, {
        userId: parsed.data.actorUserId,
        action: "tables.create",
        entity: "CafeTable",
        payload: { id: row.id },
      });
      return { ok: true as const, table: row };
    }
    case "tables.update": {
      const parsed = updateSchema.safeParse(payload);
      if (!parsed.success) return { ok: false as const, error: "Invalid input" };
      const { id, actorUserId, ...f } = parsed.data;
      const data: { label?: string; sortOrder?: number; active?: boolean } = {};
      if (f.label !== undefined) data.label = f.label.trim();
      if (f.sortOrder !== undefined) data.sortOrder = f.sortOrder;
      if (f.active !== undefined) data.active = f.active;
      const row = await prisma.cafeTable.update({ where: { id }, data });
      await audit(prisma, {
        userId: actorUserId,
        action: "tables.update",
        entity: "CafeTable",
        payload: { id },
      });
      return { ok: true as const, table: row };
    }
    case "tables.delete": {
      const parsed = idSchema.safeParse(payload);
      if (!parsed.success) return { ok: false as const, error: "Invalid input" };
      const orders = await prisma.order.count({ where: { tableId: parsed.data.id } });
      if (orders > 0) {
        return {
          ok: false as const,
          error: "Table has orders; deactivate instead of deleting",
        };
      }
      await prisma.cafeTable.delete({ where: { id: parsed.data.id } });
      await audit(prisma, {
        userId: parsed.data.actorUserId,
        action: "tables.delete",
        entity: "CafeTable",
        payload: { id: parsed.data.id },
      });
      return { ok: true as const };
    }
    case "tables.reorder": {
      const parsed = reorderSchema.safeParse(payload);
      if (!parsed.success) return { ok: false as const, error: "Invalid input" };
      const { orderedIds, actorUserId } = parsed.data;
      const rows = await prisma.cafeTable.findMany({ select: { id: true } });
      const set = new Set(rows.map((r) => r.id));
      if (rows.length !== orderedIds.length || !orderedIds.every((id) => set.has(id))) {
        return { ok: false as const, error: "Table order must include every table" };
      }
      await prisma.$transaction(
        orderedIds.map((id, index) =>
          prisma.cafeTable.update({ where: { id }, data: { sortOrder: index } }),
        ),
      );
      await audit(prisma, {
        userId: actorUserId,
        action: "tables.reorder",
        entity: "CafeTable",
        payload: { orderedIds },
      });
      return { ok: true as const };
    }
    default:
      throw new Error(`Unknown tables channel: ${channel}`);
  }
}
