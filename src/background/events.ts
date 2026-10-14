// Start detection (D10) and the window and tab event handlers (D9, D11).
// Every handler re-reads state inside the lock; none keeps state between
// events, so late events of own operations (F4) are harmless re-checks.
import { planTabRecheck } from "../core/recheck";
import { claimStart } from "../platform/group-store";
import { applyRecheck } from "../platform/reconcile-executor";
import { readSnapshot } from "../platform/tab-meta";
import { reconcileWindows, requireLayout, runEventOperation, type Context } from "./operation";

/**
 * D10: on the first call after a browser start, reload, or enable (the
 * `storage.session` flag is absent), reconciles all normal windows (D9).
 */
export function checkStart(ctx: Context): Promise<void> {
  return runEventOperation(ctx, "all", async () => {
    if (await claimStart()) await reconcileWindows(ctx.deps, "all");
  });
}

/** `windows.onCreated`: D9 for the new or restored window (D12). */
export function onWindowCreated(ctx: Context, window: browser.windows.Window): Promise<void> {
  const windowId = window.id;
  if (windowId === undefined) return Promise.resolve();
  return runEventOperation(ctx, [windowId], () => reconcileWindows(ctx.deps, [windowId]));
}

/**
 * D11: re-checks one tab after `tabs.onCreated`, `onAttached`, or `onUpdated`
 * (`pinned`, `hidden`). A window without a valid active group gets D9 instead.
 */
export function recheckTab(ctx: Context, tabId: number, windowId: number): Promise<void> {
  return runEventOperation(ctx, [windowId], async () => {
    const layout = await requireLayout();
    const action = planTabRecheck(await readSnapshot(layout), tabId);
    if (action.kind === "reconcile") {
      await reconcileWindows(ctx.deps, [action.windowId]);
    } else {
      await applyRecheck(tabId, action);
    }
  });
}
