"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useTranslations } from "@/lib/i18n/LocaleProvider";

type ReceiptModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Shown next to Close when the user removed lines from this receipt preview. */
  onReset?: () => void;
  /** Direct / silent thermal print. */
  onPrint?: () => void;
  /** OS print dialog (choose any printer). */
  onSystemPrint?: () => void;
  printBusy?: boolean;
};

export function ReceiptModal({
  open,
  onClose,
  title,
  children,
  onReset,
  onPrint,
  onSystemPrint,
  printBusy = false,
}: ReceiptModalProps) {
  const t = useTranslations();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const showPrintFooter = onPrint || onSystemPrint;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "receipt-modal-title" : undefined}
    >
      <button
        type="button"
        className="absolute inset-0 bg-stone-900/50"
        aria-label={t("common.close")}
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[min(90vh,720px)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-stone-200 px-4 py-3">
          {title ? (
            <h2 id="receipt-modal-title" className="min-w-0 flex-1 text-lg font-semibold text-stone-900">
              {title}
            </h2>
          ) : (
            <span className="min-w-0 flex-1 text-lg font-semibold text-stone-900">
              {t("pos.order.receiptTitle")}
            </span>
          )}
          <div className="flex shrink-0 items-center gap-2">
            {onReset ? (
              <button
                type="button"
                onClick={onReset}
                className="min-h-[44px] touch-manipulation rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50"
              >
                {t("pos.order.receiptReset")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] shrink-0 touch-manipulation rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-base font-medium text-red-900 hover:bg-red-100 active:scale-[0.98]"
            >
              {t("common.close")}
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">{children}</div>
        {showPrintFooter ? (
          <div className="shrink-0 border-t border-stone-200 bg-white p-4">
            <div className="flex gap-2">
              {onPrint ? (
                <button
                  type="button"
                  disabled={printBusy}
                  onClick={onPrint}
                  className="min-h-[52px] min-w-0 flex-1 touch-manipulation rounded-xl bg-stone-900 px-4 py-3 text-base font-semibold text-white hover:bg-stone-800 active:scale-[0.99] disabled:opacity-50"
                >
                  {printBusy ? t("pos.order.receiptPrinting") : t("pos.order.receiptPrint")}
                </button>
              ) : null}
              {onSystemPrint ? (
                <button
                  type="button"
                  onClick={onSystemPrint}
                  className="min-h-[52px] shrink-0 touch-manipulation rounded-xl border border-stone-300 bg-white px-4 py-3 text-base font-semibold text-stone-900 hover:bg-stone-50 active:scale-[0.99]"
                >
                  {t("pos.order.receiptPrintSystem")}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
