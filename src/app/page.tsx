"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { readSession } from "@/lib/session";
import { useTranslations } from "@/lib/i18n/LocaleProvider";

export default function HomePage() {
  const router = useRouter();
  const t = useTranslations();

  useEffect(() => {
    const session = readSession();
    if (session) {
      router.replace("/pos/open");
    } else {
      router.replace("/login");
    }
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center text-stone-500">
      {t("common.starting")}
    </div>
  );
}
