// Operation serialisation and recovery (spec-group-core D5, D9). The queue
// lives in the browser's Web Locks, not in a module variable (constitution).
import type { GroupDeps } from "../core/groups";
import type { GroupLayout } from "../core/layout";
import { planReconcile } from "../core/reconcile";
import { loadLayout } from "../platform/group-store";
import { normalWindowIds, refreshIndicators } from "../platform/indicators";
import { applyReconcile } from "../platform/reconcile-executor";
import { readSnapshot } from "../platform/tab-meta";

export const LOCK_NAME = "tab-groups-op";

/** Runs `operation` exclusively; injected so tests can use a fake (D5). */
export type LockFn = <T>(operation: () => Promise<T>) => Promise<T>;

/** Immutable per-page wiring passed to every handler; holds no state. */
export interface Context {
  readonly lock: LockFn;
  readonly deps: GroupDeps;
}

/** Windows a failed operation may have left inconsistent. */
export type Affected = readonly number[] | "all";

export const webLock: LockFn = (operation) => navigator.locks.request(LOCK_NAME, operation);

/** Reads the layout; throws if the stored schema is newer than this build. */
export async function requireLayout(): Promise<GroupLayout> {
  const layout = await loadLayout();
  if (layout === undefined) throw new Error("Stored group list has a newer schema version");
  return layout;
}

async function reconcileWindow(deps: GroupDeps, windowId: number): Promise<void> {
  const layout = await requireLayout();
  const plan = planReconcile(await readSnapshot(layout), windowId, deps);
  if (plan !== undefined) await applyReconcile(plan);
}

/**
 * D9 for the given windows, one at a time: each window's plan is applied and
 * the layout and snapshot are re-read before the next window is planned, so
 * new groups get distinct default titles. Refreshes badge and tooltips (D22).
 * Call it inside the lock.
 */
export async function reconcileWindows(deps: GroupDeps, affected: Affected): Promise<void> {
  const windowIds = affected === "all" ? await normalWindowIds() : affected;
  for (const windowId of windowIds) await reconcileWindow(deps, windowId);
  await refreshIndicators(await requireLayout());
}

/**
 * Runs one state-changing operation inside the lock (D5). A failure is logged,
 * releases the lock, and is followed by a D9 reconciliation of the affected
 * windows in a new lock request, so a half-applied change is repaired; the
 * original error is rethrown to the caller.
 */
export async function runOperation<T>(
  ctx: Context,
  affected: Affected,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await ctx.lock(operation);
  } catch (error) {
    console.error("Tab Groups: operation failed, reconciling", error);
    try {
      await ctx.lock(() => reconcileWindows(ctx.deps, affected));
    } catch (repairError) {
      console.error("Tab Groups: reconciliation failed", repairError);
    }
    throw error;
  }
}

/** Like `runOperation` for event listeners: errors are logged, never thrown. */
export async function runEventOperation(
  ctx: Context,
  affected: Affected,
  operation: () => Promise<void>,
): Promise<void> {
  try {
    await runOperation(ctx, affected, operation);
  } catch {
    // Already logged and reconciled by `runOperation`.
  }
}
