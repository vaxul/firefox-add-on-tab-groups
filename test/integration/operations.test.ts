// Integration: tab and window events (D11, D12), popup messages (D20, D21),
// batched switch calls (D6), and recovery after a failed switch (D5).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OkResponse, Response } from "../../src/shared/messages";
import { createFakeBrowser } from "../fakes/browser";
import { describeWorld, groupIds, invariantHolds, send, settle, startBackground } from "./harness";

const fake = createFakeBrowser();
const { browser } = fake;
let uninstall: () => void;
let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fake.reset();
  vi.restoreAllMocks();
  errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
  uninstall = fake.install();
});
afterEach(() => uninstall());

function ok(response: Response): OkResponse {
  if (!response.ok) throw new Error(response.error);
  return response;
}

async function twoWindows() {
  const w1 = fake.seedWindow({ tabs: [{ url: "https://a/1" }, { url: "https://a/2" }] });
  const w2 = fake.seedWindow({ tabs: [{ url: "https://b/1" }, { url: "https://b/2" }] });
  await startBackground(fake);
  const [g1, g2] = (await groupIds(fake)) as [string, string];
  return { w1, w2, g1, g2 };
}

describe("tab and window events (D11, D12)", () => {
  it("a new tab joins its window's active group", async () => {
    const { w2, g2 } = await twoWindows();
    await browser.tabs.create({ windowId: w2.windowId, url: "https://b/3" });
    await settle(fake);
    expect(describeWorld(fake)[1]?.tabs.map((tab) => tab.group)).toEqual([g2, g2, g2]);
    expect(errors).not.toHaveBeenCalled();
  });

  it("a tab dragged into another window joins that window's active group", async () => {
    const { w1, w2, g1 } = await twoWindows();
    await browser.tabs.move(w2.tabIds[0] as number, { windowId: w1.windowId, index: -1 });
    await settle(fake);
    const world = describeWorld(fake);
    expect(world[0]?.tabs.map((tab) => [tab.url, tab.group])).toEqual([
      ["https://a/1", g1],
      ["https://a/2", g1],
      ["https://b/1", g1],
    ]);
    expect(invariantHolds(fake)).toBe(true);
    expect(errors).not.toHaveBeenCalled();
  });

  it("a torn-off tab gets a new group and stays in its new window", async () => {
    const { w1, g1 } = await twoWindows();
    const torn = await browser.windows.create({ tabId: w1.tabIds[1] as number });
    await settle(fake);
    const ids = await groupIds(fake);
    expect(ids).toHaveLength(3);
    const world = describeWorld(fake);
    expect(world[2]).toEqual({
      activeGroup: ids[2],
      tabs: [{ url: "https://a/2", hidden: false, pinned: false, group: ids[2] }],
    });
    expect(world[0]?.tabs.map((tab) => tab.group)).toEqual([g1]);
    expect(await browser.action.getBadgeText({})).toBe("3");
    expect(await browser.action.getTitle({ windowId: torn.id })).toBe("Tab Groups — Group 3");
    expect(errors).not.toHaveBeenCalled();
  });

  it("a user-opened window gets a new default group (D12)", async () => {
    await twoWindows();
    await browser.windows.create({ url: "https://d/1" });
    await settle(fake);
    const ids = await groupIds(fake);
    expect(ids).toHaveLength(3);
    expect(describeWorld(fake)[2]?.activeGroup).toBe(ids[2]);
    expect(invariantHolds(fake)).toBe(true);
    expect(errors).not.toHaveBeenCalled();
  });
});

describe("popup messages (D20, D21)", () => {
  it("getState lists groups with counts and markers", async () => {
    const { w1, g1, g2 } = await twoWindows();
    const response = ok(await send(fake, { type: "getState", windowId: w1.windowId }));
    expect(response.state.groups).toEqual([
      { id: g1, title: "Group 1", tabCount: 2, activeHere: true, activeElsewhere: false },
      { id: g2, title: "Group 2", tabCount: 2, activeHere: false, activeElsewhere: true },
    ]);
    expect(errors).not.toHaveBeenCalled();
  });

  it("create, rename, and close update state, badge, and tooltip", async () => {
    const { w1, g1 } = await twoWindows();
    const created = ok(await send(fake, { type: "createGroup", windowId: w1.windowId }));
    const g3 = created.createdGroupId as string;
    expect(created.state.groups.at(-1)).toMatchObject({ id: g3, title: "Group 3", tabCount: 0 });
    expect(await browser.action.getBadgeText({})).toBe("3");

    await send(fake, { type: "renameGroup", windowId: w1.windowId, groupId: g1, title: " Work " });
    expect(await browser.action.getTitle({ windowId: w1.windowId })).toBe("Tab Groups — Work");

    const closed = ok(await send(fake, { type: "closeGroup", windowId: w1.windowId, groupId: g1 }));
    expect(closed.state.groups.map((group) => group.id)).not.toContain(g1);
    expect(closed.state.groups.find((group) => group.id === g3)?.activeHere).toBe(true);
    expect(await browser.action.getBadgeText({})).toBe("2");
    expect(await browser.action.getTitle({ windowId: w1.windowId })).toBe("Tab Groups — Group 3");
    expect(invariantHolds(fake)).toBe(true);
    expect(errors).not.toHaveBeenCalled();
  });

  it("rejects malformed messages", async () => {
    await twoWindows();
    expect(await send(fake, { type: "switchGroup", windowId: 1 } as never)).toEqual({
      ok: false,
      error: "Invalid message",
    });
  });
});

describe("group switch (D5, D6)", () => {
  it("one switch issues one tabs.hide and one tabs.show call", async () => {
    const { w1 } = await twoWindows();
    const created = ok(await send(fake, { type: "createGroup", windowId: w1.windowId }));
    const g3 = created.createdGroupId as string;
    await send(fake, { type: "switchGroup", windowId: w1.windowId, groupId: g3 });
    await browser.tabs.create({ windowId: w1.windowId, url: "https://c/1" });
    await settle(fake);

    const [g1] = await groupIds(fake);
    const hide = vi.spyOn(browser.tabs, "hide");
    const show = vi.spyOn(browser.tabs, "show");
    const response = ok(
      await send(fake, { type: "switchGroup", windowId: w1.windowId, groupId: g1 as string }),
    );
    expect(hide).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledTimes(1);
    expect(response.state.groups[0]?.activeHere).toBe(true);
    expect(await browser.action.getTitle({ windowId: w1.windowId })).toBe("Tab Groups — Group 1");
    expect(invariantHolds(fake)).toBe(true);
    expect(errors).not.toHaveBeenCalled();
  });

  it("an error mid-switch is logged and the window reconciled", async () => {
    const { w1 } = await twoWindows();
    const g3 = ok(await send(fake, { type: "createGroup", windowId: w1.windowId }))
      .createdGroupId as string;
    vi.spyOn(browser.tabs, "hide").mockRejectedValueOnce(new Error("hide failed"));

    const response = await send(fake, { type: "switchGroup", windowId: w1.windowId, groupId: g3 });

    expect(response).toEqual({ ok: false, error: "hide failed" });
    expect(errors).toHaveBeenCalledTimes(1);
    const world = describeWorld(fake);
    expect(world[0]?.activeGroup).toBe(g3);
    expect(world[0]?.tabs.filter((tab) => !tab.hidden).map((tab) => tab.group)).toEqual([g3]);
    expect(invariantHolds(fake)).toBe(true);
    expect(await browser.action.getTitle({ windowId: w1.windowId })).toBe("Tab Groups — Group 3");
  });
});
