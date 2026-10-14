// Fake of `browser.i18n`, backed by the real `src/_locales/<locale>` catalogue.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface Entry {
  message: string;
  placeholders?: Record<string, { content: string }>;
}

type Catalogue = Record<string, Entry>;

export function loadCatalogue(locale: string): Catalogue {
  // A path, not a `URL`: a DOM test environment replaces the global `URL`.
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const file = resolve(root, "src/_locales", locale, "messages.json");
  return JSON.parse(readFileSync(file, "utf8")) as Catalogue;
}

/** Applies named placeholders, then `$1`…`$9`, then `$$` → `$`. */
export function formatMessage(entry: Entry, substitutions: string[]): string {
  const placeholders = Object.fromEntries(
    Object.entries(entry.placeholders ?? {}).map(([k, v]) => [k.toLowerCase(), v.content]),
  );
  return entry.message
    .replace(/\$([A-Za-z0-9_@]+)\$/g, (match, name: string) => {
      return placeholders[name.toLowerCase()] ?? match;
    })
    .replace(/\$(\$|[1-9])/g, (_match, ref: string) =>
      ref === "$" ? "$" : (substitutions[Number(ref) - 1] ?? ""),
    );
}

export function createI18nFake(locale = "en") {
  let catalogue = loadCatalogue(locale);
  let uiLanguage = locale;
  return {
    getMessage(name: string, substitutions?: string | number | (string | number)[]): string {
      const entry = catalogue[name];
      if (!entry) return "";
      const subs = substitutions === undefined ? [] : [substitutions].flat().map(String);
      return formatMessage(entry, subs);
    },
    getUILanguage: () => uiLanguage,
    /** Test helper: switches the catalogue, e.g. to `de`. */
    useLocale(next: string): void {
      catalogue = loadCatalogue(next);
      uiLanguage = next;
    },
    reset(): void {
      catalogue = loadCatalogue(locale);
      uiLanguage = locale;
    },
  };
}

export type FakeI18n = ReturnType<typeof createI18nFake>;
