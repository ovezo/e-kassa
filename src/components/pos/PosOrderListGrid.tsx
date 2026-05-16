"use client";

import type { ReactNode } from "react";

export function PosOrderListGrid({ children }: { children: ReactNode }) {
  return (
    <ul className="grid w-full auto-rows-fr gap-3 grid-cols-4">{children}</ul>
  );
}

export function PosOrderListGridItem({ children }: { children: ReactNode }) {
  return <li className="flex h-full min-h-0 w-full min-w-0">{children}</li>;
}
