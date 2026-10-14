import type { PlannerState, PlannerTab, PlannerWindow } from "../../src/core/planner-state";

// Builders for planner unit tests. Group ids are `a`, `b`, ...; titles
// "Group 1", "Group 2", ... unless given.

export const formatTitle = (n: number): string => `Group ${n}`;

export function tab(
  id: number,
  windowId: number,
  groupId: unknown,
  extra: Partial<PlannerTab> = {},
): PlannerTab {
  return {
    id,
    windowId,
    index: id,
    pinned: false,
    hidden: false,
    lastAccessed: id,
    nativeGrouped: false,
    groupId,
    ...extra,
  };
}

export function stateOf(
  groupIds: readonly string[],
  windows: readonly PlannerWindow[],
  tabs: readonly PlannerTab[],
): PlannerState {
  return {
    layout: {
      schemaVersion: 1,
      groups: groupIds.map((id, i) => ({ id, title: `Group ${i + 1}` })),
    },
    windows,
    tabs,
  };
}
