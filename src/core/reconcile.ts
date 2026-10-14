import { createGroup, type GroupDeps } from "./groups";
import { validGroupId, type Group, type GroupLayout } from "./layout";
import {
  activeOwners,
  isNormalWindow,
  resolvedActiveGroup,
  type Snapshot,
  type TabState,
} from "./snapshot";

export interface TabAssignment {
  readonly tabId: number;
  readonly groupId: string;
}

export interface TabMove {
  /** Window whose active group the tabs belong to (D9 d). */
  readonly windowId: number;
  readonly tabIds: readonly number[];
}

/**
 * Reconciliation of one window (spec-group-core D9). The executor applies it in
 * this order: persist `layout` if `createdGroup` is set; `move` (re-write the
 * moved tabs' `sessions` values, F3, and show them in the target window);
 * `show`; `activate` or, if `createTab`, create one tab without `url` that
 * joins `activeGroupId`; store `activeGroupId` as the window's
 * `tgActiveGroupId` and write `assign`; `ungroup`; `hide`.
 * Plans for several windows (start, D10) are made one at a time: apply a
 * plan, re-read the snapshot, then plan the next window, so new groups get
 * distinct default titles and no persisted layout is overwritten.
 */
export interface ReconcilePlan {
  readonly windowId: number;
  readonly layout: GroupLayout;
  readonly createdGroup: Group | undefined;
  readonly activeGroupId: string;
  readonly assign: readonly TabAssignment[];
  readonly move: readonly TabMove[];
  readonly show: readonly number[];
  readonly activate: number | undefined;
  readonly createTab: boolean;
  readonly ungroup: readonly number[];
  readonly hide: readonly number[];
}

type Fate =
  | { readonly kind: "join" }
  | { readonly kind: "stay" }
  | { readonly kind: "move"; readonly windowId: number }
  | { readonly kind: "inactive" };

interface Context {
  readonly snapshot: Snapshot;
  readonly owners: ReadonlyMap<string, number>;
  readonly windowId: number;
  readonly activeGroupId: string;
  /** The window has no valid stored active group and got a new one. */
  readonly adopting: boolean;
}

function fateOf(tab: TabState, ctx: Context): Fate {
  if (ctx.adopting && !tab.hidden) return { kind: "join" };
  const membership = validGroupId(ctx.snapshot.layout, tab.groupId);
  if (membership === undefined) return { kind: "join" };
  if (membership === ctx.activeGroupId) return { kind: "stay" };
  const owner = ctx.owners.get(membership);
  if (owner !== undefined && owner !== ctx.windowId) return { kind: "move", windowId: owner };
  return { kind: "inactive" };
}

interface Collected {
  readonly assign: TabAssignment[];
  readonly moves: Map<number, number[]>;
  readonly show: number[];
  readonly ungroup: number[];
  readonly hide: number[];
  readonly kept: TabState[];
  readonly leaving: Set<number>;
}

function collect(tabs: readonly TabState[], ctx: Context): Collected {
  const out: Collected = {
    assign: [],
    moves: new Map(),
    show: [],
    ungroup: [],
    hide: [],
    kept: [],
    leaving: new Set(),
  };
  for (const tab of tabs) {
    const fate = fateOf(tab, ctx);
    if (fate.kind === "join") out.assign.push({ tabId: tab.id, groupId: ctx.activeGroupId });
    if (fate.kind === "join" || fate.kind === "stay") {
      out.kept.push(tab);
      if (tab.hidden) out.show.push(tab.id);
    } else if (fate.kind === "move") {
      out.moves.set(fate.windowId, [...(out.moves.get(fate.windowId) ?? []), tab.id]);
      out.leaving.add(tab.id);
    } else if (!tab.hidden) {
      if (tab.nativeGrouped) out.ungroup.push(tab.id);
      out.hide.push(tab.id);
      out.leaving.add(tab.id);
    }
  }
  return out;
}

/**
 * If the window's active tab is hidden or moved away, activate the most
 * recently accessed tab of the active group, or create one if it has none
 * (F1: `tabs.hide` skips the active tab; F5: the window must keep a tab).
 */
function activation(
  windowTabs: readonly TabState[],
  collected: Collected,
): { activate: number | undefined; createTab: boolean } {
  const activeTab = windowTabs.find((tab) => tab.active);
  if (activeTab === undefined || !collected.leaving.has(activeTab.id)) {
    return { activate: undefined, createTab: false };
  }
  const [latest] = [...collected.kept].sort((a, b) => b.lastAccessed - a.lastAccessed);
  return latest === undefined
    ? { activate: undefined, createTab: true }
    : { activate: latest.id, createTab: false };
}

function resolveGroup(
  snapshot: Snapshot,
  owners: ReadonlyMap<string, number>,
  windowId: number,
  deps: GroupDeps,
): { layout: GroupLayout; createdGroup: Group | undefined; activeGroupId: string } {
  const kept = resolvedActiveGroup(snapshot, owners, windowId);
  if (kept !== undefined) {
    return { layout: snapshot.layout, createdGroup: undefined, activeGroupId: kept };
  }
  const { layout, group } = createGroup(snapshot.layout, deps);
  return { layout, createdGroup: group, activeGroupId: group.id };
}

/**
 * Plans the reconciliation of one normal window (D9); returns `undefined` for
 * an unknown or non-normal window. A window without a valid, uncontested stored
 * active group gets a new default group that adopts its visible non-pinned
 * tabs. Pinned tabs are ignored (D7).
 */
export function planReconcile(
  snapshot: Snapshot,
  windowId: number,
  deps: GroupDeps,
): ReconcilePlan | undefined {
  if (!isNormalWindow(snapshot, windowId)) return undefined;
  const owners = activeOwners(snapshot);
  const { layout, createdGroup, activeGroupId } = resolveGroup(snapshot, owners, windowId, deps);
  const ctx: Context = {
    snapshot,
    owners,
    windowId,
    activeGroupId,
    adopting: createdGroup !== undefined,
  };
  const windowTabs = snapshot.tabs.filter((tab) => tab.windowId === windowId);
  const collected = collect(
    windowTabs.filter((tab) => !tab.pinned),
    ctx,
  );
  return {
    windowId,
    layout,
    createdGroup,
    activeGroupId,
    assign: collected.assign,
    move: [...collected.moves].map(([target, tabIds]) => ({ windowId: target, tabIds })),
    show: collected.show,
    ...activation(windowTabs, collected),
    ungroup: collected.ungroup,
    hide: collected.hide,
  };
}
