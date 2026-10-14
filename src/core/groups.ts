import type { Group, GroupLayout } from "./layout";

// Injected so `src/core/` needs neither `crypto` nor the i18n API (D2, D3).
export interface GroupDeps {
  readonly randomUUID: () => string;
  readonly formatTitle: (n: number) => string;
}

/** Smallest positive n whose `formatTitle(n)` is not used by any group (D3). */
export function defaultTitle(groups: readonly Group[], formatTitle: (n: number) => string): string {
  const used = new Set(groups.map((group) => group.title));
  let n = 1;
  while (used.has(formatTitle(n))) n += 1;
  return formatTitle(n);
}

/** Appends a new group with a fresh id and a default title (D2, D3, D15). */
export function createGroup(
  layout: GroupLayout,
  deps: GroupDeps,
): { layout: GroupLayout; group: Group } {
  const group: Group = {
    id: deps.randomUUID(),
    title: defaultTitle(layout.groups, deps.formatTitle),
  };
  return { layout: { ...layout, groups: [...layout.groups, group] }, group };
}

/**
 * Renames a group to the trimmed title (D16). An empty or whitespace-only
 * title, or an unknown id, returns the layout unchanged.
 */
export function renameGroup(layout: GroupLayout, groupId: string, title: string): GroupLayout {
  const trimmed = title.trim();
  if (trimmed === "" || !layout.groups.some((group) => group.id === groupId)) return layout;
  const groups = layout.groups.map((group) =>
    group.id === groupId ? { ...group, title: trimmed } : group,
  );
  return { ...layout, groups };
}

/** Removes a group from the list; an unknown id returns the layout unchanged. */
export function deleteGroup(layout: GroupLayout, groupId: string): GroupLayout {
  if (!layout.groups.some((group) => group.id === groupId)) return layout;
  return { ...layout, groups: layout.groups.filter((group) => group.id !== groupId) };
}
