import { describe, expect, it } from "vitest";
import { emptyLayout, parseLayout, validGroupId } from "./layout";
import { SCHEMA_VERSION } from "./schema";

describe("parseLayout", () => {
  it("returns an empty layout when nothing is stored", () => {
    expect(parseLayout(undefined)).toEqual(emptyLayout());
    expect(parseLayout({})).toEqual({ schemaVersion: 1, groups: [] });
    expect(parseLayout([])).toEqual(emptyLayout());
  });

  it("keeps valid groups in stored order", () => {
    const stored = {
      schemaVersion: 1,
      groups: [
        { id: "b", title: "Work" },
        { id: "a", title: "Home" },
      ],
    };
    expect(parseLayout(stored)).toEqual(stored);
  });

  it("drops malformed entries and duplicate ids", () => {
    const stored = {
      schemaVersion: 1,
      groups: [
        { id: "a", title: "  One  " },
        null,
        "x",
        { id: 3, title: "Bad id" },
        { id: "", title: "Empty id" },
        { id: "b", title: "   " },
        { id: "c" },
        { id: "a", title: "Duplicate" },
      ],
    };
    expect(parseLayout(stored)).toEqual({ schemaVersion: 1, groups: [{ id: "a", title: "One" }] });
  });

  it("treats a non-array group list as empty", () => {
    expect(parseLayout({ schemaVersion: 1, groups: "nope" })).toEqual(emptyLayout());
  });

  it("refuses a newer schema version", () => {
    expect(parseLayout({ schemaVersion: SCHEMA_VERSION + 1, groups: [] })).toBeUndefined();
  });
});

describe("validGroupId", () => {
  const layout = { schemaVersion: 1 as const, groups: [{ id: "a", title: "A" }] };

  it("accepts the id of an existing group", () => {
    expect(validGroupId(layout, "a")).toBe("a");
  });

  it("rejects unknown ids and non-strings", () => {
    expect(validGroupId(layout, "b")).toBeUndefined();
    expect(validGroupId(layout, undefined)).toBeUndefined();
    expect(validGroupId(layout, 1)).toBeUndefined();
  });
});
