import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFakeBrowser } from "../../test/fakes/browser";
import {
  getTabGroup,
  getWindowActiveGroup,
  readWindow,
  readPlannerState,
  readSnapshot,
  readWindows,
  removeTabGroup,
  setTabGroup,
  setTabsGroup,
  setWindowActiveGroup,
} from "./tab-meta";

const fake = createFakeBrowser();
let uninstall: () => void;

beforeEach(() => {
  fake.reset();
  uninstall = fake.install();
});
afterEach(() => uninstall());

describe("tab values", () => {
  it("writes, reads, and removes a membership", async () => {
    const { tabIds } = fake.seedWindow({ tabs: [{}] });
    const tabId = tabIds[0] as number;
    expect(await getTabGroup(tabId)).toBeUndefined();
    await setTabGroup(tabId, "a");
    expect(await getTabGroup(tabId)).toBe("a");
    await removeTabGroup(tabId);
    expect(await getTabGroup(tabId)).toBeUndefined();
  });

  it("writes one membership for many tabs", async () => {
    const { tabIds } = fake.seedWindow({ tabs: [{}, {}, {}] });
    await setTabsGroup(tabIds, "b");
    expect(await Promise.all(tabIds.map(getTabGroup))).toEqual(["b", "b", "b"]);
  });

  it("ignores a non-string stored value", async () => {
    const { tabIds } = fake.seedWindow({ tabs: [{ values: { tgGroupId: 7 } }] });
    expect(await getTabGroup(tabIds[0] as number)).toBeUndefined();
  });
});

describe("window values", () => {
  it("writes and reads the active group", async () => {
    const { windowId } = fake.seedWindow();
    expect(await getWindowActiveGroup(windowId)).toBeUndefined();
    await setWindowActiveGroup(windowId, "a");
    expect(await getWindowActiveGroup(windowId)).toBe("a");
  });
});

describe("readWindows", () => {
  it("snapshots normal windows with tabs and values, skipping other types", async () => {
    const w1 = fake.seedWindow({
      values: { tgActiveGroupId: "a" },
      tabs: [
        { pinned: true },
        { active: true, values: { tgGroupId: "a" }, groupId: 5 },
        { hidden: true, discarded: true, values: { tgGroupId: "b" } },
      ],
    });
    fake.seedWindow({ type: "popup", tabs: [{}] });
    const windows = await readWindows();
    expect(windows).toHaveLength(1);
    const [win] = windows;
    expect(win?.id).toBe(w1.windowId);
    expect(win?.activeGroupId).toBe("a");
    expect(win?.tabs.map((t) => t.id)).toEqual(w1.tabIds);
    expect(win?.tabs.map((t) => t.groupId)).toEqual([undefined, "a", "b"]);
    expect(win?.tabs[0]).toMatchObject({ pinned: true, index: 0, nativeGroupId: -1 });
    expect(win?.tabs[1]).toMatchObject({ active: true, hidden: false, nativeGroupId: 5 });
    expect(win?.tabs[2]).toMatchObject({ hidden: true, discarded: true });
  });

  it("keeps values across a restart with new ids (F2)", async () => {
    fake.seedWindow({
      values: { tgActiveGroupId: "a" },
      tabs: [{ values: { tgGroupId: "a" } }, { hidden: true, values: { tgGroupId: "b" } }],
    });
    await fake.simulateRestart();
    const [win] = await readWindows();
    expect(win?.activeGroupId).toBe("a");
    expect(win?.tabs.map((t) => [t.groupId, t.hidden])).toEqual([
      ["a", false],
      ["b", true],
    ]);
  });
});

describe("readWindow", () => {
  it("reads one normal window", async () => {
    const { windowId } = fake.seedWindow({ values: { tgActiveGroupId: "a" } });
    expect((await readWindow(windowId))?.activeGroupId).toBe("a");
  });

  it("returns undefined for an unknown or non-normal window", async () => {
    const popup = fake.seedWindow({ type: "popup" });
    expect(await readWindow(popup.windowId)).toBeUndefined();
    expect(await readWindow(9999)).toBeUndefined();
  });
});

describe("readPlannerState", () => {
  it("flattens windows and tabs into the core planner snapshot", async () => {
    const layout = { schemaVersion: 1 as const, groups: [{ id: "a", title: "A" }] };
    const { windowId, tabIds } = fake.seedWindow({
      values: { tgActiveGroupId: "a" },
      tabs: [{ active: true, values: { tgGroupId: "a" }, groupId: 2 }, { hidden: true }],
    });
    const state = await readPlannerState(layout);
    expect(state.layout).toBe(layout);
    expect(state.windows).toEqual([{ id: windowId, activeGroupId: "a" }]);
    expect(state.tabs.map((t) => [t.id, t.groupId, t.nativeGrouped, t.hidden])).toEqual([
      [tabIds[0], "a", true, false],
      [tabIds[1], undefined, false, true],
    ]);
  });
});

describe("readSnapshot", () => {
  it("includes every window type with focus and the tabs' active state", async () => {
    const layout = { schemaVersion: 1 as const, groups: [] };
    const normal = fake.seedWindow({ focused: true, tabs: [{ values: { tgGroupId: "x" } }] });
    const popup = fake.seedWindow({ type: "popup", focused: false, tabs: [{}] });
    const snapshot = await readSnapshot(layout);
    expect(snapshot.windows).toEqual([
      { id: normal.windowId, type: "normal", focused: true, activeGroupId: undefined },
      { id: popup.windowId, type: "popup", focused: false, activeGroupId: undefined },
    ]);
    expect(snapshot.tabs[0]).toMatchObject({
      id: normal.tabIds[0],
      active: true,
      nativeGrouped: false,
      groupId: "x",
    });
    expect(snapshot.tabs).toHaveLength(2);
  });
});
