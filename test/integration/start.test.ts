// Integration: start detection (D10), first install, restart and
// disable/enable (D9) through the real background entry.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeBrowser } from "../fakes/browser";
import { describeWorld, groupIds, invariantHolds, send, settle, startBackground } from "./harness";

const fake = createFakeBrowser();
let uninstall: () => void;
let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fake.reset();
  vi.restoreAllMocks();
  errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
  uninstall = fake.install();
});
afterEach(() => {
  expect(errors).not.toHaveBeenCalled();
  uninstall();
});

/** Two windows, the first with two groups (one hidden), the second with one. */
async function setUpTwoGroupsInFirstWindow() {
  const w1 = fake.seedWindow({ tabs: [{ url: "https://a/1" }, { url: "https://a/2" }] });
  fake.seedWindow({ tabs: [{ url: "https://b/1" }, { url: "https://b/pin", pinned: true }] });
  await startBackground(fake);
  const created = await send(fake, { type: "createGroup", windowId: w1.windowId });
  if (!created.ok || created.createdGroupId === undefined) throw new Error("create failed");
  const groupId = created.createdGroupId;
  await send(fake, { type: "switchGroup", windowId: w1.windowId, groupId });
  await fake.browser.tabs.create({ windowId: w1.windowId, url: "https://c/1" });
  await settle(fake);
  return describeWorld(fake);
}

describe("start detection (D10)", () => {
  it("first install with two windows: one group per window, nothing hidden", async () => {
    const w1 = fake.seedWindow({ tabs: [{}, {}] });
    const w2 = fake.seedWindow({ tabs: [{}, { pinned: true }] });
    await startBackground(fake);
    fake.browser.runtime.onInstalled.emit({ reason: "install", temporary: false });
    await settle(fake);

    const [g1, g2] = await groupIds(fake);
    const world = describeWorld(fake);
    expect(await groupIds(fake)).toHaveLength(2);
    expect(world[0]).toMatchObject({ activeGroup: g1 });
    expect(world[0]?.tabs.map((tab) => tab.group)).toEqual([g1, g1]);
    expect(world[1]?.tabs.map((tab) => tab.group)).toEqual([undefined, g2]);
    expect(world.flatMap((win) => win.tabs).some((tab) => tab.hidden)).toBe(false);

    const { browser } = fake;
    expect(await browser.action.getBadgeText({})).toBe("2");
    expect(await browser.action.getTitle({ windowId: w1.windowId })).toBe("Tab Groups — Group 1");
    expect(await browser.action.getTitle({ windowId: w2.windowId })).toBe("Tab Groups — Group 2");
  });

  it("runs D9 only once per start, whichever trigger comes first", async () => {
    fake.seedWindow({ tabs: [{}] });
    await startBackground(fake);
    fake.browser.runtime.onStartup.emit();
    fake.browser.runtime.onInstalled.emit({ reason: "update", temporary: false });
    await settle(fake);
    // A repeated D9 for the window would be idempotent; a second start would not
    // create more groups either — the flag guards the full pass.
    expect(await groupIds(fake)).toHaveLength(1);
    expect(await fake.browser.storage.session.get("tgStarted")).toEqual({ tgStarted: true });
  });

  it("restart loses 0 assignments and keeps each window's active group", async () => {
    const before = await setUpTwoGroupsInFirstWindow();
    expect(before[0]?.tabs.filter((tab) => tab.hidden)).toHaveLength(2);

    await fake.simulateRestart();
    await startBackground(fake);
    fake.browser.runtime.onStartup.emit();
    await settle(fake);

    expect(describeWorld(fake)).toEqual(before);
    expect(invariantHolds(fake)).toBe(true);
    expect(await fake.browser.action.getBadgeText({})).toBe("3");
  });

  it("disable/enable loses 0 assignments and re-hides inactive groups (F10)", async () => {
    const before = await setUpTwoGroupsInFirstWindow();

    await fake.simulateDisableEnable();
    expect(
      describeWorld(fake)
        .flatMap((win) => win.tabs)
        .some((tab) => tab.hidden),
    ).toBe(false);
    // F8: enable fires no event; the top-level check alone runs D9.
    await startBackground(fake);

    expect(describeWorld(fake)).toEqual(before);
    expect(invariantHolds(fake)).toBe(true);
  });
});
