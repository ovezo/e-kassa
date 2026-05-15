"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminIndexPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/dashboard/");
  }, [router]);
  return (
    <p className="p-4 text-sm text-stone-500" aria-live="polite">
      Redirecting…
    </p>
  );
}
