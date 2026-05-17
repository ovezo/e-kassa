"use client";

import { ReactNode } from "react";

interface NumberPadProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit?: () => void;
  disabled?: boolean;
}

export function NumberPad({ value, onChange, onSubmit, disabled }: NumberPadProps) {
  const handlePress = (num: string) => {
    if (disabled) return;
    onChange(value + num);
  };

  const handleBackspace = () => {
    if (disabled) return;
    onChange(value.slice(0, -1));
  };

  const baseBtnClass =
    "flex h-16 items-center justify-center rounded-2xl text-2xl font-medium shadow-sm border transition-all active:scale-95 disabled:opacity-50";

  const numBtnClass = `${baseBtnClass} bg-white text-stone-800 border-stone-200 active:bg-stone-100`;

  return (
    <div className="w-full max-w-xs mx-auto">
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <button
            key={num}
            type="button"
            className={numBtnClass}
            onClick={() => handlePress(num.toString())}
            disabled={disabled}
          >
            {num}
          </button>
        ))}
        <button
          type="button"
          className={`${baseBtnClass} bg-stone-100 text-stone-600 border-stone-200 active:bg-stone-200`}
          onClick={handleBackspace}
          disabled={disabled || value.length === 0}
        >
          ⌫
        </button>
        <button
          type="button"
          className={numBtnClass}
          onClick={() => handlePress("0")}
          disabled={disabled}
        >
          0
        </button>
        {onSubmit ? (
          <button
            type="button"
            className={`${baseBtnClass} bg-stone-900 text-white border-stone-900 hover:bg-stone-800 active:bg-stone-950`}
            onClick={onSubmit}
            disabled={disabled || value.length === 0}
          >
            OK
          </button>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
}
