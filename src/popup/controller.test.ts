// @vitest-environment happy-dom
// Popup against the real background and the browser fakes (spec-group-core
// D14–D16, D20, D21, D25).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeBrowser } from "../../test/fakes/browser";
import { describeWorld, groupIds, settle, startBackground } from "../../test/integration/harness";
import type { Translate } from "../shared/i18n";
import type { Request, Response } from "../shared/messages";
import { createPopup, type Popup } from "./controller";

const fake = createFakeBrowser();
const { browser } = fake;
const t: Translate = (key, ...subs) => browser.i18n.getMessage(key, subs);
// Only the body: the head's stylesheet and script are not loaded in tests.
const page = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "popup.html"), "utf8");
const html = page.slice(page.indexOf("<body>"), page.indexOf("</body>") + "</body>".length);
let uninstall: () => void;
let sent: Request[];
let closed: number;

beforeEach(() => {
  fake.reset();
  vi.restoreAllMocks();
  uninstall = fake.install();
  sent = [];
  closed = 0;
  const parsed = new DOMParser().parseFromString(html, "text/html");
  document.body.replaceChildren(...parsed.body.childNodes);
});
afterEach(() => uninstall());

function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

/** Two windows with two and three tabs; the popup belongs to the first. */
async function openPopup(send?: (request: Request) => Promise<Response>): Promise<Popup> {
  const w1 = fake.seedWindow({ tabs: [{}, {}] });
  fake.seedWindow({ tabs: [{}, {}, {}] });
  await startBackground(fake);
  const popup = createPopup({
    list: byId("groups"),
    newGroupButton: byId<HTMLButtonElement>("new-group"),
    windowId: w1.windowId,
    send: async (request) => {
      sent.push(request);
      const response = send
        ? await send(request)
        : ((await browser.runtime.sendMessage(request)) as Response);
      await settle(fake);
      return response;
    },
    close: () => (closed += 1),
    t,
  });
  await popup.start();
  return popup;
}

const rows = () => [...byId("groups").children] as HTMLElement[];
const texts = () => rows().map((row) => row.textContent);
const query = <T extends Element>(root: ParentNode, selector: string) =>
  root.querySelector(selector) as T;

function key(target: Element, name: string): void {
  target.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
}

async function storedTitles(): Promise<string[]> {
  const stored = await browser.storage.local.get("groups");
  return (stored["groups"] as { title: string }[]).map((group) => group.title);
}

describe("group list (D20, D21)", () => {
  it("lists groups in order with title, count and markers", async () => {
    await openPopup();
    expect(texts()).toEqual(["Group 12" + "2 tabs", "Group 23" + "3 tabs, open in another window"]);
    const [first, second] = rows() as [HTMLElement, HTMLElement];
    expect(first.classList.contains("row--active")).toBe(true);
    expect(query(first, ".row__switch").getAttribute("aria-current")).toBe("true");
    expect(query(second, ".row__switch").hasAttribute("aria-current")).toBe(false);
    expect(query(second, ".row__meta use").getAttribute("href")).toBe("#i-window");
    expect(query(first, ".row__meta").getAttribute("aria-hidden")).toBe("true");
  });

  it("labels the row actions with the group title", async () => {
    await openPopup();
    const labels = [...rows()[0]!.querySelectorAll(".icon-button")].map((b) =>
      b.getAttribute("aria-label"),
    );
    expect(labels).toEqual(["Rename group Group 1", "Close group Group 1"]);
  });
});

describe("switch (D20)", () => {
  it("switches the window and closes the popup", async () => {
    const popup = await openPopup();
    const [, g2] = await groupIds(fake);
    query<HTMLButtonElement>(rows()[1]!, ".row__switch").click();
    await popup.idle();
    expect(sent.at(-1)).toMatchObject({ type: "switchGroup", groupId: g2 });
    expect(closed).toBe(1);
  });
});

describe("create and rename (D15, D16)", () => {
  it("appends a group with an inline rename field and does not switch", async () => {
    const popup = await openPopup();
    byId("new-group").click();
    await popup.idle();
    const input = query<HTMLInputElement>(rows()[2]!, "input");
    expect(input.value).toBe("Group 3");
    expect(input.getAttribute("aria-label")).toBe("Group name");
    expect(document.activeElement).toBe(input);
    expect(rows().some((row) => row.querySelector(".row__actions"))).toBe(false);
    const [g1] = await groupIds(fake);
    expect(describeWorld(fake)[0]?.activeGroup).toBe(g1);
  });

  it("saves a trimmed title on Enter", async () => {
    const popup = await openPopup();
    byId("new-group").click();
    await popup.idle();
    const input = query<HTMLInputElement>(rows()[2]!, "input");
    input.value = "  Work  ";
    key(input, "Enter");
    await popup.idle();
    expect(await storedTitles()).toEqual(["Group 1", "Group 2", "Work"]);
    expect(document.activeElement?.textContent).toContain("Work");
    expect(sent.filter((r) => r.type === "renameGroup")).toHaveLength(1);
  });

  it("saves on blur", async () => {
    const popup = await openPopup();
    query<HTMLButtonElement>(rows()[1]!, ".icon-button").click();
    const input = query<HTMLInputElement>(rows()[1]!, "input");
    expect(document.activeElement).toBe(input);
    input.value = "Research";
    input.blur();
    await popup.idle();
    expect(await storedTitles()).toEqual(["Group 1", "Research"]);
  });

  it("cancels on Escape and keeps an empty title from being saved", async () => {
    const popup = await openPopup();
    query<HTMLButtonElement>(rows()[0]!, ".icon-button").click();
    const input = query<HTMLInputElement>(rows()[0]!, "input");
    input.value = "Changed";
    key(input, "Escape");
    await popup.idle();
    query<HTMLButtonElement>(rows()[0]!, ".icon-button").click();
    const again = query<HTMLInputElement>(rows()[0]!, "input");
    again.value = "   ";
    key(again, "Enter");
    await popup.idle();
    expect(await storedTitles()).toEqual(["Group 1", "Group 2"]);
    expect(sent.some((r) => r.type === "renameGroup")).toBe(false);
    expect(document.activeElement).toBe(query(rows()[0]!, ".row__switch"));
  });
});

describe("close (D14)", () => {
  it("asks inline before closing a group with tabs; Cancel keeps it", async () => {
    const popup = await openPopup();
    query<HTMLButtonElement>(rows()[1]!, ".icon-button + .icon-button").click();
    const box = query<HTMLElement>(rows()[1]!, ".confirm");
    expect(box.getAttribute("role")).toBe("group");
    expect(box.textContent).toContain("Close “Group 2” and its 3 tabs?");
    expect(document.activeElement?.textContent).toBe("Cancel");
    key(box, "Escape");
    expect(rows()[1]!.querySelector(".confirm")).toBeNull();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close group Group 2");
    await popup.idle();
    expect(sent.some((r) => r.type === "closeGroup")).toBe(false);
  });

  it("closes the group after confirmation", async () => {
    const popup = await openPopup();
    const [g1, g2] = await groupIds(fake);
    query<HTMLButtonElement>(rows()[1]!, ".icon-button + .icon-button").click();
    query<HTMLButtonElement>(rows()[1]!, ".button--destructive").click();
    await popup.idle();
    // The other window had no free group left, so it got a new default one.
    const ids = await groupIds(fake);
    expect(ids).toHaveLength(2);
    expect(ids).toContain(g1);
    expect(ids).not.toContain(g2);
    expect(rows()).toHaveLength(2);
    expect(document.activeElement).toBe(query(rows()[1]!, ".row__switch"));
  });

  it("closes an empty group without confirmation", async () => {
    const popup = await openPopup();
    byId("new-group").click();
    await popup.idle();
    key(query(rows()[2]!, "input"), "Escape");
    query<HTMLButtonElement>(rows()[2]!, ".icon-button + .icon-button").click();
    await popup.idle();
    expect(await storedTitles()).toEqual(["Group 1", "Group 2"]);
    expect(sent.at(-1)).toMatchObject({ type: "closeGroup" });
  });
});

describe("errors (D21)", () => {
  it("logs a failed request and re-renders from a fresh state", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const popup = await openPopup(async (request) =>
      request.type === "switchGroup"
        ? { ok: false, error: "boom" }
        : ((await browser.runtime.sendMessage(request)) as Response),
    );
    query<HTMLButtonElement>(rows()[1]!, ".row__switch").click();
    await popup.idle();
    expect(errors).toHaveBeenCalledWith("Tab Groups:", "switchGroup", "boom");
    expect(sent.at(-1)?.type).toBe("getState");
    expect(closed).toBe(0);
    expect(rows()).toHaveLength(2);
  });
});

describe("German locale (D25)", () => {
  it("renders the German strings", async () => {
    browser.i18n.useLocale("de");
    await openPopup();
    expect(texts()[1]).toBe("Gruppe 23" + "3 Tabs, in einem anderen Fenster geöffnet");
    browser.i18n.reset();
  });
});
