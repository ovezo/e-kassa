import type { OrderStatus, OrderType } from "@prisma/client";

export type PosOrderListRow = {
  id: string;
  type: OrderType;
  status: OrderStatus;
  openedAt: string;
  closedAt?: string | null;
  totalTmt: number;
  table: { id: string; label: string } | null;
  lines: Array<{ productName: string; qty: number }>;
};

export type PosOrderDetail = {
  id: string;
  type: OrderType;
  status: OrderStatus;
  openedAt: string;
  closedAt: string | null;
  table: { id: string; label: string } | null;
  lines: Array<{
    id: string;
    productName: string;
    unitPriceTmt: number;
    qty: number;
    lineTotalTmt: number;
  }>;
  subtotalTmt: number;
  serviceFeeTmt: number;
  deliveryFeeTmt: number;
  totalTmt: number;
};
