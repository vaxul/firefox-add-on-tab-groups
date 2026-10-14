// Applies the reconciliation plans of `src/core/reconcile.ts` (D9) and the tab
// re-check actions of `src/core/recheck.ts` (D11) through the browser APIs.
import type { RecheckAction } from "../core/recheck";
import type { ReconcilePlan, TabMove } from "../core/reconcile";
import { createTabInGroup, type ApplyResult } from "./executor";
import { saveLayout } from "./group-store";
import { getTabGroup, removeTabGroup, setTabGroup, setWindowActiveGroup } from "./tab-meta";

/**
 * Moves tabs to the end of the window that shows their group (D9 d). Their
 * memberships are read before the move and re-written after it, because a
 * cross-window move of a discarded tab drops its `sessions` values (F3); the
 * tabs are then shown, since a hidden discarded tab stays hidden.
 */
async function applyMove(move: TabMove): Promise<void> {
  if (move.tabIds.length === 0) return;
  const groups = await Promise.all(move.tabIds.map(getTabGroup));
  await browser.tabs.move([...move.tabIds], { windowId: move.windowId, index: -1 });
  await Promise.all(
    move.tabIds.map((tabId, i) => {
      const groupId = groups[i];
      return groupId === undefined ? undefined : setTabGroup(tabId, groupId);
    }),
  );
  await browser.tabs.show([...move.tabIds]);
}

async function activateOrCreate(plan: ReconcilePlan): Promise<number | undefined> {
  if (plan.activate !== undefined) {
    await browser.tabs.update(plan.activate, { active: true });
    return undefined;
  }
  return plan.createTab ? createTabInGroup(plan.windowId, plan.activeGroupId) : undefined;
}

/**
 * Applies the reconciliation of ONE window in the order documented on
 * `ReconcilePlan`. The caller (background, #7) applies one window's plan,
 * re-reads the snapshot, and only then plans the next window, so new groups
 * get distinct default titles and no persisted layout is overwritten.
 */
export async function applyReconcile(plan: ReconcilePlan): Promise<ApplyResult> {
  // Persist a new group before the window points at it.
  if (plan.createdGroup !== undefined) await saveLayout(plan.layout);
  for (const move of plan.move) await applyMove(move);
  if (plan.show.length > 0) await browser.tabs.show([...plan.show]);
  const createdTabId = await activateOrCreate(plan);
  await setWindowActiveGroup(plan.windowId, plan.activeGroupId);
  await Promise.all(plan.assign.map(({ tabId, groupId }) => setTabGroup(tabId, groupId)));
  // Constitution: `tabs.ungroup` before `tabs.hide`.
  if (plan.ungroup.length > 0) await browser.tabs.ungroup([...plan.ungroup]);
  const hiddenTabIds = plan.hide.length > 0 ? await browser.tabs.hide([...plan.hide]) : [];
  return createdTabId === undefined ? { hiddenTabIds } : { hiddenTabIds, createdTabId };
}

/**
 * Applies a D11 re-check of one tab: `assign` writes the membership (and shows
 * the tab if asked), `clear` removes it. `none` does nothing; `reconcile` is
 * not handled here — the caller runs D9 for that window.
 */
export async function applyRecheck(tabId: number, action: RecheckAction): Promise<void> {
  if (action.kind === "assign") {
    await setTabGroup(tabId, action.groupId);
    if (action.show) await browser.tabs.show(tabId);
  } else if (action.kind === "clear") {
    await removeTabGroup(tabId);
  }
}
