"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  LOCALE_STORAGE_KEY,
  LOCALE_STORAGE_KEYS_LEGACY,
  dictionaries,
  interpolate,
  type Locale,
} from "./dictionary";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readStoredLocale(): Locale | null {
  if (typeof window === "undefined") return null;
  try {
    let raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (!raw) {
      for (const key of LOCALE_STORAGE_KEYS_LEGACY) {
        raw = localStorage.getItem(key);
        if (raw) break;
      }
    }
    if (raw === "ru" || raw === "en") return raw;
  } catch {
    /* ignore */
  }
  return null;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const stored = readStoredLocale();
    if (stored) setLocaleState(stored);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = locale === "ru" ? "ru" : "en";
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return ctx;
}

export function useTranslations() {
  const { locale } = useLocale();
  const dict = dictionaries[locale];

  return useCallback(
    (key: string, vars?: Record<string, string>) => {
      const template = dict[key] ?? dictionaries.en[key] ?? key;
      return interpolate(template, vars);
    },
    [dict],
  );
}
