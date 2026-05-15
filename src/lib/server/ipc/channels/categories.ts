import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { audit } from "../audit";

const createSchema = z.object({
  name: z.string().min(1).max(128),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
  actorUserId: z.string().optional(),
});

const updateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(128).optional(),
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

export async function handleCategoryChannel(
  prisma: PrismaClient,
  channel: string,
  payload: unknown,
): Promise<unknown> {
  switch (channel) {
    case "categories.list": {
      return prisma.category.findMany({
        orderBy: { sortOrder: "asc" },
        include: { _count: { select: { products: true } } },
      });
    }
    case "categories.create": {
      const parsed = createSchema.safeParse(payload);
      if (!parsed.success) return { ok: false as const, error: "Invalid input" };
      const maxSort = await prisma.category.aggregate({ _max: { sortOrder: true } });
      const sortOrder =
        parsed.data.sortOrder ?? (maxSort._max.sortOrder != null ? maxSort._max.sortOrder + 1 : 0);
      const row = await prisma.category.create({
        data: {
          name: parsed.data.name.trim(),
          sortOrder,
          active: parsed.data.active ?? true,
        },
      });
      await audit(prisma, {
        userId: parsed.data.actorUserId,
        action: "categories.create",
        entity: "Category",
        payload: { id: row.id },
      });
      return { ok: true as const, category: row };
    }
    case "categories.update": {
      const parsed = updateSchema.safeParse(payload);
      if (!parsed.success) return { ok: false as const, error: "Invalid input" };
      const { id, actorUserId, ...fields } = parsed.data;
      const data: { name?: string; sortOrder?: number; active?: boolean } = {};
      if (fields.name !== undefined) data.name = fields.name.trim();
      if (fields.sortOrder !== undefined) data.sortOrder = fields.sortOrder;
      if (fields.active !== undefined) data.active = fields.active;
      const row = await prisma.category.update({ where: { id }, data });
      await audit(prisma, {
        userId: actorUserId,
        action: "categories.update",
        entity: "Category",
        payload: { id },
      });
      return { ok: true as const, category: row };
    }
    case "categories.delete": {
      const parsed = idSchema.safeParse(payload);
      if (!parsed.success) return { ok: false as const, error: "Invalid input" };
      const n = await prisma.product.count({ where: { categoryId: parsed.data.id } });
      if (n > 0) {
        return {
          ok: false as const,
          error: "Category has products; reassign or delete them first",
        };
      }
      await prisma.category.delete({ where: { id: parsed.data.id } });
      await audit(prisma, {
        userId: parsed.data.actorUserId,
        action: "categories.delete",
        entity: "Category",
        payload: { id: parsed.data.id },
      });
      return { ok: true as const };
    }
    case "categories.reorder": {
      const parsed = reorderSchema.safeParse(payload);
      if (!parsed.success) return { ok: false as const, error: "Invalid input" };
      const { orderedIds, actorUserId } = parsed.data;
      const rows = await prisma.category.findMany({ select: { id: true } });
      const set = new Set(rows.map((r) => r.id));
      if (rows.length !== orderedIds.length || !orderedIds.every((id) => set.has(id))) {
        return { ok: false as const, error: "Category order must include every category" };
      }
      await prisma.$transaction(
        orderedIds.map((id, index) =>
          prisma.category.update({ where: { id }, data: { sortOrder: index } }),
        ),
      );
      await audit(prisma, {
        userId: actorUserId,
        action: "categories.reorder",
        entity: "Category",
        payload: { orderedIds },
      });
      return { ok: true as const };
    }
    default:
      throw new Error(`Unknown categories channel: ${channel}`);
  }
}
