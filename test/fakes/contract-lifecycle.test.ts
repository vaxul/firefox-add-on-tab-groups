// Contract tests: observed Firefox lifecycle behaviour F2, F7, F8 and the
// modelled F10 (docs/specs/spec-group-core.md, Constraints).
import { beforeEach, describe, expect, it } from "vitest";
import { createFakeBrowser } from "./browser";

const fake = createFakeBrowser();
const { tabs, windows, sessions, storage, runtime, action } = fake.browser;

beforeEach(() => fake.reset());

function seedTwoGroups() {
  return fake.seedWindow({
    values: { tgActiveGroupId: "a" },
    tabs: [
      { pinned: true },
      { values: { tgGroupId: "a" } },
      { hidden: true, values: { tgGroupId: "b" } },
      { hidden: true, values: { tgGroupId: "b" } },
    ],
  });
}

async function memberships(): Promise<[boolean | undefined, unknown][]> {
  const all = await tabs.query({});
  return Promise.all(
    all.map(async (t) => [t.hidden, await sessions.getTabValue(t.id as number, "tgGroupId")]),
  );
}

describe("F2 and simulateRestart()", () => {
  it("keeps values and hidden state under new tab and window ids", async () => {
    const before = seedTwoGroups();
    const expected = await memberships();
    await fake.simulateRestart();
    const [win] = await windows.getAll({ populate: true });
    expect(win?.id).not.toBe(before.windowId);
    const newIds = win?.tabs?.map((t) => t.id) ?? [];
    expect(newIds.some((id) => before.tabIds.includes(id as number))).toBe(false);
    expect(await memberships()).toEqual(expected);
    expect(await sessions.getWindowValue(win?.id as number, "tgActiveGroupId")).toBe("a");
  });

  it("clears storage.session, keeps storage.local, drops listeners", async () => {
    fake.seedWindow();
    await storage.local.set({ groups: [{ id: "a" }] });
    await storage.session.set({ tgStarted: true });
    await action.setBadgeText({ text: "2" });
    const listener = () => undefined;
    tabs.onCreated.addListener(listener);
    runtime.onStartup.addListener(listener);
    await fake.simulateRestart();
    expect(await storage.session.get("tgStarted")).toEqual({});
    expect(await storage.local.get("groups")).toEqual({ groups: [{ id: "a" }] });
    expect(await action.getBadgeText({})).toBe("");
    expect(tabs.onCreated.hasListener(listener)).toBe(false);
    expect(runtime.onStartup.hasListener(listener)).toBe(false);
  });

  it("restores non-active tabs discarded and keeps native groups together", async () => {
    fake.seedWindow({ tabs: [{ active: true, groupId: 4 }, { groupId: 4 }] });
    await fake.simulateRestart();
    const [first, second] = await tabs.query({});
    expect([first?.discarded, second?.discarded]).toEqual([false, true]);
    expect(first?.groupId).toBe(second?.groupId);
    expect(first?.groupId).not.toBe(-1);
  });
});

describe("F7: sessions.restore", () => {
  it("makes values of a restored tab readable in tabs.onCreated", async () => {
    const { tabIds } = fake.seedWindow({ tabs: [{}, { values: { tgGroupId: "a" } }] });
    await tabs.remove(tabIds[1] as number);
    const seen: unknown[] = [];
    tabs.onCreated.addListener(async (tab) => {
      seen.push(await sessions.getTabValue(tab.id as number, "tgGroupId"));
    });
    const session = await sessions.restore();
    await fake.flush();
    expect(seen).toEqual(["a"]);
    expect(session.tab?.id).not.toBe(tabIds[1]);
  });

  it("re-hides tabs of a restored window via onUpdated {hidden: true}", async () => {
    seedTwoGroups();
    const other = fake.seedWindow();
    const [closing] = await windows.getAll();
    await windows.remove(closing?.id as number);
    await fake.flush();
    const events: string[] = [];
    tabs.onCreated.addListener((tab) => void events.push(`created hidden=${tab.hidden}`));
    tabs.onUpdated.addListener((_id, info) => void events.push(`updated ${JSON.stringify(info)}`), {
      properties: ["hidden"],
    });
    const session = await sessions.restore();
    await fake.flush();
    expect(events.filter((e) => e.startsWith("created"))).toEqual(
      Array(4).fill("created hidden=false"),
    );
    expect(events.filter((e) => e.startsWith("updated"))).toEqual(
      Array(2).fill('updated {"hidden":true}'),
    );
    const restoredId = session.window?.id as number;
    expect(restoredId).not.toBe(other.windowId);
    expect(await sessions.getWindowValue(restoredId, "tgActiveGroupId")).toBe("a");
  });

  it("lists closed tabs and windows in getRecentlyClosed", async () => {
    const { tabIds } = fake.seedWindow({ tabs: [{}, {}] });
    await tabs.remove(tabIds[1] as number);
    const [entry] = await sessions.getRecentlyClosed();
    expect(entry?.tab?.id).toBe(tabIds[1]);
  });
});

describe("F8: no lifecycle event fires by itself", () => {
  it("fires neither onInstalled nor onStartup on restart or enable; windows exist", async () => {
    fake.seedWindow();
    const fired: string[] = [];
    const register = () => {
      runtime.onInstalled.addListener(() => void fired.push("installed"));
      runtime.onStartup.addListener(() => void fired.push("startup"));
    };
    await fake.simulateRestart();
    register();
    await fake.flush();
    await fake.simulateDisableEnable();
    register();
    await fake.flush();
    expect(fired).toEqual([]);
    expect(await windows.getAll()).toHaveLength(1);
  });
});

describe("F10 (modelled): simulateDisableEnable()", () => {
  it("shows hidden tabs, keeps ids and values, clears storage.session", async () => {
    const { tabIds } = seedTwoGroups();
    await storage.session.set({ tgStarted: true });
    await storage.local.set({ schemaVersion: 1 });
    await fake.simulateDisableEnable();
    const all = await tabs.query({});
    expect(all.map((t) => t.id)).toEqual(tabIds);
    expect(all.every((t) => t.hidden === false)).toBe(true);
    expect(await sessions.getTabValue(tabIds[2] as number, "tgGroupId")).toBe("b");
    expect(await storage.session.get()).toEqual({});
    expect(await storage.local.get()).toEqual({ schemaVersion: 1 });
  });
});
