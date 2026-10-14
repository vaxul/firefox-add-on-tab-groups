// Applies core plans through the browser APIs (spec-group-core D6, D14, F1,
// F3, F6). Plans carry tab ids only, never a native `groupId` to persist.
import type { ClosePlan } from "../core/close";
import type { SwitchPlan, SwitchSteps } from "../core/switch";
import { saveLayout } from "./group-store";
import { setTabGroup, setTabsGroup, setWindowActiveGroup } from "./tab-meta";

export interface ApplyResult {
  /**
   * Ids `tabs.hide` did hide. The rest of the planned hide ids was skipped
   * (F1, D8) or already hidden.
   */
  readonly hiddenTabIds: readonly number[];
  /** Tab created for an empty target group (F6). */
  readonly createdTabId?: number;
}

const NOTHING: ApplyResult = { hiddenTabIds: [] };

/**
 * Moves tabs as one block to the end of a window and re-writes their
 * membership: a cross-window move of a discarded tab drops its `sessions`
 * values (F3). One `tabs.move` call; no call for an empty list.
 */
export async function moveTabs(
  tabIds: readonly number[],
  windowId: number,
  groupId: string,
): Promise<void> {
  if (tabIds.length === 0) return;
  await browser.tabs.move([...tabIds], { windowId, index: -1 });
  await setTabsGroup(tabIds, groupId);
}

async function activateOrCreate(steps: SwitchSteps): Promise<number | undefined> {
  if (steps.activateTabId !== undefined) {
    await browser.tabs.update(steps.activateTabId, { active: true });
    return undefined;
  }
  return createTabInGroup(steps.windowId, steps.groupId);
}

/** Creates one active tab in the window with the membership (empty group, F6). */
export async function createTabInGroup(windowId: number, groupId: string): Promise<number> {
  // F6: no `url`, so Firefox opens about:newtab.
  const tab = await browser.tabs.create({ windowId, active: true });
  const tabId = tab.id as number;
  await setTabGroup(tabId, groupId);
  return tabId;
}

/**
 * Applies switch steps in D6 order with one `tabs.move`, `tabs.show`, and
 * `tabs.hide` call each (id arrays; empty steps make no call). The tooltip
 * (D6 step 8) is the background's job.
 */
export async function applySwitchSteps(steps: SwitchSteps): Promise<ApplyResult> {
  await moveTabs(steps.moveTabIds, steps.windowId, steps.groupId);
  if (steps.showTabIds.length > 0) await browser.tabs.show([...steps.showTabIds]);
  const createdTabId = await activateOrCreate(steps);
  await setWindowActiveGroup(steps.windowId, steps.groupId);
  // Constitution: `tabs.ungroup` before `tabs.hide`.
  if (steps.ungroupTabIds.length > 0) await browser.tabs.ungroup([...steps.ungroupTabIds]);
  const hiddenTabIds =
    steps.hideTabIds.length > 0 ? await browser.tabs.hide([...steps.hideTabIds]) : [];
  return createdTabId === undefined ? { hiddenTabIds } : { hiddenTabIds, createdTabId };
}

/** Applies a switch plan: nothing, focus the window showing the group, or switch. */
export async function applySwitch(plan: SwitchPlan): Promise<ApplyResult> {
  if (plan.kind === "none") return NOTHING;
  if (plan.kind === "focus") {
    await browser.windows.update(plan.windowId, { focused: true });
    return NOTHING;
  }
  return applySwitchSteps(plan);
}

/**
 * Removes tabs with one `tabs.remove`; natively grouped ones are ungrouped
 * first so Firefox keeps no saved group (constitution).
 */
export async function removeTabs(
  tabIds: readonly number[],
  ungroupTabIds: readonly number[],
): Promise<void> {
  if (ungroupTabIds.length > 0) await browser.tabs.ungroup([...ungroupTabIds]);
  if (tabIds.length > 0) await browser.tabs.remove([...tabIds]);
}

/**
 * Applies a close plan (D14). A created default group is persisted before the
 * switch writes it as the window's active group, so a failure in between never
 * leaves a window pointing at an unknown group.
 */
export async function applyClose(
  plan: ClosePlan | { readonly kind: "none" },
): Promise<ApplyResult> {
  if (plan.kind === "none") return NOTHING;
  if (plan.createdGroup !== undefined) await saveLayout(plan.layout);
  const result = plan.switch === undefined ? NOTHING : await applySwitchSteps(plan.switch);
  await removeTabs(plan.removeTabIds, plan.ungroupTabIds);
  await saveLayout(plan.layout);
  return result;
}
