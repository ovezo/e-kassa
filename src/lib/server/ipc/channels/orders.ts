import type { PrismaClient } from "@prisma/client";
import { OrderStatus, OrderType } from "@prisma/client";
import { z } from "zod";
import { getBusinessDayRange } from "../../../business-day";
import {
  clampDeliveryFeeTmt,
  defaultDeliveryFeeTmt,
  DELIVERY_FEE_STEP_TMT,
} from "../../../pos/delivery-fee";
import { audit } from "../audit";

const FEE_DEFAULTS: Record<string, string> = {
  service_fee_percent: "10",
  delivery_fee_tmt: "3",
};

async function loadFeeSettings(prisma: PrismaClient): Promise<Record<string, string>> {
  const map = { ...FEE_DEFAULTS };
  const rows = await prisma.setting.findMany();
  for (const r of rows) {
    map[r.key] = r.value;
  }
  return map;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function recalcOrderTotals(prisma: PrismaClient, orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { lines: true },
  });
  if (!order) return;
  const subtotal = round2(order.lines.reduce((s, l) => s + l.lineTotalTmt, 0));
  const settings = await loadFeeSettings(prisma);
  let serviceFeeTmt = 0;
  let deliveryFeeTmt = 0;
  if (order.type === OrderType.TABLE) {
    const pct = Number.parseFloat(settings.service_fee_percent ?? "10");
    const p = Number.isFinite(pct) ? pct : 10;
    serviceFeeTmt = round2(subtotal * (p / 100));
  }
  if (order.type === OrderType.TAKEAWAY_DELIVERY) {
    deliveryFeeTmt = round2(order.deliveryFeeTmt);
  }
  const serviceInTotal = order.serviceFeeWaived ? 0 : serviceFeeTmt;
  const totalTmt = round2(subtotal + serviceInTotal + deliveryFeeTmt);
  await prisma.order.update({
    where: { id: orderId },
    data: { subtotalTmt: subtotal, serviceFeeTmt, deliveryFeeTmt, totalTmt },
  });
}

const orderTypeSchema = z.nativeEnum(OrderType);

const createSchema = z.object({
  type: orderTypeSchema,
  tableId: z.string().nullable().optional(),
  actorUserId: z.string(),
});

const createWithLineSchema = z.object({
  type: orderTypeSchema,
  tableId: z.string().nullable().optional(),
  productId: z.string(),
  qty: z.number().int().min(1).max(99).optional(),
  actorUserId: z.string(),
});

const getSchema = z.object({
  id: z.string(),
});

const addLineSchema = z.object({
  orderId: z.string(),
  productId: z.string(),
  qty: z.number().int().min(1).max(99).optional(),
  actorUserId: z.string().optional(),
});

const updateLineSchema = z.object({
  orderId: z.string(),
  lineId: z.string(),
  qty: z.number().int().min(1).max(99),
  actorUserId: z.string().optional(),
});

const removeLineSchema = z.object({
  orderId: z.string(),
  lineId: z.string(),
  actorUserId: z.string().optional(),
});

const closeSchema = z.object({
  orderId: z.string(),
  actorUserId: z.string().optional(),
});

const setServiceFeeWaivedSchema = z.object({
  orderId: z.string(),
  waived: z.boolean(),
  actorUserId: z.string(),
});

const adjustDeliveryFeeSchema = z.object({
  orderId: z.string(),
  delta: z.union([z.literal(DELIVERY_FEE_STEP_TMT), z.literal(-DELIVERY_FEE_STEP_TMT)]),
  actorUserId: z.string(),
});

const deleteOrderSchema = z.object({
  orderId: z.string(),
  actorUserId: z.string(),
});

const discardIfEmptySchema = z.object({
  orderId: z.string(),
  actorUserId: z.string().optional(),
});

const listByDateRangeSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
});

const orderInclude = {
  table: { select: { id: true, label: true } },
  lines: { orderBy: { createdAt: "asc" as const } },
  openedBy: { select: { id: true, displayName: true } },
} as const;

export async function handleOrdersChannel(
  prisma: PrismaClient,
  channel: string,
  payload: unknown,
): Promise<unknown> {
  switch (channel) {
    case "orders.create": {
      const parsed = createSchema.safeParse(payload);
      if (!parsed.success) return { ok: false as const, error: "Invalid input" };
      const { type, actorUserId } = parsed.data;
      const tableId = parsed.data.tableId ?? null;

      const user = await prisma.user.findUnique({ where: { id: actorUserId } });
      if (!user?.active) return { ok: false as const, error: "Invalid user" };

      if (type === OrderType.TABLE) {
        if (!tableId) return { ok: false as const, error: "Table is required" };
        const table = await prisma.cafeTable.findFirst({
          where: { id: tableId, active: true },
        });
        if (!table) return { ok: false as const, error: "Table not found" };
        const openOnTable = await prisma.order.count({
          where: { tableId, status: OrderStatus.OPEN, type: OrderType.TABLE },
        });
        if (openOnTable > 0) {
          return { ok: false as const, error: "This table already has an open order" };
        }
      } else if (tableId) {
        return { ok: false as const, error: "Take-away orders cannot have a table" };
      }

      const settings = await loadFeeSettings(prisma);
      const initialDeliveryFeeTmt =
        type === OrderType.TAKEAWAY_DELIVERY ? defaultDeliveryFeeTmt(settings) : 0;

      const order = await prisma.order.create({
        data: {
          type,
          status: OrderStatus.OPEN,
          tableId: type === OrderType.TABLE ? tableId : null,
          openedByUserId: actorUserId,
          deliveryFeeTmt: initialDeliveryFeeTmt,
          totalTmt: initialDeliveryFeeTmt,
        },
        include: orderInclude,
      });
      await audit(prisma, {
        userId: actorUserId,
        action: "orders.create",
        entity: "Order",
        payload: { id: order.id, type },
      });
      return { ok: true as const, order };
    }

    case "orders.createWithLine": {
      const parsed = createWithLineSchema.safeParse(payload);
      if (!parsed.success) return { ok: false as const, error: "Invalid input" };
      const { type, actorUserId, productId } = parsed.data;
      const tableId = parsed.data.tableId ?? null;
      const qtyAdd = parsed.data.qty ?? 1;

      const user = await prisma.user.findUnique({ where: { id: actorUserId } });
      if (!user?.active) return { ok: false as const, error: "Invalid user" };

      if (type === OrderType.TABLE) {
        if (!tableId) return { ok: false as const, error: "Table is required" };
        const table = await prisma.cafeTable.findFirst({
          where: { id: tableId, active: true },
        });
        if (!table) return { ok: false as const, error: "Table not found" };
        const openOnTable = await prisma.order.count({
          where: { tableId, status: OrderStatus.OPEN, type: OrderType.TABLE },
        });
        if (openOnTable > 0) {
          return { ok: false as const, error: "This table already has an open order" };
        }
      } else if (tableId) {
        return { ok: false as const, error: "Take-away orders cannot have a table" };
      }

      const product = await prisma.product.findFirst({
        where: { id: productId, active: true },
      });
      if (!product) return { ok: false as const, error: "Product not found" };

      const unitPriceTmt = product.priceTmt;
      const lineTotalTmt = round2(unitPriceTmt * qtyAdd);

      const settings = await loadFeeSettings(prisma);
      const initialDeliveryFeeTmt =
        type === OrderType.TAKEAWAY_DELIVERY ? defaultDeliveryFeeTmt(settings) : 0;

      const created = await prisma.$transaction(async (tx) => {
        const o = await tx.order.create({
          data: {
            type,
            status: OrderStatus.OPEN,
            tableId: type === OrderType.TABLE ? tableId : null,
            openedByUserId: actorUserId,
            deliveryFeeTmt: initialDeliveryFeeTmt,
          },
        });
        await tx.orderLine.create({
          data: {
            orderId: o.id,
            productId: product.id,
            productName: product.name,
            unitPriceTmt,
            qty: qtyAdd,
            lineTotalTmt,
          },
        });
        return o;
      });

      await recalcOrderTotals(prisma, created.id);
      const full = await prisma.order.findUnique({
        where: { id: created.id },
        include: orderInclude,
      });
      if (!full) return { ok: false as const, error: "Order not found" };

      await audit(prisma, {
        userId: actorUserId,
        action: "orders.create_with_line",
        entity: "Order",
        payload: { id: full.id, type, productId },
      });
      return { ok: true as const, order: full };
    }

    case "orders.get": {
      const parsed = getSchema.safeParse(payload);
      if (!parsed.success) return { ok: false as const, error: "Invalid input" };
      const order = await prisma.order.findUnique({
        where: { id: parsed.data.id },
        include: orderInclude,
      });
      if (!order) return { ok: false as const, error: "Order not found" };
      return { ok: true as const, order };
    }

    case "orders.listOpen": {
      const orders = await prisma.order.findMany({
        where: { status: OrderStatus.OPEN },
        orderBy: { openedAt: "desc" },
        include: {
          table: { select: { id: true, label: true } },
          openedBy: { select: { id: true, displayName: true } },
          lines: { select: { productName: true, qty: true }, orderBy: { createdAt: "asc" } },
        },
      });
      return orders;
    }

    case "orders.listToday": {
      const { start, end } = getBusinessDayRange();
      const orders = await prisma.order.findMany({
        where: { openedAt: { gte: start, lt: end } },
        orderBy: { openedAt: "desc" },
        include: {
          table: { select: { id: true, label: true } },
          openedBy: { select: { id: true, displayName: true } },
          lines: { select: { productName: true, qty: true }, orderBy: { createdAt: "asc" } },
        },
      });
      return orders;
    }

    case "orders.listByDateRange": {
      const parsed = listByDateRangeSchema.safeParse(payload);
      if (!parsed.success) return { ok: false as const, error: "Invalid input" };
      
      const startDate = new Date(parsed.data.startDate);
      const endDate = new Date(parsed.data.endDate);
      
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return { ok: false as const, error: "Invalid date format" };
      }
      
      const orders = await prisma.order.findMany({
        where: { openedAt: { gte: startDate, lt: endDate } },
        orderBy: { openedAt: "desc" },
        include: {
          table: { select: { id: true, label: true } },
          openedBy: { select: { id: true, displayName: true } },
          lines: { select: { productName: true, qty: true }, orderBy: { createdAt: "asc" } },
        },
      });
      return { ok: true as const, orders };
    }

    case "orders.daySummaryByDateRange": {
      const parsed = listByDateRangeSchema.safeParse(payload);
      if (!parsed.success) return { ok: false as const, error: "Invalid input" };
      
      const startDate = new Date(parsed.data.startDate);
      const endDate = new Date(parsed.data.endDate);
      
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return { ok: false as const, error: "Invalid date format" };
      }
      
      const orders = await prisma.order.findMany({
        where: {
          status: OrderStatus.CLOSED,
          openedAt: { gte: startDate, lt: endDate },
        },
        include: { lines: true },
      });

      const productMap = new Map<string, { qty: number; totalTmt: number }>();
      let serviceCount = 0;
      let serviceTotal = 0;
      let deliveryCount = 0;
      let deliveryTotal = 0;
      let dayTotal = 0;

      for (const o of orders) {
        dayTotal += o.totalTmt;
        if (o.serviceFeeTmt > 0 && !o.serviceFeeWaived) {
          serviceCount += 1;
          serviceTotal += o.serviceFeeTmt;
        }
        if (o.deliveryFeeTmt > 0) {
          deliveryCount += 1;
          deliveryTotal += o.deliveryFeeTmt;
        }
        for (const line of o.lines) {
          const prev = productMap.get(line.productName) ?? { qty: 0, totalTmt: 0 };
          productMap.set(line.productName, {
            qty: prev.qty + line.qty,
            totalTmt: round2(prev.totalTmt + line.lineTotalTmt),
          });
        }
      }

      const venueRow = await prisma.setting.findUnique({ where: { key: "venue_name" } });
      const products = [...productMap.entries()]
        .map(([productName, v]) => ({ productName, ...v }))
        .sort((a, b) => a.productName.localeCompare(b.productName));

      return {
        ok: true as const,
        summary: {
          businessDayStart: startDate.toISOString(),
          businessDayEnd: endDate.toISOString(),
          venueName: venueRow?.value ?? "Coffee Shop",
          orderCount: orders.length,
          products,
          service:
            serviceCount > 0
              ? { count: serviceCount, totalTmt: round2(serviceTotal) }
              : null,
          delivery:
            deliveryCount > 0
              ? { count: deliveryCount, totalTmt: round2(deliveryTotal) }
              : null,
          dayTotalTmt: round2(dayTotal),
        },
      };
    }

    case "orders.daySummary": {
      const { start, end } = getBusinessDayRange();
      const orders = await prisma.order.findMany({
        where: {
          status: OrderStatus.CLOSED,
          openedAt: { gte: start, lt: end },
        },
        include: { lines: true },
      });

      const productMap = new Map<string, { qty: number; totalTmt: number }>();
      let serviceCount = 0;
      let serviceTotal = 0;
      let deliveryCount = 0;
      let deliveryTotal = 0;
      let dayTotal = 0;

      for (const o of orders) {
        dayTotal += o.totalTmt;
        if (o.serviceFeeTmt > 0 && !o.serviceFeeWaived) {
          serviceCount += 1;
          serviceTotal += o.serviceFeeTmt;
        }
        if (o.deliveryFeeTmt > 0) {
          deliveryCount += 1;
          deliveryTotal += o.deliveryFeeTmt;
        }
        for (const line of o.lines) {
          const prev = productMap.get(line.productName) ?? { qty: 0, totalTmt: 0 };
          productMap.set(line.productName, {
            qty: prev.qty + line.qty,
            totalTmt: round2(prev.totalTmt + line.lineTotalTmt),
          });
        }
      }

      const venueRow = await prisma.setting.findUnique({ where: { key: "venue_name" } });
      const products = [...productMap.entries()]
        .map(([productName, v]) => ({ productName, ...v }))
        .sort((a, b) => a.productName.localeCompare(b.productName));

      return {
        businessDayStart: start.toISOString(),
        businessDayEnd: end.toISOString(),
        venueName: venueRow?.value ?? "Coffee Shop",
        orderCount: orders.length,
        products,
        service:
          serviceCount > 0
            ? { count: serviceCount, totalTmt: round2(serviceTotal) }
            : null,
        delivery:
          deliveryCount > 0
            ? { count: deliveryCount, totalTmt: round2(deliveryTotal) }
            : null,
        dayTotalTmt: round2(dayTotal),
      };
    }

    case "orders.addLine": {
      const parsed = addLineSchema.safeParse(payload);
      if (!parsed.success) return { ok: false as const, error: "Invalid input" };
      const { orderId, productId, actorUserId } = parsed.data;
      const qtyAdd = parsed.data.qty ?? 1;

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (!order || order.status !== OrderStatus.OPEN) {
        return { ok: false as const, error: "Order not found or not open" };
      }

      const product = await prisma.product.findFirst({
        where: { id: productId, active: true },
      });
      if (!product) return { ok: false as const, error: "Product not found" };

      const existing = await prisma.orderLine.findFirst({
        where: { orderId, productId },
      });

      if (existing) {
        const qty = existing.qty + qtyAdd;
        const lineTotalTmt = round2(existing.unitPriceTmt * qty);
        await prisma.orderLine.update({
          where: { id: existing.id },
          data: { qty, lineTotalTmt },
        });
      } else {
        const unitPriceTmt = product.priceTmt;
        const lineTotalTmt = round2(unitPriceTmt * qtyAdd);
        await prisma.orderLine.create({
          data: {
            orderId,
            productId,
            productName: product.name,
            unitPriceTmt,
            qty: qtyAdd,
            lineTotalTmt,
          },
        });
      }

      await recalcOrderTotals(prisma, orderId);
      await audit(prisma, {
        userId: actorUserId,
        action: "orders.add_line",
        entity: "Order",
        payload: { orderId, productId },
      });

      const updated = await prisma.order.findUnique({
        where: { id: orderId },
        include: orderInclude,
      });
      return { ok: true as const, order: updated };
    }

    case "orders.updateLineQty": {
      const parsed = updateLineSchema.safeParse(payload);
      if (!parsed.success) return { ok: false as const, error: "Invalid input" };
      const { orderId, lineId, qty, actorUserId } = parsed.data;

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (!order || order.status !== OrderStatus.OPEN) {
        return { ok: false as const, error: "Order not found or not open" };
      }

      const line = await prisma.orderLine.findFirst({
        where: { id: lineId, orderId },
      });
      if (!line) return { ok: false as const, error: "Line not found" };

      const lineTotalTmt = round2(line.unitPriceTmt * qty);
      await prisma.orderLine.update({
        where: { id: lineId },
        data: { qty, lineTotalTmt },
      });
      await recalcOrderTotals(prisma, orderId);
      await audit(prisma, {
        userId: actorUserId,
        action: "orders.update_line_qty",
        entity: "OrderLine",
        payload: { orderId, lineId, qty },
      });
      const updated = await prisma.order.findUnique({
        where: { id: orderId },
        include: orderInclude,
      });
      return { ok: true as const, order: updated };
    }

    case "orders.removeLine": {
      const parsed = removeLineSchema.safeParse(payload);
      if (!parsed.success) return { ok: false as const, error: "Invalid input" };
      const { orderId, lineId, actorUserId } = parsed.data;

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (!order || order.status !== OrderStatus.OPEN) {
        return { ok: false as const, error: "Order not found or not open" };
      }

      const line = await prisma.orderLine.findFirst({
        where: { id: lineId, orderId },
      });
      if (!line) return { ok: false as const, error: "Line not found" };

      await prisma.orderLine.delete({ where: { id: lineId } });
      await recalcOrderTotals(prisma, orderId);
      await audit(prisma, {
        userId: actorUserId,
        action: "orders.remove_line",
        entity: "OrderLine",
        payload: { orderId, lineId },
      });
      const updated = await prisma.order.findUnique({
        where: { id: orderId },
        include: orderInclude,
      });
      return { ok: true as const, order: updated };
    }

    case "orders.setServiceFeeWaived": {
      const parsed = setServiceFeeWaivedSchema.safeParse(payload);
      if (!parsed.success) return { ok: false as const, error: "Invalid input" };
      const { orderId, waived, actorUserId } = parsed.data;

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (!order) return { ok: false as const, error: "Order not found" };
      if (order.status !== OrderStatus.OPEN) {
        return { ok: false as const, error: "Order is closed" };
      }
      if (order.type !== OrderType.TABLE) {
        return { ok: false as const, error: "Service fee applies to table orders only" };
      }

      await prisma.order.update({
        where: { id: orderId },
        data: { serviceFeeWaived: waived },
      });
      await recalcOrderTotals(prisma, orderId);
      const updated = await prisma.order.findUnique({
        where: { id: orderId },
        include: orderInclude,
      });
      if (!updated) return { ok: false as const, error: "Order not found" };

      await audit(prisma, {
        userId: actorUserId,
        action: waived ? "orders.service_fee_waived" : "orders.service_fee_restored",
        entity: "Order",
        payload: { orderId, waived },
      });
      return { ok: true as const, order: updated };
    }

    case "orders.adjustDeliveryFee": {
      const parsed = adjustDeliveryFeeSchema.safeParse(payload);
      if (!parsed.success) return { ok: false as const, error: "Invalid input" };
      const { orderId, delta, actorUserId } = parsed.data;

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (!order) return { ok: false as const, error: "Order not found" };
      if (order.status !== OrderStatus.OPEN) {
        return { ok: false as const, error: "Order is closed" };
      }
      if (order.type !== OrderType.TAKEAWAY_DELIVERY) {
        return { ok: false as const, error: "Delivery fee applies to delivery orders only" };
      }

      const newFee = clampDeliveryFeeTmt(order.deliveryFeeTmt + delta);
      await prisma.order.update({
        where: { id: orderId },
        data: { deliveryFeeTmt: newFee },
      });
      await recalcOrderTotals(prisma, orderId);
      const updated = await prisma.order.findUnique({
        where: { id: orderId },
        include: orderInclude,
      });
      if (!updated) return { ok: false as const, error: "Order not found" };

      await audit(prisma, {
        userId: actorUserId,
        action: "orders.adjust_delivery_fee",
        entity: "Order",
        payload: { orderId, delta, deliveryFeeTmt: newFee },
      });
      return { ok: true as const, order: updated };
    }

    case "orders.close": {
      const parsed = closeSchema.safeParse(payload);
      if (!parsed.success) return { ok: false as const, error: "Invalid input" };
      const { orderId, actorUserId } = parsed.data;

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { lines: true },
      });
      if (!order || order.status !== OrderStatus.OPEN) {
        return { ok: false as const, error: "Order not found or not open" };
      }
      if (order.lines.length === 0) {
        return { ok: false as const, error: "Add at least one item before closing" };
      }

      await recalcOrderTotals(prisma, orderId);
      const closed = await prisma.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CLOSED,
          closedAt: new Date(),
        },
        include: orderInclude,
      });
      await audit(prisma, {
        userId: actorUserId,
        action: "orders.close",
        entity: "Order",
        payload: { orderId, totalTmt: closed.totalTmt },
      });
      return { ok: true as const, order: closed };
    }

    case "orders.discardIfEmpty": {
      const parsed = discardIfEmptySchema.safeParse(payload);
      if (!parsed.success) return { ok: false as const, error: "Invalid input" };
      const { orderId, actorUserId } = parsed.data;

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { lines: { select: { id: true } } },
      });
      if (!order || order.status !== OrderStatus.OPEN) {
        return { ok: true as const, discarded: false as const };
      }
      if (order.lines.length > 0) {
        return { ok: true as const, discarded: false as const };
      }

      await prisma.order.delete({ where: { id: orderId } });
      await audit(prisma, {
        userId: actorUserId,
        action: "orders.discard_empty",
        entity: "Order",
        payload: { orderId },
      });
      return { ok: true as const, discarded: true as const };
    }

    case "orders.delete": {
      const parsed = deleteOrderSchema.safeParse(payload);
      if (!parsed.success) return { ok: false as const, error: "Invalid input" };
      const { orderId, actorUserId } = parsed.data;

      const user = await prisma.user.findUnique({ where: { id: actorUserId } });
      if (!user?.active) return { ok: false as const, error: "Invalid user" };

      const { start, end } = getBusinessDayRange();
      const order = await prisma.order.findFirst({
        where: { id: orderId, openedAt: { gte: start, lt: end } },
        include: { lines: { select: { id: true } } },
      });
      if (!order) {
        return { ok: false as const, error: "Order not found or not in today's list" };
      }

      await audit(prisma, {
        userId: actorUserId,
        action: "orders.delete",
        entity: "Order",
        payload: {
          orderId,
          status: order.status,
          type: order.type,
          totalTmt: order.totalTmt,
          lineCount: order.lines.length,
        },
      });

      await prisma.order.delete({ where: { id: orderId } });
      return { ok: true as const };
    }

    default:
      throw new Error(`Unknown orders channel: ${channel}`);
  }
}
