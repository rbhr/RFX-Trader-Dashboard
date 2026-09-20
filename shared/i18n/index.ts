import { en } from "./en";
import { ur } from "./ur";
import { ar } from "./ar";
import type {
  Language,
  TranslationKey,
  TranslationParams,
  Translations,
} from "./types";

export type { Language, TranslationKey, TranslationParams, Translations };

export const DEFAULT_LANGUAGE: Language = "en";

export const LANGUAGES: ReadonlyArray<{
  code: Language;
  /** The language's own name, shown in the selector. */
  label: string;
  dir: "ltr" | "rtl";
}> = [
  { code: "en", label: "English", dir: "ltr" },
  { code: "ur", label: "اردو", dir: "rtl" },
  { code: "ar", label: "العربية", dir: "rtl" },
];

const DICTIONARIES: Record<Language, Translations> = { en, ur, ar };

export function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "ur" || value === "ar";
}

/** Anything that is not a known language becomes English. */
export function toLanguage(value: unknown): Language {
  return isLanguage(value) ? value : DEFAULT_LANGUAGE;
}

export function languageDir(lang: Language): "ltr" | "rtl" {
  return lang === "en" ? "ltr" : "rtl";
}

function lookup(dictionary: Translations, key: string): string | undefined {
  let node: unknown = dictionary;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

/** The raw template for a key, falling back to English, then to the key itself. */
export function template(lang: Language, key: TranslationKey): string {
  return lookup(DICTIONARIES[lang], key) ?? lookup(en, key) ?? key;
}

/** `{name}` placeholders in a template, in order of appearance. */
export function placeholders(text: string): string[] {
  return Array.from(text.matchAll(/\{(\w+)\}/g), m => m[1]);
}

export function translate(
  lang: Language,
  key: TranslationKey,
  params?: TranslationParams
): string {
  const text = template(lang, key);
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole
  );
}

/**
 * Translate an error message thrown by the server. They arrive in English; ones
 * we know are translated, anything else is shown as it came.
 */
export function translateServerError(lang: Language, message: string): string {
  const known = DICTIONARIES[lang].serverErrors as Record<string, string>;
  return known[message] ?? message;
}

/**
 * The missed-trade monitor describes what was missing in English
 * ("stop-loss and take-profit"). The terms stay as they are in every language;
 * only the joining word is translated.
 */
export function localizeMissingParts(lang: Language, missing: string): string {
  return missing.replace(" and ", ` ${translate(lang, "common.and")} `);
}

/** True for a key stored on a notification row that this build still knows. */
export function isTranslationKey(key: string): key is TranslationKey {
  return lookup(en, key) !== undefined;
}
