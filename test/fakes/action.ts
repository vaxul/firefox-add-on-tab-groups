// Fake of `browser.action`: badge text/colour and title, global or per window.
// A per-window value overrides the global one; `null` clears the override.

interface Details {
  windowId?: number | undefined;
  tabId?: number | undefined;
}

function createSetting<T>(initial: T) {
  let global = initial;
  const perWindow = new Map<number, T>();
  return {
    set(details: Details, value: T | null): void {
      if (details.windowId === undefined) {
        global = value ?? initial;
      } else if (value === null) {
        perWindow.delete(details.windowId);
      } else {
        perWindow.set(details.windowId, value);
      }
    },
    get(details: Details = {}): T {
      const own = details.windowId === undefined ? undefined : perWindow.get(details.windowId);
      return own ?? global;
    },
    reset(): void {
      global = initial;
      perWindow.clear();
    },
  };
}

type Color = browser.action.ColorValue;

export function createActionFake() {
  const badgeText = createSetting<string>("");
  const title = createSetting<string>("");
  const badgeColor = createSetting<Color>(null);
  return {
    setBadgeText: async (details: Details & { text: string | null }) =>
      badgeText.set(details, details.text),
    getBadgeText: async (details?: Details) => badgeText.get(details),
    setTitle: async (details: Details & { title: string | null }) =>
      title.set(details, details.title),
    getTitle: async (details?: Details) => title.get(details),
    setBadgeBackgroundColor: async (details: Details & { color: Color }) =>
      badgeColor.set(details, details.color),
    getBadgeBackgroundColor: async (details?: Details) => badgeColor.get(details),
    reset(): void {
      badgeText.reset();
      title.reset();
      badgeColor.reset();
    },
  };
}

export type FakeAction = ReturnType<typeof createActionFake>;
