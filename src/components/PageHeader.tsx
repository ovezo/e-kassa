"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useTranslations } from "@/lib/i18n/LocaleProvider";

const ROOT_PATHS = new Set(["/pos/open", "/login", "/setup", "/admin/dashboard"]);

type PageHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  backHref?: string;
  showBack?: boolean;
  titleClassName?: string;
  subtitleClassName?: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  subtitle,
  backHref,
  showBack,
  titleClassName = "text-2xl font-semibold text-stone-800",
  subtitleClassName = "text-base text-stone-600",
  actions,
  className = "",
}: PageHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations();

  // Next may include a trailing slash depending on navigation; normalize so ROOT_PATHS checks stay reliable.
  const normalizedPathname = pathname?.replace(/\/+$/, "") ?? pathname;
  const shouldShowBack = showBack ?? !ROOT_PATHS.has(normalizedPathname);

  function goBack() {
    if (backHref) router.push(backHref);
    else router.back();
  }

  return (
    <div className={`flex flex-wrap items-start justify-between items-center gap-3 ${className}`}>
      <div className="flex min-w-0 flex-1 flex-col">
        {shouldShowBack ? (
          <div className="flex items-center gap-0.5 sm:gap-1 ml-1">
            <button
              type="button"
              onClick={goBack}
              aria-label={t("common.back")}
              className="-ml-1 flex h-9 w-8 shrink-0 touch-manipulation items-center justify-center rounded-xl text-stone-700 hover:bg-stone-200 active:scale-[0.98]"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <h1 className={`${titleClassName} min-w-0`}>{title}</h1>
          </div>
        ) : (
          <h1 className={`${titleClassName} min-w-0`}>{title}</h1>
        )}
        {subtitle != null ? <p className={subtitleClassName}>{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
