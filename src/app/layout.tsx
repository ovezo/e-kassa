import "@/app/globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "uniKassa",
  description: "Coffee shop reception POS",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-stone-50 text-stone-900 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
