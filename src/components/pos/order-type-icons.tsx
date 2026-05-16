import { OrderType } from "@prisma/client";

type IconProps = { className?: string };

export function IconPickup({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
    </svg>
  );
}

export function IconDelivery({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m8 0a2 2 0 104 0"
      />
    </svg>
  );
}

export function IconDineIn({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 10h16M4 10v8h16v-8M4 10l2-6h12l2 6M9 18v2M15 18v2" />
    </svg>
  );
}

export function OrderTypeIcon({ type, className }: { type: OrderType; className?: string }) {
  switch (type) {
    case OrderType.TABLE:
      return <IconDineIn className={className} />;
    case OrderType.TAKEAWAY_PICKUP:
      return <IconPickup className={className} />;
    case OrderType.TAKEAWAY_DELIVERY:
      return <IconDelivery className={className} />;
    default:
      return null;
  }
}

/** Background wrap used on create-order tiles and list cards. */
export const orderTypeIconWrapClass =
  "flex shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-600";
