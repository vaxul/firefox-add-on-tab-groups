import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeBrowser } from "../../test/fakes/browser";
import { planClose } from "../core/close";
import type { GroupLayout } from "../core/layout";
import { planSwitch, type SwitchSteps } from "../core/switch";
import { applyClose, applySwitch, applySwitchSteps, moveTabs, removeTabs } from "./executor";
import { loadLayout, saveLayout } from "./group-store";
import { getTabGroup, getWindowActiveGroup, readPlannerState } from "./tab-meta";

const fake = createFakeBrowser();
const { tabs, windows } = fake.browser;
let uninstall: () => void;

beforeEach(() => {
  fake.reset();
  vi.restoreAllMocks();
  uninstall = fake.install();
});
afterEach(() => uninstall());

const A = { tgGroupId: "a" };
const B = { tgGroupId: "b" };
const layout: GroupLayout = {
  schemaVersion: 1,
  groups: [
    { id: "a", title: "Group 1" },
    { id: "b", title: "Group 2" },
  ],
};
const deps = { randomUUID: () => "new", formatTitle: (n: number) => `Group ${n}` };

function steps(windowId: number, parts: Partial<SwitchSteps>): SwitchSteps {
  const empty = { moveTabIds: [], showTabIds: [], ungroupTabIds: [], hideTabIds: [] };
  return { windowId, groupId: "b", activateTabId: undefined, ...empty, ...parts };
}

function spyTabs() {
  return {
    move: vi.spyOn(tabs, "move"),
    show: vi.spyOn(tabs, "show"),
    hide: vi.spyOn(tabs, "hide"),
    ungroup: vi.spyOn(tabs, "ungroup"),
    create: vi.spyOn(tabs, "create"),
    remove: vi.spyOn(tabs, "remove"),
  };
}

async function tabState(tabId: number) {
  const tab = await tabs.get(tabId);
  return { windowId: tab.windowId, hidden: tab.hidden, active: tab.active };
}

function firstCall(spy: { mock: { invocationCallOrder: number[] } }): number {
  return spy.mock.invocationCallOrder[0] as number;
}

describe("applySwitch: switch within a window (D6)", () => {
  it("shows B, activates its tab, stores the active group, then hides A", async () => {
    const { windowId, tabIds } = fake.seedWindow({
      values: { tgActiveGroupId: "a" },
      tabs: [{ active: true, values: A }, { values: A }, { hidden: true, values: B }],
    });
    const [a1, a2, b1] = tabIds as [number, number, number];
    await saveLayout(layout);
    const plan = planSwitch(await readPlannerState(layout), windowId, "b");
    const spies = spyTabs();
    expect(await applySwitch(plan)).toEqual({ hiddenTabIds: [a1, a2] });
    expect(await tabState(b1)).toMatchObject({ hidden: false, active: true });
    expect((await tabState(a1)).hidden).toBe(true);
    expect((await tabState(a2)).hidden).toBe(true);
    expect(await getWindowActiveGroup(windowId)).toBe("b");
    expect(spies.show).toHaveBeenCalledTimes(1);
    expect(spies.hide).toHaveBeenCalledTimes(1);
    expect(spies.move).not.toHaveBeenCalled();
    expect(spies.ungroup).not.toHaveBeenCalled();
    await fake.flush();
  });

  it("ungroups natively grouped tabs before hiding them", async () => {
    const { windowId, tabIds } = fake.seedWindow({
      values: { tgActiveGroupId: "a" },
      tabs: [
        { active: true, values: A, groupId: 3 },
        { hidden: true, values: B },
      ],
    });
    const [a1] = tabIds as [number];
    const plan = planSwitch(await readPlannerState(layout), windowId, "b");
    const spies = spyTabs();
    await applySwitch(plan);
    expect(spies.ungroup).toHaveBeenCalledWith([a1]);
    expect((await tabs.get(a1)).groupId).toBe(-1);
    expect(firstCall(spies.ungroup)).toBeLessThan(firstCall(spies.hide));
    await fake.flush();
  });

  it("reports a sharing tab that tabs.hide skipped (F1, D8)", async () => {
    const { windowId, tabIds } = fake.seedWindow({
      tabs: [
        { active: true, values: A },
        { values: A, sharing: { microphone: true } },
        { hidden: true, values: B },
      ],
    });
    const [a1, sharing, b1] = tabIds as [number, number, number];
    const result = await applySwitchSteps(
      steps(windowId, { showTabIds: [b1], activateTabId: b1, hideTabIds: [a1, sharing] }),
    );
    expect(result.hiddenTabIds).toEqual([a1]);
    expect((await tabState(sharing)).hidden).toBe(false);
    expect(await getTabGroup(sharing)).toBe("a");
    await fake.flush();
  });

  it("creates one new tab with the membership for an empty group (F6)", async () => {
    const { windowId, tabIds } = fake.seedWindow({
      values: { tgActiveGroupId: "a" },
      tabs: [{ active: true, values: A }],
    });
    const [a1] = tabIds as [number];
    const plan = planSwitch(await readPlannerState(layout), windowId, "b");
    const spies = spyTabs();
    const result = await applySwitch(plan);
    const created = result.createdTabId as number;
    expect(spies.create).toHaveBeenCalledTimes(1);
    expect(spies.create).toHaveBeenCalledWith({ windowId, active: true });
    const tab = await tabs.get(created);
    expect(tab).toMatchObject({ windowId, url: "about:newtab", active: true, hidden: false });
    expect(await getTabGroup(created)).toBe("b");
    expect(result.hiddenTabIds).toEqual([a1]);
    await fake.flush();
  });
});

describe("applySwitch: cross-window switch (D6 step 2, F3)", () => {
  it("moves B as one block to the end, re-writes values, shows and activates", async () => {
    const source = fake.seedWindow({
      values: { tgActiveGroupId: "c" },
      tabs: [
        { active: true, values: { tgGroupId: "c" } },
        { hidden: true, values: B },
        { hidden: true, discarded: true, values: B },
      ],
    });
    const { windowId, tabIds } = fake.seedWindow({
      values: { tgActiveGroupId: "a" },
      tabs: [{ active: true, values: A }],
    });
    const [, b1, b2] = source.tabIds as [number, number, number];
    const a1 = tabIds[0] as number;
    const withC = { ...layout, groups: [...layout.groups, { id: "c", title: "C" }] };
    const plan = planSwitch(await readPlannerState(withC), windowId, "b");
    const spies = spyTabs();
    await applySwitch(plan);
    expect(spies.move).toHaveBeenCalledTimes(1);
    expect(spies.move).toHaveBeenCalledWith([b1, b2], { windowId, index: -1 });
    expect(spies.show).toHaveBeenCalledTimes(1);
    expect(spies.hide).toHaveBeenCalledTimes(1);
    const win = await windows.get(windowId, { populate: true });
    expect(win.tabs?.map((t) => t.id)).toEqual([a1, b1, b2]);
    // b2 was discarded: the move dropped its values; the executor re-wrote them.
    expect(await getTabGroup(b1)).toBe("b");
    expect(await getTabGroup(b2)).toBe("b");
    expect(await tabState(b2)).toMatchObject({ windowId, hidden: false });
    expect((await tabState(a1)).hidden).toBe(true);
    expect(await tabs.query({ windowId: source.windowId })).toHaveLength(1);
    await fake.flush();
  });

  it("moveTabs makes no call for an empty list", async () => {
    const spies = spyTabs();
    await moveTabs([], 1, "a");
    expect(spies.move).not.toHaveBeenCalled();
  });
});

describe("applySwitch: focus and none (D6 step 1)", () => {
  it("focuses the other window and changes no tab", async () => {
    const other = fake.seedWindow({ focused: false });
    fake.seedWindow({ focused: true });
    const spies = spyTabs();
    expect(await applySwitch({ kind: "focus", windowId: other.windowId })).toEqual({
      hiddenTabIds: [],
    });
    expect((await windows.get(other.windowId)).focused).toBe(true);
    for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
  });

  it("does nothing for a none plan", async () => {
    const spies = spyTabs();
    expect(await applySwitch({ kind: "none" })).toEqual({ hiddenTabIds: [] });
    for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
  });
});

describe("removeTabs and applyClose (D14)", () => {
  it("ungroups natively grouped tabs, then removes all with one call", async () => {
    const { tabIds } = fake.seedWindow({ tabs: [{ active: true }, { groupId: 4 }, {}] });
    const [, t1, t2] = tabIds as [number, number, number];
    const spies = spyTabs();
    await removeTabs([t1, t2], [t1]);
    expect(spies.ungroup).toHaveBeenCalledWith([t1]);
    expect(spies.remove).toHaveBeenCalledTimes(1);
    expect(firstCall(spies.ungroup)).toBeLessThan(firstCall(spies.remove));
    expect((await tabs.query({})).map((t) => t.id)).toEqual([tabIds[0]]);
    await fake.flush();
  });

  it("closes the active group: switches, removes its tabs, persists the layout", async () => {
    const { windowId, tabIds } = fake.seedWindow({
      values: { tgActiveGroupId: "a" },
      tabs: [
        { active: true, values: A, groupId: 2 },
        { hidden: true, values: B },
      ],
    });
    const [, b1] = tabIds as [number, number];
    await saveLayout(layout);
    const plan = planClose(await readPlannerState(layout), "a", deps);
    await applyClose(plan);
    expect((await tabs.query({})).map((t) => t.id)).toEqual([b1]);
    expect(await tabState(b1)).toMatchObject({ hidden: false, active: true });
    expect(await getWindowActiveGroup(windowId)).toBe("b");
    expect((await loadLayout())?.groups.map((g) => g.id)).toEqual(["b"]);
    await fake.flush();
  });

  it("persists a created default group before the window points at it", async () => {
    const { windowId } = fake.seedWindow({
      values: { tgActiveGroupId: "a" },
      tabs: [{ active: true, values: A }],
    });
    const only: GroupLayout = { schemaVersion: 1, groups: [{ id: "a", title: "Group 1" }] };
    await saveLayout(only);
    const plan = planClose(await readPlannerState(only), "a", deps);
    const setWindowValue = vi.spyOn(fake.browser.sessions, "setWindowValue");
    const set = vi.spyOn(fake.browser.storage.local, "set");
    const result = await applyClose(plan);
    expect(firstCall(set)).toBeLessThan(firstCall(setWindowValue));
    expect(await loadLayout()).toEqual({
      schemaVersion: 1,
      groups: [{ id: "new", title: "Group 1" }],
    });
    expect(await getWindowActiveGroup(windowId)).toBe("new");
    const remaining = await tabs.query({});
    expect(remaining.map((t) => t.id)).toEqual([result.createdTabId]);
    await fake.flush();
  });

  it("does nothing for a none plan", async () => {
    const spies = spyTabs();
    expect(await applyClose({ kind: "none" })).toEqual({ hiddenTabIds: [] });
    for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
  });
});
