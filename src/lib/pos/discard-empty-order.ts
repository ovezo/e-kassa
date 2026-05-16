import { OrderStatus } from "@prisma/client";
import { ikassirInvoke } from "@/lib/electron-api";
import { readSession } from "@/lib/session";

type OrderSnapshot = {
  id: string;
  status: OrderStatus;
  lines: unknown[];
};

let pendingDiscard: Promise<void> | null = null;

/** Wait for an in-flight empty-order discard before loading open orders. */
export function waitForPendingOrderDiscard(): Promise<void> {
  return pendingDiscard ?? Promise.resolve();
}

export async function discardEmptyOrderIfNeeded(
  orderId: string,
  snapshot?: OrderSnapshot | null,
): Promise<void> {
  const sess = readSession();
  if (!sess) return;

  if (snapshot?.id === orderId) {
    if (snapshot.status !== OrderStatus.OPEN || snapshot.lines.length > 0) return;
  }

  const run = ikassirInvoke("orders.discardIfEmpty", {
    orderId,
    actorUserId: sess.id,
  }).then(() => undefined);

  pendingDiscard = run;
  try {
    await run;
  } finally {
    if (pendingDiscard === run) pendingDiscard = null;
  }
}
