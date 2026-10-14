import { describe, expect, it } from "vitest";
import { formatTitle, stateOf, tab } from "../../test/core/planner-fixtures";
import { planClose } from "./close";

const W = 1;
const W2 = 2;

function deps(ids: string[] = ["new"]) {
  return { randomUUID: () => ids.shift() ?? "exhausted", formatTitle };
}

describe("planClose", () => {
  it("switches the window of an active group to the next free group first", () => {
    const state = stateOf(
      ["a", "b", "c", "d"],
      [
        { id: W, activeGroupId: "b" },
        { id: W2, activeGroupId: "c" },
      ],
      [
        tab(1, W, "b", { nativeGrouped: true }),
        tab(2, W, "b"),
        tab(3, W, "d", { hidden: true }),
        tab(4, W2, "c"),
      ],
    );
    const plan = planClose(state, "b", deps());
    expect(plan).toEqual({
      kind: "close",
      groupId: "b",
      createdGroup: undefined,
      switch: {
        windowId: W,
        groupId: "d",
        moveTabIds: [],
        showTabIds: [3],
        activateTabId: 3,
        ungroupTabIds: [],
        hideTabIds: [],
      },
      ungroupTabIds: [1],
      removeTabIds: [1, 2],
      layout: {
        schemaVersion: 1,
        groups: [
          { id: "a", title: "Group 1" },
          { id: "c", title: "Group 3" },
          { id: "d", title: "Group 4" },
        ],
      },
    });
  });

  it("switches to the previous free group when the active group is the last row", () => {
    const state = stateOf(
      ["a", "b", "c"],
      [
        { id: W, activeGroupId: "c" },
        { id: W2, activeGroupId: "b" },
      ],
      [tab(1, W, "c"), tab(2, W2, "b"), tab(3, W2, "a", { hidden: true })],
    );
    const plan = planClose(state, "c", deps());
    expect(plan).toMatchObject({
      switch: { windowId: W, groupId: "a", moveTabIds: [3], showTabIds: [3], activateTabId: 3 },
      removeTabIds: [1],
    });
  });

  it("falls back to an earlier free group when no later one is free", () => {
    const state = stateOf(
      ["a", "b", "c"],
      [
        { id: W, activeGroupId: "b" },
        { id: W2, activeGroupId: "c" },
      ],
      [tab(1, W, "b"), tab(2, W2, "c")],
    );
    expect(planClose(state, "b", deps())).toMatchObject({
      createdGroup: undefined,
      switch: { groupId: "a", activateTabId: undefined },
    });
  });

  it("switches to a new default group when no other group is free", () => {
    const state = stateOf(
      ["a", "b"],
      [
        { id: W, activeGroupId: "a" },
        { id: W2, activeGroupId: "b" },
      ],
      [tab(1, W, "a"), tab(2, W2, "b")],
    );
    const plan = planClose(state, "a", deps(["new"]));
    expect(plan).toMatchObject({
      createdGroup: { id: "new", title: "Group 1" },
      switch: { windowId: W, groupId: "new", activateTabId: undefined, hideTabIds: [] },
      removeTabIds: [1],
    });
    expect(plan.kind === "close" && plan.layout.groups.map((group) => group.id)).toEqual([
      "b",
      "new",
    ]);
  });

  it("leaves one new default group with one new tab when the last group closes", () => {
    const state = stateOf(
      ["a"],
      [{ id: W, activeGroupId: "a" }],
      [tab(1, W, "a"), tab(2, W, "a", { hidden: true }), tab(3, W, undefined, { pinned: true })],
    );
    expect(planClose(state, "a", deps(["new"]))).toEqual({
      kind: "close",
      groupId: "a",
      createdGroup: { id: "new", title: "Group 1" },
      switch: {
        windowId: W,
        groupId: "new",
        moveTabIds: [],
        showTabIds: [],
        activateTabId: undefined,
        ungroupTabIds: [],
        hideTabIds: [],
      },
      ungroupTabIds: [],
      removeTabIds: [1, 2],
      layout: { schemaVersion: 1, groups: [{ id: "new", title: "Group 1" }] },
    });
  });

  it("closes an inactive group without a switch, removing its tabs in all windows", () => {
    const state = stateOf(
      ["a", "b"],
      [
        { id: W, activeGroupId: "a" },
        { id: W2, activeGroupId: undefined },
      ],
      [
        tab(1, W, "a"),
        tab(2, W, "b", { hidden: true }),
        tab(3, W2, "b", { hidden: true, nativeGrouped: true }),
        tab(4, W2, "b", { pinned: true }),
      ],
    );
    expect(planClose(state, "b", deps())).toMatchObject({
      createdGroup: undefined,
      switch: undefined,
      ungroupTabIds: [3],
      removeTabIds: [2, 3],
      layout: { groups: [{ id: "a", title: "Group 1" }] },
    });
  });

  it("closes an empty group by deleting it only", () => {
    const state = stateOf(["a", "b"], [{ id: W, activeGroupId: "a" }], [tab(1, W, "a")]);
    expect(planClose(state, "b", deps())).toMatchObject({
      switch: undefined,
      ungroupTabIds: [],
      removeTabIds: [],
      layout: { groups: [{ id: "a" }] },
    });
  });

  it("plans nothing for an unknown group", () => {
    const state = stateOf(["a"], [{ id: W, activeGroupId: "a" }], [tab(1, W, "a")]);
    expect(planClose(state, "x", deps())).toEqual({ kind: "none" });
  });
});
