import { SCHEMA_VERSION } from "./schema";

// Persisted layout (spec-group-core D1). `storage.local` holds the
// `GroupLayout` object; array order is the group order.
export interface Group {
  readonly id: string;
  readonly title: string;
}

export interface GroupLayout {
  readonly schemaVersion: typeof SCHEMA_VERSION;
  readonly groups: readonly Group[];
}

// `sessions` tab value: id of the group a tab belongs to.
export const TAB_GROUP_KEY = "tgGroupId";
// `sessions` window value: id of the window's active group.
export const WINDOW_ACTIVE_GROUP_KEY = "tgActiveGroupId";
// `storage.session` key: set once per browser start (D10).
export const STARTED_KEY = "tgStarted";

export function emptyLayout(): GroupLayout {
  return { schemaVersion: SCHEMA_VERSION, groups: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toGroup(value: unknown): Group | undefined {
  if (!isRecord(value)) return undefined;
  const { id, title } = value;
  if (typeof id !== "string" || id === "") return undefined;
  if (typeof title !== "string" || title.trim() === "") return undefined;
  return { id, title: title.trim() };
}

function toGroups(value: unknown): Group[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const groups: Group[] = [];
  for (const entry of value) {
    const group = toGroup(entry);
    if (group === undefined || seen.has(group.id)) continue;
    seen.add(group.id);
    groups.push(group);
  }
  return groups;
}

/**
 * Validates stored data into a layout. Nothing stored yields an empty layout;
 * malformed entries and duplicate ids are dropped, titles are trimmed.
 * A newer schema version than this build knows returns `undefined`, so the
 * caller does not overwrite data it cannot read.
 */
export function parseLayout(stored: unknown): GroupLayout | undefined {
  if (!isRecord(stored)) return emptyLayout();
  const version = stored["schemaVersion"];
  if (typeof version === "number" && version > SCHEMA_VERSION) return undefined;
  return { schemaVersion: SCHEMA_VERSION, groups: toGroups(stored["groups"]) };
}

/** Validates a stored `tgGroupId` / `tgActiveGroupId` value against the layout. */
export function validGroupId(layout: GroupLayout, value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return layout.groups.some((group) => group.id === value) ? value : undefined;
}
