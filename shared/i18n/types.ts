import type { en } from "./en";

/** `typeof en` with every leaf widened to `string`, so ur/ar must match its shape. */
type Widen<T> = {
  readonly [K in keyof T]: T[K] extends string ? string : Widen<T[K]>;
};
export type Translations = Widen<typeof en>;

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Dotted path to a string, e.g. "dashboard.maxLots". `serverErrors` is looked up by message. */
export type TranslationKey = Leaves<Omit<typeof en, "serverErrors">>;

export type Language = "en" | "ur" | "ar";
export type TranslationParams = Record<string, string | number>;
