"use client";

import { useEffect, useId, useRef } from "react";

const pickBtnClass =
  "min-h-[44px] shrink-0 touch-manipulation rounded-xl border border-stone-300 bg-white px-4 py-2 text-base text-stone-800 hover:bg-stone-50 disabled:opacity-50";

type ProductImageFileInputProps = {
  disabled?: boolean;
  selectedFileName?: string | null;
  onSelect: (file: File) => void;
};

export function ProductImageFileInput({
  disabled,
  selectedFileName,
  onSelect,
}: ProductImageFileInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  useEffect(() => {
    if (!selectedFileName && inputRef.current) {
      inputRef.current.value = "";
    }
  }, [selectedFileName]);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        disabled={disabled}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onSelect(file);
        }}
      />
      <button
        type="button"
        disabled={disabled}
        className={pickBtnClass}
        onClick={() => inputRef.current?.click()}
      >
        {selectedFileName ? "Change file" : "Choose file"}
      </button>
      <span className="max-w-[min(100%,14rem)] truncate text-sm text-stone-600">
        {selectedFileName ?? "No file chosen"}
      </span>
    </div>
  );
}
