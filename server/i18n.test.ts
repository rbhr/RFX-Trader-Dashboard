import { describe, it, expect } from "vitest";
import { en } from "../shared/i18n/en";
import { ur } from "../shared/i18n/ur";
import { ar } from "../shared/i18n/ar";
import {
  placeholders,
  translate,
  translateServerError,
  toLanguage,
} from "../shared/i18n";

/** Flatten a dictionary to `path -> text`. Paths join with "›" as serverErrors keys contain dots. */
function flatten(node: unknown, path: string[] = [], out = new Map<string, string>()) {
  if (typeof node === "string") {
    out.set(path.join("›"), node);
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) flatten(v, [...path, k], out);
  }
  return out;
}

const source = flatten(en);
const targets = { ur: flatten(ur), ar: flatten(ar) };

// Terms that are deliberately the same in every language.
const SAME_AS_ENGLISH = new Set([
  "common›magicNumber",
  "common›hit",
  "table›tp",
  "table›sl",
  "table›pnl",
]);

const htmlTags = (text: string) => (text.match(/<\/?[a-z]+>/g) ?? []).sort();

describe.each(Object.entries(targets))("%s translations", (_lang, target) => {
  it("has exactly the keys English has", () => {
    expect([...target.keys()].sort()).toEqual([...source.keys()].sort());
  });

  it("has no empty strings", () => {
    const empty = [...target].filter(([, text]) => text.trim() === "");
    expect(empty).toEqual([]);
  });

  it("keeps the same {placeholders} as English", () => {
    const mismatched = [...source]
      .filter(
        ([key, text]) =>
          placeholders(text).sort().join() !==
          placeholders(target.get(key) ?? "").sort().join()
      )
      .map(([key]) => key);
    expect(mismatched).toEqual([]);
  });

  it("keeps the same HTML tags in Telegram messages", () => {
    const mismatched = [...source]
      .filter(([key]) => key.startsWith("telegram›"))
      .filter(
        ([key, text]) =>
          htmlTags(text).join() !== htmlTags(target.get(key) ?? "").join()
      )
      .map(([key]) => key);
    expect(mismatched).toEqual([]);
  });

  it("is actually translated", () => {
    const untranslated = [...source]
      .filter(([key, text]) => !SAME_AS_ENGLISH.has(key) && target.get(key) === text)
      .map(([key]) => key);
    expect(untranslated).toEqual([]);
  });
});

describe("translate", () => {
  it("fills placeholders and leaves unknown ones visible", () => {
    expect(translate("en", "login.welcomeBack", { name: "Bisma" })).toBe(
      "Welcome back, Bisma!"
    );
    expect(translate("en", "login.welcomeBack")).toBe("Welcome back, {name}!");
  });

  it("keeps a literal $ in front of a money placeholder", () => {
    expect(
      translate("en", "notifications.trailing.message", { stopout: "1337.58" })
    ).toContain("$1337.58");
  });

  it("translates known server errors and passes unknown ones through", () => {
    expect(translateServerError("ur", "Invalid password")).toBe("غلط پاس ورڈ");
    expect(translateServerError("ar", "Something new")).toBe("Something new");
  });

  it("falls back to English for an unknown language value", () => {
    expect(toLanguage("fr")).toBe("en");
    expect(toLanguage(null)).toBe("en");
    expect(toLanguage("ar")).toBe("ar");
  });
});
