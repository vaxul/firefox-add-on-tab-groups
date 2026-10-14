// Unit tests of the non-tab fakes, windows, reset(), and install().
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFakeBrowser } from "./browser";
import { formatMessage } from "./i18n";

const fake = createFakeBrowser();
const { tabs, windows, storage, action, runtime, i18n } = fake.browser;

beforeEach(() => fake.reset());

describe("storage", () => {
  it("supports the get key forms and clones values", async () => {
    const groups = [{ id: "a", title: "A" }];
    await storage.local.set({ schemaVersion: 1, groups });
    groups[0]!.title = "changed";
    expect(await storage.local.get("groups")).toEqual({ groups: [{ id: "a", title: "A" }] });
    expect(await storage.local.get(["schemaVersion", "missing"])).toEqual({ schemaVersion: 1 });
    expect(await storage.local.get({ missing: 0 })).toEqual({ missing: 0 });
    await storage.local.remove("groups");
    expect(await storage.local.get(null)).toEqual({ schemaVersion: 1 });
  });

  it("keeps local and session apart and fires onChanged", async () => {
    const changes: unknown[] = [];
    storage.onChanged.addListener((c, area) => void changes.push([area, c]));
    await storage.session.set({ tgStarted: true });
    await fake.flush();
    expect(await storage.local.get()).toEqual({});
    expect(changes).toEqual([["session", { tgStarted: { newValue: true } }]]);
  });
});

describe("action", () => {
  it("lets a per-window title override the global one", async () => {
    await action.setTitle({ title: "global" });
    await action.setTitle({ windowId: 2, title: "two" });
    expect(await action.getTitle({ windowId: 2 })).toBe("two");
    expect(await action.getTitle({ windowId: 3 })).toBe("global");
    await action.setBadgeText({ text: "3" });
    expect(await action.getBadgeText({ windowId: 2 })).toBe("3");
  });
});

describe("runtime", () => {
  it("answers with the promise a listener returns", async () => {
    runtime.onMessage.addListener(() => undefined);
    runtime.onMessage.addListener(async (message) => ({ ok: true, echo: message }));
    expect(await runtime.sendMessage({ type: "getState" })).toEqual({
      ok: true,
      echo: { type: "getState" },
    });
  });

  it("answers through sendResponse when a listener returns true", async () => {
    runtime.onMessage.addListener((_m, _s, sendResponse) => {
      setTimeout(() => sendResponse("late"), 0);
      return true;
    });
    expect(await runtime.sendMessage("x")).toBe("late");
  });

  it("rejects without a listener", async () => {
    await expect(runtime.sendMessage("x")).rejects.toThrow("Receiving end does not exist");
  });

  it("builds extension URLs", () => {
    expect(runtime.getURL("/popup.html")).toMatch(/^moz-extension:\/\/.+\/popup\.html$/);
  });
});

describe("i18n", () => {
  it("reads the en catalogue and switches locale", () => {
    expect(i18n.getMessage("extensionName")).toBe("Tab Groups");
    expect(i18n.getMessage("doesNotExist")).toBe("");
    i18n.useLocale("de");
    expect(i18n.getMessage("extensionDescription")).toMatch(/^Tabs gruppieren/);
    expect(i18n.getUILanguage()).toBe("de");
  });

  it("applies positional and named substitutions", () => {
    expect(formatMessage({ message: "Group $1 ($$)" }, ["3"])).toBe("Group 3 ($)");
    const named = { message: "Hi $NAME$", placeholders: { name: { content: "$1" } } };
    expect(formatMessage(named, ["Ada"])).toBe("Hi Ada");
  });
});

describe("Web Locks stand-in", () => {
  it("runs requests for one name one after another, in order", async () => {
    const order: string[] = [];
    const slow = fake.locks.request("op", async () => {
      await new Promise((r) => setTimeout(r, 5));
      order.push("first");
      return 1;
    });
    const fast = fake.locks.request("op", {}, async () => {
      order.push("second");
      return 2;
    });
    expect(fake.locks.isHeld("op")).toBe(false);
    expect(await Promise.all([slow, fast])).toEqual([1, 2]);
    expect(order).toEqual(["first", "second"]);
  });

  it("releases the lock when the callback rejects", async () => {
    await expect(
      fake.locks.request("op", async () => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
    expect(await fake.locks.request("op", () => "next")).toBe("next");
  });
});

describe("windows", () => {
  it("tears a tab off into a new focused window", async () => {
    const source = fake.seedWindow({ tabs: [{}, {}] });
    const seen: string[] = [];
    windows.onCreated.addListener(() => void seen.push("window"));
    tabs.onAttached.addListener(() => void seen.push("attached"));
    const created = await windows.create({ tabId: source.tabIds[1] as number });
    await fake.flush();
    expect(seen).toEqual(["attached", "window"]);
    expect(created.tabs?.map((t) => [t.id, t.active])).toEqual([[source.tabIds[1], true]]);
    expect((await windows.getCurrent()).id).toBe(created.id);
  });

  it("filters by window type and focuses on update", async () => {
    const normal = fake.seedWindow();
    fake.seedWindow({ type: "popup" });
    expect(await windows.getAll({ windowTypes: ["normal"] })).toHaveLength(1);
    await windows.create({ url: ["https://a.example", "https://b.example"] });
    await windows.update(normal.windowId, { focused: true });
    expect((await windows.getLastFocused()).id).toBe(normal.windowId);
    expect(await tabs.query({ currentWindow: true })).toHaveLength(1);
  });
});

describe("reset() and install()", () => {
  let uninstall: (() => void) | undefined;
  afterEach(() => uninstall?.());

  it("reset() empties every namespace", async () => {
    fake.seedWindow();
    await storage.local.set({ a: 1 });
    tabs.onCreated.addListener(() => undefined);
    fake.reset();
    expect(await windows.getAll()).toEqual([]);
    expect(await storage.local.get()).toEqual({});
    expect(tabs.onCreated.listenerCount).toBe(0);
  });

  it("install() exposes browser and navigator.locks globally", async () => {
    uninstall = fake.install();
    expect(globalThis.browser).toBe(fake.browser);
    expect(navigator.locks).toBe(fake.locks);
    uninstall();
    uninstall = undefined;
    expect("browser" in globalThis).toBe(false);
  });

  it("windows.create keeps an explicit normal type", async () => {
    fake.seedWindow();
    const created = await windows.create({ type: "normal" });
    expect(created.type).toBe("normal");
  });

  it("reset() drops errors of listeners that settle later", async () => {
    fake.seedWindow();
    tabs.onCreated.addListener(async () => {
      await new Promise((r) => setTimeout(r, 5));
      throw new Error("stale");
    });
    await tabs.create({});
    await new Promise((r) => setTimeout(r, 0));
    fake.reset();
    await new Promise((r) => setTimeout(r, 10));
    await expect(fake.flush()).resolves.toBeUndefined();
  });

  it("flush() rethrows a listener error", async () => {
    fake.seedWindow();
    tabs.onCreated.addListener(async () => Promise.reject(new Error("listener failed")));
    await tabs.create({});
    await expect(fake.flush()).rejects.toThrow("listener failed");
  });
});
