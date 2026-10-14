import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeBrowser } from "../../test/fakes/browser";
import { emptyLayout, type GroupLayout } from "../core/layout";
import { planTabRecheck } from "../core/recheck";
import { planReconcile, type ReconcilePlan } from "../core/reconcile";
import { loadLayout, saveLayout } from "./group-store";
import { applyRecheck, applyReconcile } from "./reconcile-executor";
import { getTabGroup, getWindowActiveGroup, readSnapshot } from "./tab-meta";

const fake = createFakeBrowser();
const { tabs } = fake.browser;
let uninstall: () => void;
let uuid = 0;
const deps = { randomUUID: () => `g${++uuid}`, formatTitle: (n: number) => `Group ${n}` };

beforeEach(() => {
  fake.reset();
  vi.restoreAllMocks();
  uuid = 0;
  uninstall = fake.install();
});
afterEach(() => uninstall());

const layout: GroupLayout = {
  schemaVersion: 1,
  groups: [
    { id: "a", title: "A" },
    { id: "b", title: "B" },
    { id: "c", title: "C" },
  ],
};

/** Plans and applies one window at a time, re-reading state in between. */
async function reconcileAll(windowIds: number[]) {
  for (const windowId of windowIds) {
    const current = (await loadLayout()) as GroupLayout;
    const plan = planReconcile(await readSnapshot(current), windowId, deps);
    if (plan) await applyReconcile(plan);
  }
}

describe("applyReconcile (D9)", () => {
  it("first install: each window gets its own group, nothing is hidden", async () => {
    const w1 = fake.seedWindow({ tabs: [{}, {}] });
    const w2 = fake.seedWindow({ tabs: [{}, { pinned: true }] });
    await reconcileAll([w1.windowId, w2.windowId]);
    expect(await loadLayout()).toEqual({
      schemaVersion: 1,
      groups: [
        { id: "g1", title: "Group 1" },
        { id: "g2", title: "Group 2" },
      ],
    });
    expect(await getWindowActiveGroup(w1.windowId)).toBe("g1");
    expect(await getWindowActiveGroup(w2.windowId)).toBe("g2");
    expect(await Promise.all(w1.tabIds.map(getTabGroup))).toEqual(["g1", "g1"]);
    expect(await getTabGroup(w2.tabIds[1] as number)).toBeUndefined();
    expect(await tabs.query({ hidden: true })).toEqual([]);
    await fake.flush();
  });

  it("persists a created group before the window points at it", async () => {
    const { windowId } = fake.seedWindow({ tabs: [{}] });
    const set = vi.spyOn(fake.browser.storage.local, "set");
    const setWindowValue = vi.spyOn(fake.browser.sessions, "setWindowValue");
    await reconcileAll([windowId]);
    const [saveOrder] = set.mock.invocationCallOrder;
    const [windowOrder] = setWindowValue.mock.invocationCallOrder;
    expect(saveOrder).toBeLessThan(windowOrder as number);
  });

  it("re-hides inactive groups after disable/enable, memberships kept (F10)", async () => {
    await saveLayout(layout);
    const { windowId, tabIds } = fake.seedWindow({
      values: { tgActiveGroupId: "a" },
      tabs: [
        { active: true, values: { tgGroupId: "a" } },
        { hidden: true, values: { tgGroupId: "b" } },
      ],
    });
    await fake.simulateDisableEnable();
    expect((await tabs.get(tabIds[1] as number)).hidden).toBe(false);
    await reconcileAll([windowId]);
    expect((await tabs.get(tabIds[1] as number)).hidden).toBe(true);
    expect(await getTabGroup(tabIds[1] as number)).toBe("b");
    await fake.flush();
  });

  it("moves a group's tabs to the window that shows it, values re-written (F3)", async () => {
    await saveLayout(layout);
    const w1 = fake.seedWindow({
      values: { tgActiveGroupId: "a" },
      tabs: [
        { active: true, values: { tgGroupId: "a" } },
        { hidden: true, discarded: true, values: { tgGroupId: "b" } },
      ],
    });
    const w2 = fake.seedWindow({
      values: { tgActiveGroupId: "b" },
      tabs: [{ active: true, values: { tgGroupId: "b" } }],
    });
    const moved = w1.tabIds[1] as number;
    const move = vi.spyOn(tabs, "move");
    await reconcileAll([w1.windowId]);
    expect(move).toHaveBeenCalledTimes(1);
    expect(await tabs.get(moved)).toMatchObject({ windowId: w2.windowId, hidden: false });
    expect(await getTabGroup(moved)).toBe("b");
    await fake.flush();
  });

  it("creates a tab in the active group and skips empty steps", async () => {
    await saveLayout(layout);
    const { windowId } = fake.seedWindow({ tabs: [{ active: true }] });
    const plan: ReconcilePlan = {
      windowId,
      layout,
      createdGroup: undefined,
      activeGroupId: "c",
      assign: [],
      move: [{ windowId, tabIds: [] }],
      show: [],
      activate: undefined,
      createTab: true,
      ungroup: [],
      hide: [],
    };
    const hide = vi.spyOn(tabs, "hide");
    const result = await applyReconcile(plan);
    expect(await getTabGroup(result.createdTabId as number)).toBe("c");
    expect(await getWindowActiveGroup(windowId)).toBe("c");
    expect(hide).not.toHaveBeenCalled();
    await fake.flush();
  });
});

describe("applyRecheck (D11)", () => {
  it("assigns a new tab to the window's active group", async () => {
    await saveLayout(layout);
    const { tabIds } = fake.seedWindow({
      values: { tgActiveGroupId: "a" },
      tabs: [{ active: true, values: { tgGroupId: "a" } }, {}],
    });
    const tabId = tabIds[1] as number;
    await applyRecheck(tabId, planTabRecheck(await readSnapshot(layout), tabId));
    expect(await getTabGroup(tabId)).toBe("a");
  });

  it("assigns and shows a hidden orphan", async () => {
    await saveLayout(layout);
    const { tabIds } = fake.seedWindow({
      values: { tgActiveGroupId: "a" },
      tabs: [{ active: true, values: { tgGroupId: "a" } }, { hidden: true }],
    });
    const tabId = tabIds[1] as number;
    await applyRecheck(tabId, planTabRecheck(await readSnapshot(layout), tabId));
    expect(await getTabGroup(tabId)).toBe("a");
    expect((await tabs.get(tabId)).hidden).toBe(false);
    await fake.flush();
  });

  it("clears the membership of a pinned tab (D7)", async () => {
    const { tabIds } = fake.seedWindow({ tabs: [{ pinned: true, values: { tgGroupId: "a" } }] });
    const tabId = tabIds[0] as number;
    await applyRecheck(tabId, { kind: "clear" });
    expect(await getTabGroup(tabId)).toBeUndefined();
  });

  it("does nothing for none and reconcile", async () => {
    const { tabIds } = fake.seedWindow({ tabs: [{}] });
    const tabId = tabIds[0] as number;
    const show = vi.spyOn(tabs, "show");
    await applyRecheck(tabId, { kind: "none" });
    await applyRecheck(tabId, { kind: "reconcile", windowId: 1 });
    expect(show).not.toHaveBeenCalled();
    expect(await getTabGroup(tabId)).toBeUndefined();
  });
});

it("readSnapshot of an empty browser has no windows", async () => {
  expect(await readSnapshot(emptyLayout())).toEqual({
    layout: emptyLayout(),
    windows: [],
    tabs: [],
  });
});
