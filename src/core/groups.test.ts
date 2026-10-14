import { describe, expect, it } from "vitest";
import { createGroup, defaultTitle, deleteGroup, renameGroup } from "./groups";
import type { GroupLayout } from "./layout";

const formatTitle = (n: number): string => `Group ${n}`;

function layoutOf(...titles: string[]): GroupLayout {
  return { schemaVersion: 1, groups: titles.map((title, i) => ({ id: `g${i}`, title })) };
}

function deps(ids: string[]) {
  return { randomUUID: () => ids.shift() ?? "exhausted", formatTitle };
}

describe("defaultTitle", () => {
  it("starts at 1", () => {
    expect(defaultTitle([], formatTitle)).toBe("Group 1");
  });

  it("uses the smallest unused number", () => {
    const { groups } = layoutOf("Group 1", "Group 3", "Work");
    expect(defaultTitle(groups, formatTitle)).toBe("Group 2");
  });

  it("skips past consecutive used numbers", () => {
    const { groups } = layoutOf("Group 2", "Group 1");
    expect(defaultTitle(groups, formatTitle)).toBe("Group 3");
  });
});

describe("createGroup", () => {
  it("appends a group with an injected id and a default title", () => {
    const before = layoutOf("Group 1");
    const { layout, group } = createGroup(before, deps(["uuid-1"]));
    expect(group).toEqual({ id: "uuid-1", title: "Group 2" });
    expect(layout.groups).toEqual([...before.groups, group]);
    expect(before.groups).toHaveLength(1);
  });
});

describe("renameGroup", () => {
  it("stores the trimmed title", () => {
    const layout = renameGroup(layoutOf("A", "B"), "g1", "  Work  ");
    expect(layout.groups.map((g) => g.title)).toEqual(["A", "Work"]);
  });

  it("keeps the old title for an empty or blank title", () => {
    const before = layoutOf("A");
    expect(renameGroup(before, "g0", "")).toBe(before);
    expect(renameGroup(before, "g0", "   ")).toBe(before);
  });

  it("ignores an unknown id", () => {
    const before = layoutOf("A");
    expect(renameGroup(before, "missing", "X")).toBe(before);
  });
});

describe("deleteGroup", () => {
  it("removes the group and keeps the order of the rest", () => {
    const layout = deleteGroup(layoutOf("A", "B", "C"), "g1");
    expect(layout.groups.map((g) => g.title)).toEqual(["A", "C"]);
  });

  it("ignores an unknown id", () => {
    const before = layoutOf("A");
    expect(deleteGroup(before, "missing")).toBe(before);
  });
});
