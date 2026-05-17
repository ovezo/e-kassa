import type { PrismaClient } from "@prisma/client";
import { OrderStatus } from "@prisma/client";
import { getBusinessDayRange } from "../../../business-day";

export async function handleStatsChannel(
  prisma: PrismaClient,
  channel: string,
  _payload: unknown,
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
    default:
      throw new Error(`Unknown stats channel: ${channel}`);
  }
}
