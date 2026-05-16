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
