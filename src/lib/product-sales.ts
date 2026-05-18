export type ProductSaleRow = {
  productName: string;
  qty: number;
  revenueTmt: number;
};

export type ProductChartRow = {
  productName: string;
  currentQty: number;
  currentRevenueTmt: number;
  previousQty: number;
  previousRevenueTmt: number;
};

export const TOP_PRODUCTS_CHART_SIZE = 20;

export function buildProductChartRows(
  currentSales: ProductSaleRow[],
  previousSales: ProductSaleRow[],
  limit = TOP_PRODUCTS_CHART_SIZE,
): ProductChartRow[] {
  const previousByName = new Map(
    previousSales.map((p) => [p.productName, { qty: p.qty, revenueTmt: p.revenueTmt }]),
  );
  return currentSales.slice(0, limit).map((p) => {
    const prev = previousByName.get(p.productName);
    return {
      productName: p.productName,
      currentQty: p.qty,
      currentRevenueTmt: p.revenueTmt,
      previousQty: prev?.qty ?? 0,
      previousRevenueTmt: prev?.revenueTmt ?? 0,
    };
  });
}

/** Bar fill: stronger color when qty is closer to max in the chart. */
export function relativeBarColor(qty: number, maxQty: number, hue: number): string {
  if (maxQty <= 0 || qty <= 0) return `hsl(${hue} 12% 92%)`;
  const ratio = Math.min(1, qty / maxQty);
  const saturation = 35 + ratio * 45;
  const lightness = 88 - ratio * 38;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}
