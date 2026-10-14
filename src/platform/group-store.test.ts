import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFakeBrowser } from "../../test/fakes/browser";
import { emptyLayout, type GroupLayout } from "../core/layout";
import { claimStart, loadLayout, saveLayout } from "./group-store";

const fake = createFakeBrowser();
let uninstall: () => void;

beforeEach(() => {
  fake.reset();
  uninstall = fake.install();
});
afterEach(() => uninstall());

const layout: GroupLayout = {
  schemaVersion: 1,
  groups: [
    { id: "a", title: "Group 1" },
    { id: "b", title: "Work" },
  ],
};

describe("group store (D1)", () => {
  it("loads an empty layout when nothing is stored", async () => {
    expect(await loadLayout()).toEqual(emptyLayout());
  });

  it("round-trips a layout through storage.local with order kept", async () => {
    await saveLayout(layout);
    expect(await loadLayout()).toEqual(layout);
    expect(await fake.browser.storage.local.get(null)).toEqual({
      schemaVersion: 1,
      groups: layout.groups,
    });
  });

  it("returns undefined for a newer schema version and leaves it untouched", async () => {
    await fake.browser.storage.local.set({ schemaVersion: 99, groups: [] });
    expect(await loadLayout()).toBeUndefined();
    expect(await fake.browser.storage.local.get("schemaVersion")).toEqual({ schemaVersion: 99 });
  });

  it("drops malformed stored entries", async () => {
    await fake.browser.storage.local.set({
      schemaVersion: 1,
      groups: [{ id: "a" }, layout.groups[1]],
    });
    expect((await loadLayout())?.groups).toEqual([layout.groups[1]]);
  });

  it("survives a restart", async () => {
    await saveLayout(layout);
    await fake.simulateRestart();
    expect(await loadLayout()).toEqual(layout);
  });
});

describe("start flag (D10)", () => {
  it("is claimed once per start", async () => {
    expect(await claimStart()).toBe(true);
    expect(await claimStart()).toBe(false);
  });

  it("is claimable again after a restart and after disable/enable", async () => {
    await claimStart();
    await fake.simulateRestart();
    expect(await claimStart()).toBe(true);
    await fake.simulateDisableEnable();
    expect(await claimStart()).toBe(true);
  });

  it("lives in storage.session, not storage.local", async () => {
    await claimStart();
    expect(await fake.browser.storage.session.get("tgStarted")).toEqual({ tgStarted: true });
    expect(await fake.browser.storage.local.get("tgStarted")).toEqual({});
  });
});
