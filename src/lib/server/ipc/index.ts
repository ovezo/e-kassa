import type { PrismaClient } from "@prisma/client";
import { handleAuthChannel } from "./channels/auth";
import { handleCategoryChannel } from "./channels/categories";
import { handleLogsChannel } from "./channels/logs";
import { handleOrdersChannel } from "./channels/orders";
import { handleProductChannel } from "./channels/products";
import { handleSettingsChannel } from "./channels/settings";
import { handleStatsChannel } from "./channels/stats";
import { handleTableChannel } from "./channels/tables";
import { handleUserChannel } from "./channels/users";

export async function dispatchIpc(
  prisma: PrismaClient,
  channel: string,
  payload: unknown,
): Promise<unknown> {
  if (channel.startsWith("auth/")) {
    return handleAuthChannel(prisma, channel, payload);
  }
  if (channel.startsWith("users.")) {
    return handleUserChannel(prisma, channel, payload);
  }
  if (channel.startsWith("categories.")) {
    return handleCategoryChannel(prisma, channel, payload);
  }
  if (channel.startsWith("products.")) {
    return handleProductChannel(prisma, channel, payload);
  }
  if (channel.startsWith("orders.")) {
    return handleOrdersChannel(prisma, channel, payload);
  }
  if (channel.startsWith("tables.")) {
    return handleTableChannel(prisma, channel, payload);
  }
  if (channel.startsWith("settings.")) {
    return handleSettingsChannel(prisma, channel, payload);
  }
  if (channel.startsWith("logs.")) {
    return handleLogsChannel(prisma, channel, payload);
  }
  if (channel.startsWith("stats.")) {
    return handleStatsChannel(prisma, channel, payload);
  }
  throw new Error(`Unknown channel: ${channel}`);
}
