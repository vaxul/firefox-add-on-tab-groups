// Runs the real background entry against the fakes. Each simulated start
// re-imports the entry after `vi.resetModules()`, so its top-level D10 check
// runs again, as on a fresh event page.
import { vi } from "vitest";
import { TAB_GROUP_KEY, WINDOW_ACTIVE_GROUP_KEY } from "../../src/core/layout";
import { LOCK_NAME } from "../../src/background/operation";
import type { Request, Response } from "../../src/shared/messages";
import type { FakeBrowser } from "../fakes/browser";

/** Waits until every queued operation and every (late) event is handled. */
export async function settle(fake: FakeBrowser): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    await fake.locks.request(LOCK_NAME, async () => undefined);
    await fake.flush();
  }
}

/** Loads the background entry as a fresh event page and lets it settle. */
export async function startBackground(fake: FakeBrowser): Promise<void> {
  vi.resetModules();
  await import("../../src/background/index");
  await settle(fake);
}

export async function send(fake: FakeBrowser, request: Request): Promise<Response> {
  const response = (await fake.browser.runtime.sendMessage(request)) as Response;
  await settle(fake);
  return response;
}

function value(values: Map<string, string>, key: string): unknown {
  const raw = values.get(key);
  return raw === undefined ? undefined : JSON.parse(raw);
}

/**
 * Id-independent view of the world: per window (in creation order) its stored
 * active group and its tabs in strip order with membership and hidden state.
 */
export function describeWorld(fake: FakeBrowser) {
  const windows = [...fake.world.windows.values()].sort((a, b) => a.id - b.id);
  return windows.map((win) => ({
    activeGroup: value(win.values, WINDOW_ACTIVE_GROUP_KEY),
    tabs: win.tabIds.map((id) => {
      const tab = fake.world.getTab(id);
      return {
        url: tab.url,
        hidden: tab.hidden,
        pinned: tab.pinned,
        group: value(tab.values, TAB_GROUP_KEY),
      };
    }),
  }));
}

/** Window invariant (D4): every visible non-pinned tab is in the active group. */
export function invariantHolds(fake: FakeBrowser): boolean {
  return describeWorld(fake).every((win) =>
    win.tabs.every((tab) => tab.pinned || tab.hidden || tab.group === win.activeGroup),
  );
}

export async function groupIds(fake: FakeBrowser): Promise<string[]> {
  const stored = await fake.browser.storage.local.get("groups");
  return (stored["groups"] as { id: string }[]).map((group) => group.id);
}
