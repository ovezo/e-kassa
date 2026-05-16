export type OrderLineSummary = {
  productName: string;
  qty: number;
};

export function orderLineUnits(lines: OrderLineSummary[]): number {
  return lines.reduce((sum, line) => sum + line.qty, 0);
}

/** Merge duplicate product names (multiple cart lines) into one entry per name. */
export function aggregateOrderLines(lines: OrderLineSummary[]): OrderLineSummary[] {
  const merged = new Map<string, number>();
  for (const line of lines) {
    merged.set(line.productName, (merged.get(line.productName) ?? 0) + line.qty);
  }
  return Array.from(merged, ([productName, qty]) => ({ productName, qty }));
}

/** Comma-separated product names; qty > 1 shown as `Name x2`. */
export function formatOrderLineItemsList(lines: OrderLineSummary[]): string {
  return aggregateOrderLines(lines)
    .map((line) => (line.qty > 1 ? `${line.productName} x${line.qty}` : line.productName))
    .join(", ");
}

export function formatOrderCardItemsSummary(
  lines: OrderLineSummary[],
  t: (key: string, params?: Record<string, string>) => string,
): string {
  return t("pos.order.cardItemsSummary", {
    units: String(orderLineUnits(lines)),
    items: formatOrderLineItemsList(lines),
  });
}
