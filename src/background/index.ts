// Event page entry. Listeners are registered synchronously at top level so
// Firefox can wake the page for them; no state is kept between events. The
// context below is immutable wiring, not state.
import { browserGroupDeps } from "../platform/indicators";
import { checkStart, onWindowCreated, recheckTab } from "./events";
import { handleMessage } from "./messages";
import { webLock, type Context } from "./operation";

const ctx: Context = Object.freeze({ lock: webLock, deps: browserGroupDeps });

// D10: `onStartup` makes Firefox wake the page at launch; enable after disable
// fires neither event (F8), so the check also runs once at top level.
browser.runtime.onStartup.addListener(() => checkStart(ctx));
browser.runtime.onInstalled.addListener(() => checkStart(ctx));

browser.windows.onCreated.addListener((window) => onWindowCreated(ctx, window));

// D11: new tabs, tabs dragged in from another window, pin/unpin, show/hide.
browser.tabs.onCreated.addListener((tab) =>
  tab.id === undefined || tab.windowId === undefined
    ? undefined
    : recheckTab(ctx, tab.id, tab.windowId),
);
browser.tabs.onAttached.addListener((tabId, info) => recheckTab(ctx, tabId, info.newWindowId));
browser.tabs.onUpdated.addListener(
  (tabId, _changeInfo, tab) =>
    tab.windowId === undefined ? undefined : recheckTab(ctx, tabId, tab.windowId),
  { properties: ["pinned", "hidden"] },
);

browser.runtime.onMessage.addListener((message, sender) => {
  // Only the extension's own pages may change groups.
  if (sender.id !== browser.runtime.id) return undefined;
  return handleMessage(ctx, message);
});

void checkStart(ctx);
