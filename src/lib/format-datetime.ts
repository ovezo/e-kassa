/** Receipt date: `15.05.2026` */
export function formatReceiptPrintDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

/** Receipt time: `19:33:35` */
export function formatReceiptPrintTime(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/** Date/time for order list cards (no seconds). */
export function formatOrderListDateTime(iso: string, locale: string): string {
  const tag = locale === "ru" ? "ru-RU" : "en-GB";
  return new Date(iso).toLocaleString(tag, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
