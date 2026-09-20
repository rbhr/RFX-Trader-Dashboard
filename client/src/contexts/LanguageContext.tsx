import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  DEFAULT_LANGUAGE,
  languageDir,
  template,
  toLanguage,
  translate,
  translateServerError,
  type Language,
  type TranslationKey,
  type TranslationParams,
} from "@shared/i18n";

const STORAGE_KEY = "rfx_lang";
// Set when the language was picked before logging in (on the Login page), so
// the choice is pushed to the trader's record once a session exists instead of
// being overwritten by the saved default.
const PENDING_KEY = "rfx_lang_pending";

interface LanguageContextType {
  /** The language in effect on this page (always English on admin screens). */
  lang: Language;
  dir: "ltr" | "rtl";
  setLang: (lang: Language) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
  /** Translate an error message thrown by the server; unknown ones pass through. */
  tError: (message: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [chosen, setChosen] = useState<Language>(() =>
    toLanguage(localStorage.getItem(STORAGE_KEY))
  );

  // The Login page has no session; asking for one there only logs an error.
  const onLoginPage = location === "/";
  const { data: session } = trpc.trading.getSession.useQuery(undefined, {
    enabled: !onLoginPage,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const saveLanguage = trpc.trading.setLanguage.useMutation();
  const utils = trpc.useUtils();

  // Once logged in, the trader's saved language wins — unless they picked one
  // on the Login page just now, in which case that choice is saved instead.
  useEffect(() => {
    if (!session) return;
    if (localStorage.getItem(PENDING_KEY)) {
      localStorage.removeItem(PENDING_KEY);
      if (chosen !== session.language) {
        saveLanguage.mutate(
          { language: chosen },
          { onSuccess: () => utils.trading.getSession.invalidate() }
        );
      }
      return;
    }
    const saved = toLanguage(session.language);
    if (saved !== chosen) {
      setChosen(saved);
      localStorage.setItem(STORAGE_KEY, saved);
    }
    // Only react to the session arriving or changing, not to local picks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.language]);

  const setLang = useCallback(
    (next: Language) => {
      setChosen(next);
      localStorage.setItem(STORAGE_KEY, next);
      if (session) {
        saveLanguage.mutate(
          { language: next },
          { onSuccess: () => utils.trading.getSession.invalidate() }
        );
      } else {
        localStorage.setItem(PENDING_KEY, "1");
      }
    },
    [session, saveLanguage, utils]
  );

  // Admin screens are English-only by decision, whatever the admin picked for
  // their own trader dashboard.
  const lang: Language = location.startsWith("/admin") ? DEFAULT_LANGUAGE : chosen;
  const dir = languageDir(lang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const value = useMemo<LanguageContextType>(
    () => ({
      lang,
      dir,
      setLang,
      t: (key, params) => translate(lang, key, params),
      tError: message => translateServerError(lang, message),
    }),
    [lang, dir, setLang]
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}

/**
 * A translated sentence with styled values inside it, e.g. a bold red amount:
 * `<Trans k="dashboard.riskLimit" values={{ amount: <b>$1,000</b> }} />`.
 */
export function Trans({
  k,
  values,
}: {
  k: TranslationKey;
  values: Record<string, React.ReactNode>;
}) {
  const { lang } = useLanguage();
  const parts = template(lang, k).split(/(\{\w+\})/g);
  return (
    <>
      {parts.map((part, i) => {
        const name = /^\{(\w+)\}$/.exec(part)?.[1];
        return (
          <React.Fragment key={i}>
            {name && name in values ? values[name] : part}
          </React.Fragment>
        );
      })}
    </>
  );
}

/**
 * Figures that must read left-to-right in every language: money, lots, prices,
 * tickets, account numbers, hashes and dates.
 */
export function Ltr({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <bdi dir="ltr" className={className}>
      {children}
    </bdi>
  );
}
