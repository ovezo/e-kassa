import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { audit } from "../audit";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  priceTmt: z.number().min(0),
  categoryId: z.string(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
  actorUserId: z.string().optional(),
});

const updateSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(200).optional(),
  priceTmt: z.number().min(0).optional(),
  categoryId: z.string().optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
  actorUserId: z.string().optional(),
});

const idSchema = z.object({
  id: z.string(),
  actorUserId: z.string().optional(),
});

const reorderSchema = z.object({
  categoryId: z.string(),
  orderedIds: z.array(z.string()).min(1),
  actorUserId: z.string().optional(),
});

export async function handleProductChannel(
  prisma: PrismaClient,
  channel: string,
  payload: unknown,
): Promise<unknown> {
  switch (channel) {
    case "products.list": {
      const q = z.object({ categoryId: z.string().optional() }).safeParse(payload);
      const categoryId = q.success ? q.data.categoryId : undefined;
      return prisma.product.findMany({
        where: categoryId ? { categoryId } : undefined,
        orderBy: [{ categoryId: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
        include: { category: true },
      });
    }
    case "products.create": {
      const parsed = createSchema.safeParse(payload);
      if (!parsed.success) return { ok: false as const, error: "Invalid input" };
      const cat = await prisma.category.findUnique({ where: { id: parsed.data.categoryId } });
      if (!cat) return { ok: false as const, error: "Category not found" };
      const maxSort = await prisma.product.aggregate({
        where: { categoryId: parsed.data.categoryId },
        _max: { sortOrder: true },
      });
      const sortOrder =
        parsed.data.sortOrder ??
        (maxSort._max.sortOrder != null ? maxSort._max.sortOrder + 1 : 0);
      const row = await prisma.product.create({
        data: {
          name: parsed.data.name.trim(),
          priceTmt: parsed.data.priceTmt,
          categoryId: parsed.data.categoryId,
          sortOrder,
          active: parsed.data.active ?? true,
        },
        include: { category: true },
      });
      await audit(prisma, {
        userId: parsed.data.actorUserId,
        action: "products.create",
        entity: "Product",
        payload: { id: row.id },
      });
      return { ok: true as const, product: row };
    }
    case "products.update": {
      const parsed = updateSchema.safeParse(payload);
      if (!parsed.success) return { ok: false as const, error: "Invalid input" };
      const { id, actorUserId, ...fields } = parsed.data;
      const data: {
        name?: string;
        priceTmt?: number;
        categoryId?: string;
        sortOrder?: number;
        active?: boolean;
      } = {};
      if (fields.name !== undefined) data.name = fields.name.trim();
      if (fields.priceTmt !== undefined) data.priceTmt = fields.priceTmt;
      if (fields.categoryId !== undefined) data.categoryId = fields.categoryId;
      if (fields.sortOrder !== undefined) data.sortOrder = fields.sortOrder;
      if (fields.active !== undefined) data.active = fields.active;
      const row = await prisma.product.update({
        where: { id },
        data,
        include: { category: true },
      });
      await audit(prisma, {
        userId: actorUserId,
        action: "products.update",
        entity: "Product",
        payload: { id },
      });
      return { ok: true as const, product: row };
    }
    case "products.delete": {
      const parsed = idSchema.safeParse(payload);
      if (!parsed.success) return { ok: false as const, error: "Invalid input" };
      const lines = await prisma.orderLine.count({ where: { productId: parsed.data.id } });
      if (lines > 0) {
        return {
          ok: false as const,
          error: "Product is referenced on past orders; deactivate instead",
        };
      }
      await prisma.product.delete({ where: { id: parsed.data.id } });
      await audit(prisma, {
        userId: parsed.data.actorUserId,
        action: "products.delete",
        entity: "Product",
        payload: { id: parsed.data.id },
      });
      return { ok: true as const };
    }
    case "products.reorder": {
      const parsed = reorderSchema.safeParse(payload);
      if (!parsed.success) return { ok: false as const, error: "Invalid input" };
      const { categoryId, orderedIds, actorUserId } = parsed.data;
      const existing = await prisma.product.findMany({
        where: { categoryId },
        select: { id: true },
      });
      const set = new Set(existing.map((p) => p.id));
      if (existing.length !== orderedIds.length || !orderedIds.every((id) => set.has(id))) {
        return { ok: false as const, error: "Product order must include all products in the category" };
      }
      await prisma.$transaction(
        orderedIds.map((id, index) =>
          prisma.product.update({ where: { id }, data: { sortOrder: index } }),
        ),
      );
      await audit(prisma, {
        userId: actorUserId,
        action: "products.reorder",
        entity: "Product",
        payload: { categoryId, orderedIds },
      });
      return { ok: true as const };
    }
    default:
      throw new Error(`Unknown products channel: ${channel}`);
  }
}
