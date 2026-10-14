import { validGroupId } from "./layout";
import { activeOwners, isNormalWindow, resolvedActiveGroup, type Snapshot } from "./snapshot";

/**
 * Outcome of re-checking one tab after `tabs.onCreated`, `tabs.onAttached`, or
 * `tabs.onUpdated` (`pinned`, `hidden`) — spec-group-core D11.
 * - `none`: nothing to do.
 * - `assign`: write `groupId` as the tab's `tgGroupId`; if `show`, also show it.
 * - `clear`: remove the pinned tab's `tgGroupId` (D7).
 * - `reconcile`: the tab's window has no valid active group; run D9 for it.
 */
export type RecheckAction =
  | { readonly kind: "none" }
  | { readonly kind: "assign"; readonly groupId: string; readonly show: boolean }
  | { readonly kind: "clear" }
  | { readonly kind: "reconcile"; readonly windowId: number };

const NONE: RecheckAction = { kind: "none" };

/**
 * Re-checks one tab of the snapshot (D11). The tab is reassigned to its
 * window's active group, never switched to. Tabs in non-`normal` windows and
 * unknown tabs are ignored.
 */
export function planTabRecheck(snapshot: Snapshot, tabId: number): RecheckAction {
  const tab = snapshot.tabs.find((candidate) => candidate.id === tabId);
  if (tab === undefined || !isNormalWindow(snapshot, tab.windowId)) return NONE;
  if (tab.pinned) return tab.groupId === undefined ? NONE : { kind: "clear" };
  const activeGroupId = resolvedActiveGroup(snapshot, activeOwners(snapshot), tab.windowId);
  if (activeGroupId === undefined) return { kind: "reconcile", windowId: tab.windowId };
  const membership = validGroupId(snapshot.layout, tab.groupId);
  if (tab.hidden) {
    // A hidden orphan joins and is shown, as in D9 (b) and (c).
    return membership === undefined ? { kind: "assign", groupId: activeGroupId, show: true } : NONE;
  }
  return membership === activeGroupId
    ? NONE
    : { kind: "assign", groupId: activeGroupId, show: false };
}
