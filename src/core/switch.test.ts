import { describe, expect, it } from "vitest";
import { stateOf, tab } from "../../test/core/planner-fixtures";
import { planSwitch } from "./switch";

const W = 1;
const W2 = 2;

describe("planSwitch", () => {
  it("shows the target group, activates its most recent tab, and hides the outgoing tabs", () => {
    const state = stateOf(
      ["a", "b"],
      [{ id: W, activeGroupId: "a" }],
      [
        tab(1, W, "a", { lastAccessed: 50 }), // active tab of the outgoing group
        tab(2, W, "a"),
        tab(3, W, "b", { hidden: true, lastAccessed: 10 }),
        tab(4, W, "b", { hidden: true, lastAccessed: 30 }),
      ],
    );
    expect(planSwitch(state, W, "b")).toEqual({
      kind: "switch",
      windowId: W,
      groupId: "b",
      moveTabIds: [],
      showTabIds: [3, 4],
      activateTabId: 4,
      ungroupTabIds: [],
      hideTabIds: [1, 2],
    });
  });

  it("creates a new tab when the target group is empty", () => {
    const state = stateOf(["a", "b"], [{ id: W, activeGroupId: "a" }], [tab(1, W, "a")]);
    const plan = planSwitch(state, W, "b");
    expect(plan).toMatchObject({ kind: "switch", showTabIds: [], activateTabId: undefined });
    expect(plan).toMatchObject({ hideTabIds: [1] });
  });

  it("treats a group with only pinned tabs as empty and never touches pinned tabs", () => {
    const state = stateOf(
      ["a", "b"],
      [{ id: W, activeGroupId: "a" }],
      [
        tab(1, W, undefined, { pinned: true }),
        tab(2, W, "b", { pinned: true }), // stale membership on a pinned tab (D7)
        tab(3, W, "a", { pinned: true }),
        tab(4, W, "a"),
      ],
    );
    expect(planSwitch(state, W, "b")).toMatchObject({
      moveTabIds: [],
      showTabIds: [],
      activateTabId: undefined,
      ungroupTabIds: [],
      hideTabIds: [4],
    });
  });

  it("moves the target group's tabs hidden in other windows as one block and shows them", () => {
    const state = stateOf(
      ["a", "b", "c"],
      [
        { id: W, activeGroupId: "a" },
        { id: W2, activeGroupId: "c" },
        { id: 3, activeGroupId: undefined },
      ],
      [
        tab(1, W, "a"),
        tab(2, W, "b", { hidden: true, lastAccessed: 1 }),
        tab(10, W2, "c"),
        tab(12, W2, "b", { hidden: true, index: 2, lastAccessed: 90 }),
        tab(11, W2, "b", { hidden: true, index: 1 }),
        tab(13, W2, "b", { index: 3 }), // skipped by an earlier hide (D8): stays
        tab(20, 3, "b", { hidden: true, index: 0 }),
      ],
    );
    expect(planSwitch(state, W, "b")).toMatchObject({
      moveTabIds: [11, 12, 20],
      showTabIds: [2, 11, 12, 20],
      activateTabId: 12,
      hideTabIds: [1],
    });
  });

  it("only focuses the window where the target group is active", () => {
    const state = stateOf(
      ["a", "b"],
      [
        { id: W, activeGroupId: "a" },
        { id: W2, activeGroupId: "b" },
      ],
      [tab(1, W, "a"), tab(2, W2, "b")],
    );
    expect(planSwitch(state, W, "b")).toEqual({ kind: "focus", windowId: W2 });
  });

  it("re-hides tabs an earlier hide skipped and keeps every membership (D8)", () => {
    const state = stateOf(
      ["a", "b", "c"],
      [{ id: W, activeGroupId: "b" }],
      [
        tab(1, W, "a"), // sharing tab of group a, still visible
        tab(2, W, "b"),
        tab(3, W, "c", { hidden: true }),
      ],
    );
    const plan = planSwitch(state, W, "c");
    expect(plan).toMatchObject({ showTabIds: [3], activateTabId: 3, hideTabIds: [1, 2] });
  });

  it("ungroups natively grouped outgoing tabs only (D13)", () => {
    const state = stateOf(
      ["a", "b"],
      [{ id: W, activeGroupId: "a" }],
      [
        tab(1, W, "a", { nativeGrouped: true }),
        tab(2, W, "a"),
        tab(3, W, "b", { hidden: true, nativeGrouped: true }),
      ],
    );
    expect(planSwitch(state, W, "b")).toMatchObject({ ungroupTabIds: [1], hideTabIds: [1, 2] });
  });

  it("leaves tabs without a valid membership visible", () => {
    const state = stateOf(
      ["a", "b"],
      [{ id: W, activeGroupId: "a" }],
      [tab(1, W, "a"), tab(2, W, undefined), tab(3, W, "gone"), tab(4, W, 7)],
    );
    expect(planSwitch(state, W, "b")).toMatchObject({ hideTabIds: [1] });
  });

  it("switches a window without a valid active group", () => {
    const state = stateOf(
      ["a", "b"],
      [{ id: W, activeGroupId: "gone" }],
      [tab(1, W, "a"), tab(2, W, "b", { hidden: true })],
    );
    expect(planSwitch(state, W, "b")).toMatchObject({ showTabIds: [2], hideTabIds: [1] });
  });

  it("plans nothing for the active group, an unknown group, or an unknown window", () => {
    const state = stateOf(["a", "b"], [{ id: W, activeGroupId: "a" }], [tab(1, W, "a")]);
    expect(planSwitch(state, W, "a")).toEqual({ kind: "none" });
    expect(planSwitch(state, W, "x")).toEqual({ kind: "none" });
    expect(planSwitch(state, 99, "b")).toEqual({ kind: "none" });
  });
});
