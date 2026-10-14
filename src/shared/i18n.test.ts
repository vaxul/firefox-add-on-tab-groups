import { describe, expect, it } from "vitest";
import { createI18nFake, loadCatalogue } from "../../test/fakes/i18n";
import { MESSAGE_KEYS, tabCountText, type Translate } from "./i18n";

describe("locale catalogues (D25)", () => {
  it.each(["en", "de"])("%s defines exactly the keys the code uses", (locale) => {
    const keys = Object.keys(loadCatalogue(locale)).sort();
    expect(keys).toEqual([...MESSAGE_KEYS].sort());
  });

  it.each(["en", "de"])("%s has no empty message", (locale) => {
    const catalogue = loadCatalogue(locale);
    for (const key of MESSAGE_KEYS) expect(catalogue[key]?.message.trim()).not.toBe("");
  });
});

describe("tabCountText", () => {
  const i18n = createI18nFake();
  const t: Translate = (key, ...subs) => i18n.getMessage(key, subs);

  it("uses the singular only for exactly one tab", () => {
    expect([0, 1, 2].map((n) => tabCountText(t, n))).toEqual(["0 tabs", "1 tab", "2 tabs"]);
  });

  it("is correct in German", () => {
    i18n.useLocale("de");
    expect([1, 4].map((n) => tabCountText(t, n))).toEqual(["1 Tab", "4 Tabs"]);
    i18n.reset();
  });
});
