// Popup entry (spec-group-core D20, D21, D23): reads its window once,
// localises the static texts and starts the group list.
import { translate } from "../shared/i18n";
import type { Request, Response } from "../shared/messages";
import { createPopup } from "./controller";

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (node === null) throw new Error(`Missing #${id}`);
  return node as T;
}

async function main(): Promise<void> {
  document.documentElement.lang = browser.i18n.getUILanguage();
  document.title = translate("popupTitle");
  byId("popup-title").textContent = translate("popupTitle");
  byId("new-group-label").textContent = translate("newGroup");
  const current = await browser.windows.getCurrent();
  const popup = createPopup({
    list: byId("groups"),
    newGroupButton: byId<HTMLButtonElement>("new-group"),
    windowId: current.id as number,
    send: (request: Request) => browser.runtime.sendMessage(request) as Promise<Response>,
    close: () => window.close(),
    t: translate,
  });
  await popup.start();
}

main().catch((error: unknown) => console.error("Tab Groups:", error));
