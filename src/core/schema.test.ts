import { describe, expect, it } from "vitest";
import { needsMigration, SCHEMA_VERSION } from "./schema";

describe("needsMigration", () => {
  it("migrates when no version is stored", () => {
    expect(needsMigration(undefined)).toBe(true);
  });

  it("migrates an older version", () => {
    expect(needsMigration(SCHEMA_VERSION - 1)).toBe(true);
  });

  it("keeps the current version", () => {
    expect(needsMigration(SCHEMA_VERSION)).toBe(false);
  });
});
