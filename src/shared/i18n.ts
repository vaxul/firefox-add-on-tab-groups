// Typed access to the locale catalogue (spec-group-core D25). Every key the
// code uses is listed here, so a missing key is a type error and the locale
// test checks that `en` and `de` define exactly these keys.

export const MESSAGE_KEYS = [
  "extensionName",
  "extensionDescription",
  "defaultGroupTitle",
  "actionTitle",
  "popupTitle",
  "newGroup",
  "renameGroup",
  "closeGroup",
  "groupNameLabel",
  "tabCountOne",
  "tabCountOther",
  "activeElsewhere",
  "closeGroupConfirm",
  "cancel",
  "closeGroupAction",
] as const;

export type MessageKey = (typeof MESSAGE_KEYS)[number];

/** Looks up a message; substitutions fill `$1`, `$2`, … in order. */
export type Translate = (key: MessageKey, ...substitutions: string[]) => string;

export const translate: Translate = (key, ...substitutions) =>
  browser.i18n.getMessage(key, substitutions);

/** Tab count text: `tabCountOne` for 1, `tabCountOther` otherwise (D25). */
export function tabCountText(t: Translate, count: number): string {
  return t(count === 1 ? "tabCountOne" : "tabCountOther", String(count));
}
