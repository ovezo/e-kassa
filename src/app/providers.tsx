"use client";

import type { ReactNode } from "react";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";

export function Providers({ children }: { children: ReactNode }) {
  return <LocaleProvider>{children}</LocaleProvider>;
}
