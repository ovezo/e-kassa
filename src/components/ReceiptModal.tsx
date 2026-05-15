"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { useTranslations } from "@/lib/i18n/LocaleProvider";

type ReceiptModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
};

export function ReceiptModal({ open, onClose, title, children }: ReceiptModalProps) {
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
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-stone-200 px-4 py-3">
          {title ? (
            <h2 id="receipt-modal-title" className="text-lg font-semibold text-stone-900">
              {title}
            </h2>
          ) : (
            <span className="text-lg font-semibold text-stone-900">{t("pos.order.receiptTitle")}</span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] shrink-0 touch-manipulation rounded-xl border border-stone-300 bg-white px-4 py-2 text-base font-medium text-stone-800 hover:bg-stone-50"
          >
            {t("common.close")}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">{children}</div>
      </div>
    </div>
  );
}
