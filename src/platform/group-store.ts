// Adapter for the persisted group list in `storage.local` (spec-group-core D1)
// and the per-start flag in `storage.session` (D10).
import { STARTED_KEY, parseLayout, type GroupLayout } from "../core/layout";

// The layout's fields are stored as top-level `storage.local` keys.
const LAYOUT_KEYS = ["schemaVersion", "groups"];

/**
 * Reads and validates the group list. Returns `undefined` when the stored
 * schema is newer than this build, so the caller must not overwrite it.
 */
export async function loadLayout(): Promise<GroupLayout | undefined> {
  return parseLayout(await browser.storage.local.get(LAYOUT_KEYS));
}

export async function saveLayout(layout: GroupLayout): Promise<void> {
  await browser.storage.local.set({
    schemaVersion: layout.schemaVersion,
    groups: layout.groups.map(({ id, title }) => ({ id, title })),
  });
}

/**
 * Start detection (D10): returns `true` exactly once per browser start,
 * reload, or enable, and sets the flag. `storage.session` is cleared on each of
 * those, so the flag is not module state. Call it inside the operation lock.
 */
export async function claimStart(): Promise<boolean> {
  const stored = await browser.storage.session.get(STARTED_KEY);
  if (stored[STARTED_KEY] === true) return false;
  await browser.storage.session.set({ [STARTED_KEY]: true });
  return true;
}
