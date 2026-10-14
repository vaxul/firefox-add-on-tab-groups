// Composes the namespace fakes into one fake `browser`, with seeding, event
// flushing, restart and disable/enable simulation, and global installation.
import { createActionFake } from "./action";
import { Dispatcher } from "./events";
import { createI18nFake } from "./i18n";
import { createLocksFake } from "./locks";
import { createRuntimeFake } from "./runtime";
import { createSessionsFake } from "./sessions";
import { createStorageFake } from "./storage";
import { createTabsFake } from "./tabs";
import { createWindowsFake } from "./windows";
import { World, type TabRecord } from "./world";

export interface TabSeed {
  url?: string;
  pinned?: boolean;
  hidden?: boolean;
  active?: boolean;
  discarded?: boolean;
  /** Native Firefox tab group id. */
  groupId?: number;
  values?: Record<string, unknown>;
  sharing?: Partial<browser.tabs.SharingState>;
}

export interface WindowSeed {
  type?: browser.windows.WindowType;
  focused?: boolean;
  tabs?: TabSeed[];
  values?: Record<string, unknown>;
}

function toValues(values: Record<string, unknown> = {}): Map<string, string> {
  return new Map(Object.entries(values).map(([k, v]) => [k, JSON.stringify(v)]));
}

/**
 * Adds a window that already exists, without firing events (F8: windows exist
 * at background start). The first visible tab is active unless one says so.
 */
function seedWindow(world: World, seed: WindowSeed = {}) {
  const win = world.newWindowRecord(seed.type ?? "normal");
  win.values = toValues(seed.values);
  const seeds = seed.tabs ?? [{}];
  const explicit = seeds.findIndex((t) => t.active === true);
  const activeIndex = explicit >= 0 ? explicit : seeds.findIndex((t) => t.hidden !== true);
  const tabIds = seeds.map((tabSeed, i) => {
    if (i === activeIndex && tabSeed.hidden === true)
      throw new Error("Active tab cannot be hidden");
    const tab = world.newTabRecord(win.id, {
      url: tabSeed.url ?? `https://example.com/${world.nextTabId}`,
      pinned: tabSeed.pinned ?? false,
      hidden: tabSeed.hidden ?? false,
      active: i === activeIndex,
      discarded: i !== activeIndex && tabSeed.discarded === true,
      groupId: tabSeed.groupId ?? -1,
      values: toValues(tabSeed.values),
      sharing: { camera: false, microphone: false, ...tabSeed.sharing },
    });
    world.insertTab(win, tab);
    return tab.id;
  });
  const anyFocused = [...world.windows.values()].some((w) => w.focused);
  win.focused = seed.focused ?? !anyFocused;
  if (win.focused) for (const other of world.windows.values()) other.focused = other === win;
  return { windowId: win.id, tabIds };
}

/** New window and tab ids; values, hidden state, order, and focus kept (F2). */
function restartWorld(world: World): void {
  const windows = [...world.windows.values()];
  const tabs = world.tabs;
  const groupIds = new Map<number, number>();
  world.windows = new Map();
  world.tabs = new Map();
  world.closed = [];
  for (const old of windows) {
    const win = world.newWindowRecord(old.type);
    win.focused = old.focused;
    win.values = old.values;
    for (const id of old.tabIds) {
      const tab = tabs.get(id) as TabRecord;
      if (tab.groupId !== -1 && !groupIds.has(tab.groupId)) {
        groupIds.set(tab.groupId, world.nextGroupId++);
      }
      const restored: TabRecord = {
        ...tab,
        id: world.nextTabId++,
        windowId: win.id,
        discarded: !tab.active,
        groupId: groupIds.get(tab.groupId) ?? -1,
        sharing: { camera: false, microphone: false },
      };
      world.insertTab(win, restored);
    }
  }
}

function createNamespaces(dispatcher: Dispatcher, world: World) {
  return {
    tabs: createTabsFake(world),
    windows: createWindowsFake(world),
    sessions: createSessionsFake(world),
    storage: createStorageFake(dispatcher),
    action: createActionFake(),
    runtime: createRuntimeFake(dispatcher),
    i18n: createI18nFake(),
  };
}

/** Installs `globalThis.browser` and `navigator.locks`; returns an uninstaller. */
function install(browser: object, locks: object): () => void {
  const global = globalThis as unknown as Record<string, unknown>;
  global["browser"] = browser;
  Object.defineProperty(globalThis.navigator, "locks", { value: locks, configurable: true });
  return () => {
    delete global["browser"];
    Reflect.deleteProperty(globalThis.navigator, "locks");
  };
}

export function createFakeBrowser() {
  const dispatcher = new Dispatcher();
  const world = new World(dispatcher);
  const browser = createNamespaces(dispatcher, world);
  const locks = createLocksFake();

  /** The event page goes away: listeners, session storage, action state. */
  function unloadExtension(): void {
    world.clearListeners();
    browser.storage.onChanged.clear();
    browser.storage.session.reset();
    browser.runtime.reset();
    browser.action.reset();
    locks.reset();
  }

  return {
    browser,
    locks,
    world,
    seedWindow: (seed?: WindowSeed) => seedWindow(world, seed),
    /** Waits for every pending event and listener; rethrows listener errors. */
    flush: () => dispatcher.flush(),
    /** Resets every fake to an empty browser. */
    reset(): void {
      world.reset();
      dispatcher.reset();
      for (const ns of Object.values(browser)) ns.reset();
      locks.reset();
    },
    /**
     * Browser restart: new tab and window ids; `sessions` values, hidden state
     * (F2), and `storage.local` kept; `storage.session` cleared; listeners gone.
     * Non-active tabs come back discarded (lazy session restore).
     */
    async simulateRestart(): Promise<void> {
      await dispatcher.flush();
      unloadExtension();
      restartWorld(world);
    },
    /**
     * F10 (modelled, unverified): disable shows the tabs the extension hid;
     * enable fires no event. Ids and values kept, `storage.session` cleared.
     */
    async simulateDisableEnable(): Promise<void> {
      await dispatcher.flush();
      unloadExtension();
      for (const tab of world.tabs.values()) tab.hidden = false;
    },
    /** Installs `globalThis.browser` and `navigator.locks`; returns an uninstaller. */
    install: () => install(browser, locks),
  };
}

export type FakeBrowser = ReturnType<typeof createFakeBrowser>;
