import type { OrderType } from "@prisma/client";
import { ikassirInvoke } from "@/lib/electron-api";

type OrderDetail = {
  id: string;
};

export async function startNewOrder(params: {
  type: OrderType;
  tableId: string | null;
  actorUserId: string;
}): Promise<{ ok: true; orderId: string } | { ok: false; error: string }> {
  const res = await ikassirInvoke<{ ok: boolean; order?: OrderDetail; error?: string }>(
    "orders.create",
    {
      type: params.type,
      tableId: params.tableId,
      actorUserId: params.actorUserId,
    },
  );
  if (!res.ok || !res.order?.id) {
    return { ok: false, error: res.error ?? "Could not create order" };
  }
  return { ok: true, orderId: res.order.id };
}
