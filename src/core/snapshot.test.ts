import { describe, expect, it } from "vitest";
import type { GroupLayout } from "./layout";
import { activeOwners, resolvedActiveGroup, type Snapshot, type WindowState } from "./snapshot";

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

function snap(...windows: WindowState[]): Snapshot {
  return { layout, windows, tabs: [] };
}

describe("activeOwners", () => {
  it("maps each valid stored active group to its window", () => {
    expect(activeOwners(snap(win(1, "a"), win(2, "b")))).toEqual(
      new Map([
        ["a", 1],
        ["b", 2],
      ]),
    );
  });

  it("ignores unknown, missing, and non-string ids", () => {
    expect(activeOwners(snap(win(1, "gone"), win(2, undefined), win(3, 7))).size).toBe(0);
  });

  it("ignores non-normal windows", () => {
    expect(activeOwners(snap(win(1, "a", { type: "popup" }))).size).toBe(0);
  });

  it("gives a duplicate to the focused window", () => {
    const owners = activeOwners(snap(win(1, "a"), win(5, "a", { focused: true }), win(3, "a")));
    expect(owners.get("a")).toBe(5);
  });

  it("gives a duplicate to the lowest window id when none is focused", () => {
    expect(activeOwners(snap(win(4, "a"), win(2, "a"), win(3, "a"))).get("a")).toBe(2);
  });
});

describe("resolvedActiveGroup", () => {
  it("returns the group only for the window that keeps it", () => {
    const snapshot = snap(win(1, "a"), win(2, "a"));
    const owners = activeOwners(snapshot);
    expect(resolvedActiveGroup(snapshot, owners, 1)).toBe("a");
    expect(resolvedActiveGroup(snapshot, owners, 2)).toBeUndefined();
  });

  it("returns undefined for unknown and non-normal windows", () => {
    const snapshot = snap(win(1, "a", { type: "popup" }));
    const owners = activeOwners(snapshot);
    expect(resolvedActiveGroup(snapshot, owners, 1)).toBeUndefined();
    expect(resolvedActiveGroup(snapshot, owners, 9)).toBeUndefined();
  });
});
