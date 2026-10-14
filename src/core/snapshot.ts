import { validGroupId, type GroupLayout } from "./layout";

// Read-only view of the browser state that the reconciliation planners
// (spec-group-core D9, D11) decide on. The platform layer builds it from
// `windows`, `tabs`, `sessions`, and `storage.local` at the start of each
// operation; core never reads the browser itself.

export interface WindowState {
  readonly id: number;
  /** `windows.WindowType`; only `"normal"` windows take part (D11). */
  readonly type: string;
  readonly focused: boolean;
  /** Raw stored `tgActiveGroupId`, unvalidated. */
  readonly activeGroupId: unknown;
}

export interface TabState {
  readonly id: number;
  readonly windowId: number;
  readonly pinned: boolean;
  readonly hidden: boolean;
  readonly active: boolean;
  readonly lastAccessed: number;
  /** True if the tab is in a native Firefox tab group (D13). */
  readonly nativeGrouped: boolean;
  /** Raw stored `tgGroupId`, unvalidated. */
  readonly groupId: unknown;
}

export interface Snapshot {
  readonly layout: GroupLayout;
  readonly windows: readonly WindowState[];
  readonly tabs: readonly TabState[];
}

function isNormal(window: WindowState): boolean {
  return window.type === "normal";
}

function preferred(a: WindowState, b: WindowState): WindowState {
  if (a.focused !== b.focused) return a.focused ? a : b;
  return a.id < b.id ? a : b;
}

/**
 * Maps each group to the one normal window that keeps it as its active group
 * (D9 a). A window keeps its stored `tgActiveGroupId` if the group exists; when
 * several windows store the same group, the focused one wins, else the one
 * with the lowest id.
 */
export function activeOwners(snapshot: Snapshot): Map<string, number> {
  const winners = new Map<string, WindowState>();
  for (const window of snapshot.windows) {
    if (!isNormal(window)) continue;
    const groupId = validGroupId(snapshot.layout, window.activeGroupId);
    if (groupId === undefined) continue;
    const current = winners.get(groupId);
    winners.set(groupId, current === undefined ? window : preferred(current, window));
  }
  return new Map([...winners].map(([groupId, window]) => [groupId, window.id]));
}

/** The window's valid, uncontested active group, or `undefined` (D9 a). */
export function resolvedActiveGroup(
  snapshot: Snapshot,
  owners: ReadonlyMap<string, number>,
  windowId: number,
): string | undefined {
  if (!isNormalWindow(snapshot, windowId)) return undefined;
  const groupId = validGroupId(snapshot.layout, findWindow(snapshot, windowId)?.activeGroupId);
  return groupId !== undefined && owners.get(groupId) === windowId ? groupId : undefined;
}

export function findWindow(snapshot: Snapshot, windowId: number): WindowState | undefined {
  return snapshot.windows.find((window) => window.id === windowId);
}

export function isNormalWindow(snapshot: Snapshot, windowId: number): boolean {
  const window = findWindow(snapshot, windowId);
  return window !== undefined && isNormal(window);
}
