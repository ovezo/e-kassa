/** Same − / + controls as receipt line strike (EditableOrderReceiptView). */

export const receiptStrikeBtn =
  "flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center rounded-lg border border-red-200 bg-red-50 text-lg font-bold leading-none text-red-800 hover:bg-red-100 active:scale-[0.98]";

export const receiptRestoreBtn =
  "flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-lg font-bold leading-none text-emerald-900 hover:bg-emerald-100 active:scale-[0.98]";

type ReceiptStrikeToggleProps = {
  waived: boolean;
  disabled?: boolean;
  removeLabel: string;
  restoreLabel: string;
  onToggle: () => void;
};

export function ReceiptStrikeToggle({
  waived,
  disabled,
  removeLabel,
  restoreLabel,
  onToggle,
}: ReceiptStrikeToggleProps) {
  return (
    <button
      type="button"
      className={waived ? receiptRestoreBtn : receiptStrikeBtn}
      disabled={disabled}
      aria-label={waived ? restoreLabel : removeLabel}
      onClick={onToggle}
    >
      {waived ? "+" : "−"}
    </button>
  );
}
