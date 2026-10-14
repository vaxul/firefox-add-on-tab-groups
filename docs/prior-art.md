# Prior Art

> Descriptive, living document. Indexed BY CONCERN, not by project. Add
> entries whenever new references surface; gaps are fine.
>
> Tag each concern header with the one roadmap phase it feeds: `(Phase N)` for a
> roadmap P-number or `(feature: <slug>)` for a Features-table row (one tag, not
> both) — so `/loopkit:plan` can resolve "prior art for phase N" deterministically.

## Challenge summary (inception, 2026-10-14)

- **Existence:** Simple Tab Groups (STG) `master` (v6.0, unreleased on AMO as of
  2026-10-14; AMO has 5.3.2) already round-trips native tab groups across group
  switches. It stays MV2 + Vue, its UI structure is not wanted, and its Panorama
  import recreates tabs from URLs instead of matching open tabs. Decision: build.
- **USP:** see `docs/vision.md`.
- **Window model:** global groups as in STG (a group is open in at most one
  window) — replaces the per-window model of Panorama Tab Groups (PTG).

## Group switching and group state (Phase 1)

### drive4ik/simple-tab-groups

- Path: `addon/src/js/groups.js`, `addon/src/js/tabs.js`, `addon/src/js/windows.js`, `docs/DESIGN-GROUPS.md`
- License: MPL-2.0
- Verdict: reference-only — MV2, Vue, large global model; the window model is adopted, the code is not
- Date: 2026-10-14
- Notes:
  - ADOPT: global groups; each window shows exactly one group, a group is open in at most one window; opening a group already open elsewhere focuses that window
  - ADOPT: a group's tabs always form one contiguous block in the tab strip
  - ADOPT: pinned tabs are outside the group logic
  - ADOPT: tabs sharing camera/microphone/screen cannot be hidden — handle explicitly
  - ADOPT: `tabs.hide` silently skips the active tab — activate a target tab first, then hide
  - AVOID: the large in-memory global model; event-page state must be re-read from storage

### vaxul/panorama-tab-groups

- Path: `src/js/background.js`
- License: MPL-2.0
- Verdict: reference-only — legacy model and behaviour baseline for migration
- Date: 2026-10-14
- Notes:
  - ADOPT: legacy session keys `groups`, `activeGroup`, `groupIndex` (window) and `groupId` (tab) — needed to understand backups
  - ADOPT: toolbar badge with group count
  - AVOID: MV2 persistent background page; per-event `getWindowValue` round-trips without a serialising queue (races)
  - AVOID: per-window groups (superseded by the global model)

## Native Firefox tab groups interplay (Phase 2)

### drive4ik/simple-tab-groups — behaviour reference

- Path: `docs/BEHAVIOR-TABGROUPS.md` (facts numbered by section, verified on Firefox 154); also `docs/BEHAVIOR-MOVE-TABS.md`, `BEHAVIOR-CREATE-TABS.md`, `BEHAVIOR-REMOVE-TABS.md`, `BEHAVIOR-LIFECYCLE.md`, `DESIGN-EVENTS.md`, `DESIGN-GROUPS.md` (cited as F1–F10 in `docs/specs/spec-group-core.md`)
- License: MPL-2.0
- Verdict: reference-only — read in full before speccing Phase 1; answers V1/V2 of the grilling decisions
- Date: 2026-10-14
- Notes:
  - ADOPT §4: hidden tabs keep their `groupId`; a group with all tabs hidden leaves an unremovable empty header — ungroup before hide
  - ADOPT §3: group only visible tabs (`tabs.group` on hidden tabs yields an empty header); order of `tabIds` sets in-group order
  - ADOPT §5: native group ids are not settable and change on re-group/restore — use an own stable key
  - ADOPT §9: ungrouping the last member removes the group and fires `tabGroups.onRemoved`; `tabs.hide` silently skips the active tab and resolves with the ids it hid
  - ADOPT §26: `tabs.remove` over a whole group or closing a window creates an API-invisible "saved group"; `tabs.ungroup` does not — ungroup before removing
  - ADOPT §1/§2/§11/§20: `tabs.move` changes membership based on the tab at the target slot; batch moves to `index: -1` can pull tabs into a group
  - ADOPT §14/§17: some changes fire no events — re-read tab state instead of trusting events alone

### drive4ik/simple-tab-groups — native-group mirror

- Path: `addon/src/js/groups-native.js`
- License: MPL-2.0
- Verdict: reference-only
- Date: 2026-10-14
- Notes:
  - ADOPT: mirror only settled state — defer triggers while an own operation runs, batch them (~150 ms); prevents the feedback loop of V3
  - ADOPT: skip an apply when live state already equals the target
  - ADOPT: garbage-collect stored native-group records no tab references; re-issue stable keys on import

### MDN / Mozilla Bugzilla

- Path: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabGroups ; bugs 1972879 (tabGroups hide API, NEW), 1940631 (tabGroups meta)
- License: n/a (documentation)
- Verdict: reference-only
- Date: 2026-10-14
- Notes:
  - ADOPT: no create/remove in `tabGroups` — use `tabs.group`/`tabs.ungroup`; grouping unpins pinned tabs and moves tabs to be adjacent
  - ADOPT: private-window groups are not kept across restarts
  - AVOID: waiting for a native hide API (bug 1972879 unimplemented)
  - Unverified: the 138/139 version split comes from the Mozilla add-ons blog (2025-04-30), not the MDN compat table

### mbnuqw/sidebery

- Path: repository root (no `tabGroups` usage found; unverified)
- License: MIT
- Verdict: reference-only — no native-group handling to learn from
- Date: 2026-10-14

## Moving tabs between groups (Phase 3)

### drive4ik/simple-tab-groups

- Path: `addon/src/js/menus-tab.js`
- License: MPL-2.0
- Verdict: reference-only
- Date: 2026-10-14
- Notes:
  - ADOPT: tab context menu "Move tab to group" with a "new group" entry
  - ADOPT (our requirement): act on all highlighted tabs, not only the clicked one; rebuild the group list on menu show so new/renamed groups appear without a refresh (PTG pain points)

### vaxul/panorama-tab-groups

- Path: `src/js/background.js` (context menu setup)
- License: MPL-2.0
- Verdict: avoid (behaviour) — moved one tab at a time; menu entries went stale until refreshed after a group was created
- Date: 2026-10-14

## Backup import / migration (Phase 4)

### vaxul/panorama-tab-groups

- Path: `src/js/options/backup.js`
- License: MPL-2.0
- Verdict: reference-only — format specification
- Date: 2026-10-14
- Notes:
  - ADOPT: format v1 `{file:{type:'panoramaView',version:1}, windows:[{groups:[{id,name,rect}], tabs:[{url,title,groupId,index,lastAccessed,pinned}], activeGroup, groupIndex}]}`; pinned tabs carry `groupId 0`
  - ADOPT: legacy "Tab Groups" / `sessionrestore` conversion (license permits reuse, decision E7)
  - ADOPT: also accept format v2 (`windows[].tabGroups[{title,tabs}]`) — AMO ships PTG 0.8.12, newer than the repo's 0.8.11
  - AVOID: import into new windows as the only strategy — default is in-place matching (decision E4)

### drive4ik/simple-tab-groups

- Path: `addon/src/options/Options.vue` (`importSettingsPanoramaViewAddonButton`)
- License: MPL-2.0
- Verdict: reference-only
- Date: 2026-10-14
- Notes:
  - ADOPT: validate `file.type === 'panoramaView'` and `Array.isArray(windows)` before anything else
  - AVOID: dropping `activeGroup` and group order

## Testing with in-memory API fakes (Phase 1)

### DefinitelyTyped @types/firefox-webext-browser

- Path: `types/firefox-webext-browser/index.d.ts`
- License: MIT
- Verdict: reuse — covers `tabs.hide/show/group/ungroup`, `sessions.*Value`, `browser.tabGroups`
- Date: 2026-10-14

### aklinker1/webext-core (@webext-core/fake-browser)

- Path: `packages/fake-browser/src/apis/`
- License: MIT
- Verdict: avoid as base, reference-only for patterns — no `sessions`, no `tabGroups`, no hide/show
- Date: 2026-10-14
- Notes:
  - ADOPT: per-namespace fake modules with a `reset()` between tests
  - AVOID: `webextensions-api-fake` (unmaintained since 2020), `sinon-chrome` (stubs only, Chrome-shaped), `webextension-polyfill` (Firefox has `browser` natively)
  - ADOPT (own fakes): encode the STG behaviour facts (§3, §4, §5, §9, §26, active-tab hide skip) as contract tests of the fakes

## Build and release tooling (Phase 1)

### mozilla/web-ext

- Path: https://extensionworkshop.com/documentation/develop/web-ext-command-reference/
- License: MPL-2.0
- Verdict: reuse — lint/run/build/sign
- Date: 2026-10-14
- Notes:
  - ADOPT: `web-ext sign --channel=unlisted` with `WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET`
  - ADOPT: `web-ext lint` flags APIs missing at `strict_min_version`
  - ADOPT: since 2025-11-03 AMO requires `browser_specific_settings.gecko.data_collection_permissions` (`{"required": ["none"]}`); unverified whether a consent UI is expected for `strict_min_version` < 140 when nothing is collected
  - AVOID: WXT and similar frameworks (no-framework constraint)

## Popup feature parity (Phase 5)

### vaxul/panorama-tab-groups

- Path: `src/popup-view/js/GroupsFrame.js`, `src/popup-view/js/GroupDetailFrame.js`, `src/popup-view/js/Frame.js`, `src/popup-view/index.js`
- License: MPL-2.0
- Verdict: reference-only — the UI structure to carry forward
- Date: 2026-10-14
- Notes:
  - ADOPT: two-level navigation (group list → group detail with tab list)
  - ADOPT: commands `activate-next-group` / `activate-previous-group`

### drive4ik/simple-tab-groups

- Path: `addon/src/popup/Popup.vue`, `addon/src/js/hotkeys.js`
- License: MPL-2.0
- Verdict: avoid (UI structure) — not wanted by the maintainer
- Date: 2026-10-14
- Notes:
  - AVOID: STG's popup layout; 23 keyboard commands (we ship next/prev group + `_execute_action`)

## Theme in current Firefox style (Phase 6)

### Mozilla Acorn design system

- Path: https://acorn.firefox.com/latest/desktop/design-tokens/how-design-tokens-work/overview-YYp6MVjt
- License: n/a (documentation; token values to be re-checked before copying)
- Verdict: reference-only — source for colours, spacing, radii of the current Firefox UI
- Date: 2026-10-14
- Notes:
  - ADOPT: tokens defined once with CSS `light-dark()`, plus high-contrast (`forced-colors`) rules
  - AVOID: relying on `prefers-color-scheme` alone — it follows the OS theme, not a Firefox-only theme change
  - AVOID: relying on `theme.getCurrent()` — returns all-null colours for the "System theme"
  - Source of the AVOID notes: Mozilla Discourse threads (older, behaviour to re-verify in Phase 6)

## Own backup format (Phase 6)

### vaxul/panorama-tab-groups

- Path: `src/js/options/backup.js`
- License: MPL-2.0
- Verdict: reference-only — shape of a versioned backup file
- Date: 2026-10-14
- Notes:
  - ADOPT: a `file: {type, version}` header checked before parsing
  - AVOID: binding groups to windows — the own format stores global groups, their order, native-group records, and per-window active groups
