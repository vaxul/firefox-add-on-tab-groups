// Fake of `browser.windows`.
import { moveAcross } from "./tabs-visibility";
import { WINDOW_ID_CURRENT, WINDOW_ID_NONE, type WindowRecord, type World } from "./world";

type Window = browser.windows.Window;

function getAll(world: World, info: browser.windows._GetAllGetInfo = {}): Window[] {
  return [...world.windows.values()]
    .filter((win) => info.windowTypes === undefined || info.windowTypes.includes(win.type))
    .map((win) => world.snapshotWindow(win, info.populate));
}

function addInitialTabs(world: World, win: WindowRecord, data: browser.windows._CreateCreateData) {
  if (data.tabId !== undefined) {
    // A torn-off tab: detach/attach are delivered before windows.onCreated.
    const tab = world.getTab(data.tabId);
    const from = world.getWindow(tab.windowId);
    moveAcross(world, tab, win, -1);
    world.activate(tab);
    world.closeIfNoVisibleTab(from);
    return;
  }
  const urls = data.url === undefined ? ["about:home"] : [data.url].flat();
  urls.forEach((url, i) => {
    const tab = world.newTabRecord(win.id, { url });
    world.insertTab(win, tab);
    world.events.tabs.onCreated.emitLater(world.snapshotTab(tab));
    if (i === 0) world.activate(tab);
  });
}

function create(world: World, data: browser.windows._CreateCreateData = {}): Window {
  const win = world.newWindowRecord(data.type === undefined ? "normal" : "popup");
  world.events.windows.onCreated.emitLater(world.snapshotWindow(win));
  addInitialTabs(world, win, data);
  if (data.focused ?? true) world.focus(win);
  return world.snapshotWindow(win, true);
}

function update(world: World, windowId: number, info: browser.windows._UpdateUpdateInfo): Window {
  const win = world.getWindow(windowId);
  if (info.focused === true) world.focus(win);
  return world.snapshotWindow(win);
}

function current(world: World, info: browser.windows.GetInfo = {}): Window {
  return world.snapshotWindow(world.resolveWindow(WINDOW_ID_CURRENT), info.populate);
}

export function createWindowsFake(world: World) {
  return {
    WINDOW_ID_NONE,
    WINDOW_ID_CURRENT,
    ...world.events.windows,
    getAll: async (info?: browser.windows._GetAllGetInfo) => getAll(world, info),
    get: async (windowId: number, info: browser.windows.GetInfo = {}) =>
      world.snapshotWindow(world.resolveWindow(windowId), info.populate),
    getCurrent: async (info?: browser.windows.GetInfo) => current(world, info),
    getLastFocused: async (info?: browser.windows.GetInfo) => current(world, info),
    create: async (data?: browser.windows._CreateCreateData) => create(world, data),
    update: async (windowId: number, info: browser.windows._UpdateUpdateInfo) =>
      update(world, windowId, info),
    remove: async (windowId: number) => world.closeWindow(world.getWindow(windowId)),
    /** Removes all windows with their tabs and all window listeners. */
    reset(): void {
      world.windows.clear();
      world.tabs.clear();
      for (const event of Object.values(world.events.windows)) event.clear();
    },
  };
}

export type FakeWindows = ReturnType<typeof createWindowsFake>;
