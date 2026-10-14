// Toolbar badge and per-window tooltip (spec-group-core D17, D22), plus the
// browser-backed dependencies of the core group operations (D2, D3).
import type { GroupDeps } from "../core/groups";
import { validGroupId, type GroupLayout } from "../core/layout";
import { getWindowActiveGroup } from "./tab-meta";

/** Group ids from `crypto.randomUUID()` (D2), default titles from i18n (D3). */
export const browserGroupDeps: GroupDeps = {
  randomUUID: () => crypto.randomUUID(),
  formatTitle: (n) => browser.i18n.getMessage("defaultGroupTitle", String(n)),
};

/** Ids of all open normal windows. */
export async function normalWindowIds(): Promise<number[]> {
  const windows = await browser.windows.getAll({ windowTypes: ["normal"] });
  return windows.map((win) => win.id as number);
}

/** Badge text = number of groups, global; the colour stays the default (D17). */
export async function setBadgeCount(layout: GroupLayout): Promise<void> {
  await browser.action.setBadgeText({ text: String(layout.groups.length) });
}

/** Tooltip of one window: `actionTitle` with its active group's title (D17). */
export async function setWindowTooltip(layout: GroupLayout, windowId: number): Promise<void> {
  const groupId = validGroupId(layout, await getWindowActiveGroup(windowId));
  const group = layout.groups.find((candidate) => candidate.id === groupId);
  // Without a valid active group the window falls back to the default title.
  const title = group === undefined ? null : browser.i18n.getMessage("actionTitle", group.title);
  await browser.action.setTitle({ windowId, title });
}

/** Refreshes the badge and the tooltip of every normal window. */
export async function refreshIndicators(layout: GroupLayout): Promise<void> {
  const windowIds = await normalWindowIds();
  await Promise.all([
    setBadgeCount(layout),
    // A window closed since it was listed rejects; its tooltip is gone anyway.
    ...windowIds.map((windowId) => setWindowTooltip(layout, windowId).catch(() => undefined)),
  ]);
}
