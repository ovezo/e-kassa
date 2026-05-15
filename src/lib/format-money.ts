/** All money amounts in the app are Turkmenistan manat (TMT). */
export function formatTmt(amount: number): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "TMT",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} TMT`;
  }
}
