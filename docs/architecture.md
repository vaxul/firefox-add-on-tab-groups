# Architecture

> Structural, living document — the most volatile artifact. Update whenever a
> change alters components, boundaries, or flows. Greenfield seed (2026-10-14).

## Component map

| Component | Responsibility |
| --------- | -------------- |
| `src/core/` | Pure domain logic, no `browser`: group model, switch planning (which tabs to ungroup, hide, show, re-group), native-group reconciliation incl. the "first tab wins" conflict rule, backup parsers/converters (PTG `panoramaView` v1/v2, legacy "Tab Groups", own format v1), in-place migration matching, literal search, schema migrations |
| `src/platform/` | Adapters to `browser`: `group-store` (global group list in `storage.local`), `tab-meta` (`sessions` tab/window values: membership, active group per window, native-group records), executor that applies `core` plans through the APIs |
| `src/background/` | Event page: registers every listener synchronously at top level; operation queue; message handlers; tab context menu; commands; toolbar badge and tooltip |
| `src/popup/` | Popup UI: group list and group detail; reads and mutates only via messages to the background |
| `src/options/` | Import/export and settings page |
| `src/shared/` | Typed message contracts between popup/options and background; i18n helper |
| `src/_locales/` | `en` and `de` message catalogues |
| `test/fakes/` | In-memory fakes of `tabs`, `sessions`, `tabGroups`, `windows`, `storage`, `menus`, plus contract tests encoding observed Firefox behaviour |

## Boundaries

- `core` depends on nothing.
- `platform` depends only on `core` types.
- `background` depends on `core` and `platform`.
- `popup` and `options` depend only on `shared`; they never call `tabs`,
  `sessions`, or `storage` to change state.
- Every state change runs through the background operation queue; browser
  events arriving during an own operation are deferred and re-evaluated against
  re-read state.

## Key flows

1. **Group switch** — popup/command message → queue → read state → `core` plans
   the switch → executor: activate a tab of the target group (create one if the
   group is empty), record and ungroup the outgoing group's native groups, hide
   its tabs, show the target group's tabs, re-group and `tabGroups.update` its
   native groups, store the window's active group, update badge. If the target
   group is already open in another window, focus that window instead.
2. **New tab** — `tabs.onCreated` → assign the tab to its window's active group.
3. **User changes native groups** — `tabGroups.onCreated/onUpdated/onRemoved`,
   `tabs.onUpdated` (`groupId`) → deferred while busy → re-read → `core`
   reconciles (one native group belongs to one group; first tab wins) → persist
   native-group records.
4. **Startup / session restore** — `runtime.onStartup` → per window: resolve the
   active group, hide all other groups' tabs, restore native groups of the
   visible group from the stored records.
5. **Move selected tabs** — `menus.onShown` rebuilds the group entries from the
   group list and calls `menus.refresh`; `menus.onClicked` → all highlighted
   tabs → queue → move (ungroup from native group, reassign, hide if the target
   group is not the window's active group).
6. **Import** — options page → parse/convert in `core` → match backup windows
   and tabs against open ones in `core` → executor applies assignments, creates
   missing tabs discarded, collects unmatched tabs in an "Unsorted" group.

## Where new code goes

- A decision that needs no API call → `src/core/`, with a unit test.
- Any `browser` API call → `src/platform/`.
- A new browser event or command → registered in `src/background/`, logic in
  `core`, effects in `platform`.
- New UI → `src/popup/` or `src/options/`, plus its message type in
  `src/shared/`.
- A new or extended fake → `test/fakes/` with a contract test for the observed
  behaviour it models.
