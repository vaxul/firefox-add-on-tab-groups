// Contract tests: observed Firefox tab behaviour F1, F3–F6, F9
// (docs/specs/spec-group-core.md, Constraints). The fakes must keep them.
import { beforeEach, describe, expect, it } from "vitest";
import { createFakeBrowser } from "./browser";

const fake = createFakeBrowser();
const { tabs, windows, sessions } = fake.browser;

beforeEach(() => fake.reset());

describe("F1: tabs.hide skips some tabs and reports what it hid", () => {
  it("skips the active tab and resolves with the hidden ids", async () => {
    const { tabIds } = fake.seedWindow({ tabs: [{ active: true }, {}, {}] });
    const [active, a, b] = tabIds as [number, number, number];
    expect(await tabs.hide([active, a, b])).toEqual([a, b]);
    expect((await tabs.get(active)).hidden).toBe(false);
    expect((await tabs.get(a)).hidden).toBe(true);
  });

  it.each([{ camera: true }, { microphone: true }, { screen: "Screen" }])(
    "skips a tab sharing %o",
    async (sharing) => {
      const { tabIds } = fake.seedWindow({ tabs: [{}, { sharing }, {}] });
      const [, sharingTab, other] = tabIds as [number, number, number];
      expect(await tabs.hide([sharingTab, other])).toEqual([other]);
      expect((await tabs.get(sharingTab)).hidden).toBe(false);
    },
  );

  it("skips a tab once sharing starts via setSharingState", async () => {
    const { tabIds } = fake.seedWindow({ tabs: [{}, {}] });
    tabs.setSharingState(tabIds[1] as number, { microphone: true });
    expect(await tabs.hide(tabIds[1] as number)).toEqual([]);
  });

  it("treats hiding a hidden tab as a no-op", async () => {
    const { tabIds } = fake.seedWindow({ tabs: [{}, { hidden: true }] });
    const updates: unknown[] = [];
    tabs.onUpdated.addListener((...args) => void updates.push(args));
    expect(await tabs.hide(tabIds[1] as number)).toEqual([]);
    await fake.flush();
    expect(updates).toEqual([]);
  });

  it("never hides a pinned tab", async () => {
    const { tabIds } = fake.seedWindow({ tabs: [{}, { pinned: true }] });
    expect(await tabs.hide(tabIds)).toEqual([]);
  });
});

describe("F3: cross-window tabs.move", () => {
  function twoWindows(hidden: { hidden?: boolean; discarded?: boolean }) {
    const source = fake.seedWindow({
      tabs: [{}, { ...hidden, values: { tgGroupId: "g1" } }],
    });
    const target = fake.seedWindow({ tabs: [{}] });
    return { tabId: source.tabIds[1] as number, target: target.windowId };
  }

  it("reveals a hidden tab", async () => {
    const { tabId, target } = twoWindows({ hidden: true });
    await tabs.move(tabId, { windowId: target, index: -1 });
    const tab = await tabs.get(tabId);
    expect(tab.windowId).toBe(target);
    expect(tab.hidden).toBe(false);
    expect(tab.id).toBe(tabId);
  });

  it("keeps a hidden and discarded tab hidden", async () => {
    const { tabId, target } = twoWindows({ hidden: true, discarded: true });
    await tabs.move(tabId, { windowId: target, index: -1 });
    expect((await tabs.get(tabId)).hidden).toBe(true);
  });

  it("drops the sessions values of a discarded tab; rewriting them works", async () => {
    const { tabId, target } = twoWindows({ discarded: true });
    await tabs.move(tabId, { windowId: target, index: -1 });
    expect(await sessions.getTabValue(tabId, "tgGroupId")).toBeUndefined();
    await sessions.setTabValue(tabId, "tgGroupId", "g1");
    expect(await sessions.getTabValue(tabId, "tgGroupId")).toBe("g1");
  });

  it("keeps the sessions values of a loaded tab", async () => {
    const { tabId, target } = twoWindows({});
    await tabs.move(tabId, { windowId: target, index: -1 });
    expect(await sessions.getTabValue(tabId, "tgGroupId")).toBe("g1");
  });

  it("moves several tabs as one contiguous block", async () => {
    const source = fake.seedWindow({ tabs: [{}, { hidden: true }, { hidden: true }] });
    const target = fake.seedWindow({ tabs: [{}, {}] });
    const moving = source.tabIds.slice(1);
    const moved = await tabs.move(moving, { windowId: target.windowId, index: -1 });
    expect(Array.isArray(moved) && moved.map((t) => t.index)).toEqual([2, 3]);
  });
});

describe("F4: event timing of own actions", () => {
  it("delivers detach and attach before the move promise resolves", async () => {
    const source = fake.seedWindow({ tabs: [{}, {}] });
    const target = fake.seedWindow({ tabs: [{}] });
    const seen: string[] = [];
    tabs.onDetached.addListener(() => void seen.push("detached"));
    tabs.onAttached.addListener(() => void seen.push("attached"));
    await tabs.move(source.tabIds[1] as number, { windowId: target.windowId, index: -1 });
    expect(seen).toEqual(["detached", "attached"]);
  });

  it("delivers onUpdated of a hide after the hide promise resolves", async () => {
    const { tabIds } = fake.seedWindow({ tabs: [{}, {}] });
    const seen: unknown[] = [];
    tabs.onUpdated.addListener((_id, info) => void seen.push(info), { properties: ["hidden"] });
    await tabs.hide(tabIds[1] as number);
    expect(seen).toEqual([]);
    await fake.flush();
    expect(seen).toEqual([{ hidden: true }]);
  });

  it("filters onUpdated by properties", async () => {
    const { tabIds } = fake.seedWindow({ tabs: [{}, {}] });
    const seen: unknown[] = [];
    tabs.onUpdated.addListener((_id, info) => void seen.push(info), { properties: ["pinned"] });
    await tabs.hide(tabIds[1] as number);
    await tabs.update(tabIds[1] as number, { pinned: true });
    await fake.flush();
    expect(seen).toEqual([{ pinned: true }]);
  });
});

describe("F5: removing tabs and window lifetime", () => {
  it("closes the window with its hidden tabs when the last visible tab goes", async () => {
    const { windowId, tabIds } = fake.seedWindow({ tabs: [{}, { hidden: true }] });
    fake.seedWindow();
    const removed: number[] = [];
    windows.onRemoved.addListener((id) => void removed.push(id));
    await tabs.remove(tabIds[0] as number);
    await fake.flush();
    expect(removed).toEqual([windowId]);
    await expect(tabs.get(tabIds[1] as number)).rejects.toThrow("Invalid tab ID");
  });

  it("keeps the window alive while a pinned tab remains", async () => {
    const { windowId, tabIds } = fake.seedWindow({
      tabs: [{ pinned: true }, { active: true }, { hidden: true }],
    });
    await tabs.remove(tabIds[1] as number);
    expect((await windows.get(windowId, { populate: true })).tabs).toHaveLength(2);
  });

  it("activates an adjacent visible tab when the active tab is removed", async () => {
    const { tabIds } = fake.seedWindow({ tabs: [{}, { active: true }, { hidden: true }, {}] });
    await tabs.remove(tabIds[1] as number);
    expect((await tabs.get(tabIds[3] as number)).active).toBe(true);
  });
});

describe("F6: tabs.create", () => {
  it("opens about:newtab without url", async () => {
    const { windowId } = fake.seedWindow();
    const tab = await tabs.create({ windowId });
    expect(tab.url).toBe("about:newtab");
  });

  it("refuses an explicit about:newtab", async () => {
    const { windowId } = fake.seedWindow();
    await expect(tabs.create({ windowId, url: "about:newtab" })).rejects.toThrow();
  });

  it("lands past a hidden tail when no index is given", async () => {
    const { windowId } = fake.seedWindow({ tabs: [{}, { hidden: true }, { hidden: true }] });
    const tab = await tabs.create({ windowId });
    expect(tab.index).toBe(3);
    expect(tab.active).toBe(true);
  });

  it("fires onCreated and onActivated", async () => {
    const { windowId } = fake.seedWindow();
    const seen: string[] = [];
    tabs.onCreated.addListener(() => void seen.push("created"));
    tabs.onActivated.addListener(() => void seen.push("activated"));
    await tabs.create({ windowId });
    await fake.flush();
    expect(seen).toEqual(["created", "activated"]);
  });
});

describe("F9: pinning", () => {
  it("strips native-group membership and keeps sessions values", async () => {
    const { tabIds } = fake.seedWindow({ tabs: [{}, { groupId: 7, values: { tgGroupId: "g" } }] });
    const tabId = tabIds[1] as number;
    await tabs.update(tabId, { pinned: true });
    const pinned = await tabs.get(tabId);
    expect(pinned.groupId).toBe(-1);
    expect(pinned.index).toBe(0);
    await tabs.update(tabId, { pinned: false });
    expect(await sessions.getTabValue(tabId, "tgGroupId")).toBe("g");
  });

  it("ungroup and group set the native groupId", async () => {
    const { tabIds } = fake.seedWindow({ tabs: [{}, {}] });
    const groupId = await tabs.group({ tabIds });
    expect((await tabs.query({ groupId })).map((t) => t.id)).toEqual(tabIds);
    await tabs.ungroup(tabIds);
    expect(await tabs.query({ groupId })).toEqual([]);
  });
});
