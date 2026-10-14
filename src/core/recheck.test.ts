import { describe, expect, it } from "vitest";
import type { GroupLayout } from "./layout";
import { planTabRecheck } from "./recheck";
import type { Snapshot, TabState, WindowState } from "./snapshot";

const layout: GroupLayout = {
  schemaVersion: 1,
  groups: [
    { id: "a", title: "A" },
    { id: "b", title: "B" },
  ],
};

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
    lastAccessed: 0,
    nativeGrouped: false,
  };
  return { ...base, ...extra };
}

function check(tabState: TabState, windows: WindowState[] = [win(1, "a"), win(2, "b")]) {
  const snapshot: Snapshot = { layout, windows, tabs: [tabState] };
  return planTabRecheck(snapshot, tabState.id);
}

describe("planTabRecheck (D11)", () => {
  it("leaves a hidden tab with a valid membership alone", () => {
    expect(check(tab(1, 1, "b", { hidden: true }))).toEqual({ kind: "none" });
  });

  it("assigns and shows a hidden tab without a valid membership", () => {
    expect(check(tab(1, 1, "gone", { hidden: true }))).toEqual({
      kind: "assign",
      groupId: "a",
      show: true,
    });
  });

  it("assigns a visible tab without membership (new tab)", () => {
    expect(check(tab(1, 1, undefined))).toEqual({ kind: "assign", groupId: "a", show: false });
  });

  it("reassigns a visible tab of another group (attached or shown by the user)", () => {
    expect(check(tab(1, 1, "b"))).toEqual({ kind: "assign", groupId: "a", show: false });
  });

  it("leaves a visible tab of the active group alone", () => {
    expect(check(tab(1, 1, "a"))).toEqual({ kind: "none" });
  });

  it("ignores tabs in non-normal windows and unknown tabs", () => {
    expect(check(tab(1, 1, undefined), [win(1, "a", { type: "popup" })])).toEqual({
      kind: "none",
    });
    const snapshot: Snapshot = { layout, windows: [win(1, "a")], tabs: [] };
    expect(planTabRecheck(snapshot, 7)).toEqual({ kind: "none" });
  });

  it("clears the membership of a pinned tab, ignores a pinned tab without one (D7)", () => {
    expect(check(tab(1, 1, "a", { pinned: true }))).toEqual({ kind: "clear" });
    expect(check(tab(1, 1, undefined, { pinned: true }))).toEqual({ kind: "none" });
  });

  it("defers to D9 when the window has no active group (torn-off tab)", () => {
    expect(check(tab(1, 3, "a"), [win(1, "a"), win(3, undefined)])).toEqual({
      kind: "reconcile",
      windowId: 3,
    });
  });

  it("defers to D9 when the window lost a duplicate active group", () => {
    const windows = [win(1, "a", { focused: true }), win(2, "a")];
    expect(check(tab(1, 2, "a"), windows)).toEqual({ kind: "reconcile", windowId: 2 });
  });
});
