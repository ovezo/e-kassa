import type { PrismaClient } from "@prisma/client";
import { OrderStatus, OrderType } from "@prisma/client";
import { getBusinessDayRange } from "../../../business-day";
import {
  buildProductChartRows,
  TOP_PRODUCTS_CHART_SIZE,
  type ProductSaleRow,
} from "../../../product-sales";
import { getPeriodRanges, type StatsPeriod } from "../../../stats-period";

export type OrderTypeMetric = {
  count: number;
  revenueTmt: number;
};

export type OrderTypeBreakdown = {
  total: OrderTypeMetric;
  dineIn: OrderTypeMetric;
  pickup: OrderTypeMetric;
  delivery: OrderTypeMetric;
};

const emptyMetric = (): OrderTypeMetric => ({ count: 0, revenueTmt: 0 });

async function closedOrdersByType(
  prisma: PrismaClient,
  start: Date,
  end: Date,
): Promise<OrderTypeBreakdown> {
  const groups = await prisma.order.groupBy({
    by: ["type"],
    where: {
      status: OrderStatus.CLOSED,
      openedAt: { gte: start, lt: end },
    },
    _count: { _all: true },
    _sum: { totalTmt: true },
  });

  const dineIn = emptyMetric();
  const pickup = emptyMetric();
  const delivery = emptyMetric();

  for (const g of groups) {
    const metric: OrderTypeMetric = {
      count: g._count._all,
      revenueTmt: g._sum.totalTmt ?? 0,
    };
    switch (g.type) {
      case OrderType.TABLE:
        Object.assign(dineIn, metric);
        break;
      case OrderType.TAKEAWAY_PICKUP:
        Object.assign(pickup, metric);
        break;
      case OrderType.TAKEAWAY_DELIVERY:
        Object.assign(delivery, metric);
        break;
    }
  }

  return {
    dineIn,
    pickup,
    delivery,
    total: {
      count: dineIn.count + pickup.count + delivery.count,
      revenueTmt: dineIn.revenueTmt + pickup.revenueTmt + delivery.revenueTmt,
    },
  };
}

async function aggregateProductSales(
  prisma: PrismaClient,
  start: Date,
  end: Date,
): Promise<ProductSaleRow[]> {
  const lines = await prisma.orderLine.findMany({
    where: {
      order: {
        status: OrderStatus.CLOSED,
        openedAt: { gte: start, lt: end },
      },
    },
    select: { productName: true, qty: true, lineTotalTmt: true },
  });

  const map = new Map<string, { qty: number; revenueTmt: number }>();
  for (const line of lines) {
    const prev = map.get(line.productName) ?? { qty: 0, revenueTmt: 0 };
    map.set(line.productName, {
      qty: prev.qty + line.qty,
      revenueTmt: prev.revenueTmt + line.lineTotalTmt,
    });
  }

  return [...map.entries()]
    .map(([productName, v]) => ({ productName, ...v }))
    .sort((a, b) => b.qty - a.qty || a.productName.localeCompare(b.productName));
}

function parseComparePayload(payload: unknown): StatsPeriod {
  const period =
    payload && typeof payload === "object" && "period" in payload
      ? (payload as { period: unknown }).period
      : undefined;
  if (period === "day" || period === "week" || period === "month") {
    return period;
  }
  throw new Error("stats.compare requires period: day | week | month");
}

export async function handleStatsChannel(
  prisma: PrismaClient,
  channel: string,
  payload: unknown,
): Promise<unknown> {
  switch (channel) {
    case "stats.today": {
      const { start, end } = getBusinessDayRange();
      const whereClosedToday = {
        status: OrderStatus.CLOSED,
        openedAt: { gte: start, lt: end },
      } as const;
      const [closedOrdersToday, sumRow, openOrders] = await Promise.all([
        prisma.order.count({ where: whereClosedToday }),
        prisma.order.aggregate({
          where: whereClosedToday,
          _sum: { totalTmt: true },
        }),
        prisma.order.count({ where: { status: OrderStatus.OPEN } }),
      ]);
      return {
        closedOrdersToday,
        revenueTmtToday: sumRow._sum.totalTmt ?? 0,
        openOrders,
      };
    }
    case "stats.compare": {
      const period = parseComparePayload(payload);
      const now = new Date();
      const { current, previous } = getPeriodRanges(period, now);
      const [
        currentCounts,
        previousCounts,
        currentProducts,
        previousProducts,
      ] = await Promise.all([
        closedOrdersByType(prisma, current.start, current.end),
        closedOrdersByType(prisma, previous.start, previous.end),
        aggregateProductSales(prisma, current.start, current.end),
        aggregateProductSales(prisma, previous.start, previous.end),
      ]);
      return {
        period,
        current: {
          ...currentCounts,
          rangeStart: current.start.toISOString(),
          rangeEnd: current.end.toISOString(),
        },
        previous: {
          ...previousCounts,
          rangeStart: previous.start.toISOString(),
          rangeEnd: previous.end.toISOString(),
        },
        productChart: buildProductChartRows(
          currentProducts,
          previousProducts,
          TOP_PRODUCTS_CHART_SIZE,
        ),
      };
    }
    default:
      throw new Error(`Unknown stats channel: ${channel}`);
  }
}
