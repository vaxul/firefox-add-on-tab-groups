import { describe, expect, it } from "vitest";
import type { GroupLayout } from "./layout";
import { planReconcile } from "./reconcile";
import type { Snapshot, TabState, WindowState } from "./snapshot";

const deps = { randomUUID: () => "new", formatTitle: (n: number) => `Group ${n}` };

function layoutOf(...ids: string[]): GroupLayout {
  return { schemaVersion: 1, groups: ids.map((id) => ({ id, title: id.toUpperCase() })) };
}

function win(id: number, activeGroupId: unknown, extra: Partial<WindowState> = {}): WindowState {
  return { id, type: "normal", focused: false, activeGroupId, ...extra };
}

function tab(id: number, windowId: number, groupId: unknown, extra: Partial<TabState> = {}) {
  const base: TabState = {
    id,
    windowId,
    groupId,
    pinned: false,
    hidden: false,
    active: false,
    lastAccessed: id,
    nativeGrouped: false,
  };
  return { ...base, ...extra };
}

function plan(snapshot: Snapshot, windowId = 1) {
  const result = planReconcile(snapshot, windowId, deps);
  if (result === undefined) throw new Error("expected a plan");
  return result;
}

describe("planReconcile — stored active group", () => {
  it("keeps a valid stored active group and changes nothing in a consistent window", () => {
    const snapshot: Snapshot = {
      layout: layoutOf("a", "b"),
      windows: [win(1, "a")],
      tabs: [tab(1, 1, "a", { active: true }), tab(2, 1, "b", { hidden: true })],
    };
    expect(plan(snapshot)).toEqual({
      windowId: 1,
      layout: snapshot.layout,
      createdGroup: undefined,
      activeGroupId: "a",
      assign: [],
      move: [],
      show: [],
      activate: undefined,
      createTab: false,
      ungroup: [],
      hide: [],
    });
  });

  it("adopts orphan visible and hidden tabs and shows the hidden ones (b, c)", () => {
    const snapshot: Snapshot = {
      layout: layoutOf("a"),
      windows: [win(1, "a")],
      tabs: [tab(1, 1, undefined), tab(2, 1, "gone", { hidden: true }), tab(3, 1, "a")],
    };
    const result = plan(snapshot);
    expect(result.assign).toEqual([
      { tabId: 1, groupId: "a" },
      { tabId: 2, groupId: "a" },
    ]);
    expect(result.show).toEqual([2]);
    expect(result.hide).toEqual([]);
  });

  it("shows hidden tabs of the active group (c)", () => {
    const snapshot: Snapshot = {
      layout: layoutOf("a"),
      windows: [win(1, "a")],
      tabs: [tab(1, 1, "a", { hidden: true }), tab(2, 1, "a")],
    };
    expect(plan(snapshot).show).toEqual([1]);
  });

  it("moves tabs of a group active elsewhere to that window (d)", () => {
    const snapshot: Snapshot = {
      layout: layoutOf("a", "b", "c"),
      windows: [win(1, "a"), win(2, "b"), win(3, "c")],
      tabs: [
        tab(1, 1, "a"),
        tab(2, 1, "b", { hidden: true }),
        tab(3, 1, "c"),
        tab(4, 1, "b", { hidden: true }),
      ],
    };
    const result = plan(snapshot);
    expect(result.move).toEqual([
      { windowId: 2, tabIds: [2, 4] },
      { windowId: 3, tabIds: [3] },
    ]);
    expect(result.hide).toEqual([]);
  });

  it("re-hides tabs Firefox showed after disable (F10) and ungroups them first (e)", () => {
    const snapshot: Snapshot = {
      layout: layoutOf("a", "b"),
      windows: [win(1, "a")],
      tabs: [
        tab(1, 1, "a", { active: true }),
        tab(2, 1, "b", { nativeGrouped: true }),
        tab(3, 1, "b"),
        tab(4, 1, "b", { hidden: true }),
      ],
    };
    const result = plan(snapshot);
    expect(result.ungroup).toEqual([2]);
    expect(result.hide).toEqual([2, 3]);
    expect(result.assign).toEqual([]);
    expect(result.activate).toBeUndefined();
  });

  it("ignores pinned tabs and tabs of other windows (D7)", () => {
    const snapshot: Snapshot = {
      layout: layoutOf("a", "b"),
      windows: [win(1, "a"), win(2, "b")],
      tabs: [tab(1, 1, undefined, { pinned: true, active: true }), tab(2, 2, undefined)],
    };
    const result = plan(snapshot);
    expect(result.assign).toEqual([]);
    expect(result.activate).toBeUndefined();
    expect(result.createTab).toBe(false);
  });
});

describe("planReconcile — active tab leaves", () => {
  it("activates the most recently accessed tab of the active group", () => {
    const snapshot: Snapshot = {
      layout: layoutOf("a", "b"),
      windows: [win(1, "a")],
      tabs: [
        tab(1, 1, "b", { active: true }),
        tab(2, 1, "a", { lastAccessed: 50 }),
        tab(3, 1, "a", { hidden: true, lastAccessed: 90 }),
      ],
    };
    const result = plan(snapshot);
    expect(result.hide).toEqual([1]);
    expect(result.activate).toBe(3);
    expect(result.createTab).toBe(false);
  });

  it("creates a tab when the active group has none", () => {
    const snapshot: Snapshot = {
      layout: layoutOf("a", "b"),
      windows: [win(1, "a"), win(2, "b")],
      tabs: [tab(1, 1, "b", { active: true })],
    };
    const result = plan(snapshot);
    expect(result.move).toEqual([{ windowId: 2, tabIds: [1] }]);
    expect(result.activate).toBeUndefined();
    expect(result.createTab).toBe(true);
  });
});

describe("planReconcile — window without a valid active group", () => {
  it("creates a group for a missing active group and adopts visible tabs (a)", () => {
    const snapshot: Snapshot = {
      layout: layoutOf("a", "b"),
      windows: [win(1, "a"), win(2, undefined)],
      tabs: [tab(1, 2, "a"), tab(2, 2, "b"), tab(3, 2, undefined)],
    };
    const result = plan(snapshot, 2);
    expect(result.createdGroup).toEqual({ id: "new", title: "Group 1" });
    expect(result.layout.groups.map((group) => group.id)).toEqual(["a", "b", "new"]);
    expect(result.activeGroupId).toBe("new");
    expect(result.assign.map((entry) => entry.tabId)).toEqual([1, 2, 3]);
    expect(result.move).toEqual([]);
    expect(result.hide).toEqual([]);
  });

  it("creates a group for an unknown stored active group", () => {
    const snapshot: Snapshot = {
      layout: layoutOf("a"),
      windows: [win(1, "deleted")],
      tabs: [tab(1, 1, "a")],
    };
    const result = plan(snapshot);
    expect(result.activeGroupId).toBe("new");
    expect(result.assign).toEqual([{ tabId: 1, groupId: "new" }]);
  });

  it("applies (d) and (e) to hidden tabs only", () => {
    const snapshot: Snapshot = {
      layout: layoutOf("a", "b"),
      windows: [win(1, "a"), win(2, undefined)],
      tabs: [
        tab(1, 2, "a", { hidden: true }),
        tab(2, 2, "b", { hidden: true }),
        tab(3, 2, undefined, { hidden: true }),
        tab(4, 2, "a", { active: true }),
      ],
    };
    const result = plan(snapshot, 2);
    expect(result.move).toEqual([{ windowId: 1, tabIds: [1] }]);
    expect(result.assign.map((entry) => entry.tabId)).toEqual([3, 4]);
    expect(result.show).toEqual([3]);
    expect(result.hide).toEqual([]);
  });

  it("gives a torn-off tab's new window a new group and keeps the tab there", () => {
    const snapshot: Snapshot = {
      layout: layoutOf("a"),
      windows: [win(1, "a"), win(2, undefined, { focused: true })],
      tabs: [tab(1, 1, "a"), tab(2, 2, "a", { active: true })],
    };
    const result = plan(snapshot, 2);
    expect(result.activeGroupId).toBe("new");
    expect(result.assign).toEqual([{ tabId: 2, groupId: "new" }]);
    expect(result.move).toEqual([]);
  });

  it("gives the loser of a duplicate active group a new group (focused wins)", () => {
    const snapshot: Snapshot = {
      layout: layoutOf("a"),
      windows: [win(1, "a"), win(2, "a", { focused: true })],
      tabs: [tab(1, 1, "a"), tab(2, 1, "a", { hidden: true }), tab(3, 2, "a")],
    };
    expect(plan(snapshot, 2).activeGroupId).toBe("a");
    const loser = plan(snapshot, 1);
    expect(loser.activeGroupId).toBe("new");
    expect(loser.assign).toEqual([{ tabId: 1, groupId: "new" }]);
    expect(loser.move).toEqual([{ windowId: 2, tabIds: [2] }]);
  });

  it("gives the duplicate to the lowest window id when none is focused", () => {
    const snapshot: Snapshot = {
      layout: layoutOf("a"),
      windows: [win(3, "a"), win(2, "a")],
      tabs: [],
    };
    expect(plan(snapshot, 2).activeGroupId).toBe("a");
    expect(plan(snapshot, 3).activeGroupId).toBe("new");
  });

  it("first install: an empty group list gives each window a group with all its tabs", () => {
    const snapshot: Snapshot = {
      layout: layoutOf(),
      windows: [win(1, undefined)],
      tabs: [
        tab(1, 1, undefined, { pinned: true }),
        tab(2, 1, undefined, { active: true }),
        tab(3, 1, undefined),
      ],
    };
    const result = plan(snapshot);
    expect(result.layout.groups).toEqual([{ id: "new", title: "Group 1" }]);
    expect(result.assign.map((entry) => entry.tabId)).toEqual([2, 3]);
    expect(result.show).toEqual([]);
    expect(result.hide).toEqual([]);
  });
});

describe("planReconcile — ignored windows", () => {
  it("returns undefined for non-normal and unknown windows", () => {
    const snapshot: Snapshot = {
      layout: layoutOf("a"),
      windows: [win(1, "a", { type: "popup" })],
      tabs: [tab(1, 1, undefined)],
    };
    expect(planReconcile(snapshot, 1, deps)).toBeUndefined();
    expect(planReconcile(snapshot, 2, deps)).toBeUndefined();
  });
});
