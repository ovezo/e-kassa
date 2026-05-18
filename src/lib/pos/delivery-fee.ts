/** Step size when staff tap − / + on delivery fee (TMT). */
export const DELIVERY_FEE_STEP_TMT = 5;

export function defaultDeliveryFeeTmt(settings: Record<string, string> | null | undefined): number {
  const d = Number.parseFloat(settings?.delivery_fee_tmt ?? "3");
  return Math.round((Number.isFinite(d) ? d : 3) * 100) / 100;
}

export function clampDeliveryFeeTmt(value: number): number {
  return Math.max(0, Math.round(value * 100) / 100);
}
