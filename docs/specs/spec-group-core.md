# Spec: Foundation and group core (Phase 1)

> Created: 2026-10-14

Delivers the working core of the extension: in-memory API fakes, global groups
with one group shown per window, hide/show group switching, new tabs joining the
window's group, reconciliation after restart, a minimal popup (list, switch,
create, rename, close), and the toolbar badge and tooltip. This spec carries no
lifecycle state — acceptance is the spec merged on the default branch with a
milestone and issues, and all progress lives in the GitHub issues and milestone.
A completed spec is moved to `docs/specs/archive/`.

## Outcome

- [ ] `test/fakes/` provides in-memory fakes of `tabs`, `windows`, `sessions`,
      `storage` (`local` and `session`) and `action`, each with a `reset()`, plus
      contract tests that encode the observed Firefox behaviour listed under
      Constraints (F1–F9).
- [ ] On first start every open normal window gets its own group that holds all
      of its non-pinned tabs; no tab is hidden by the first start.
- [ ] Every window shows exactly one group. Every visible non-pinned tab belongs
      to its window's active group (the **window invariant**); a group is active
      in at most one window.
- [ ] Switching a window to another group shows exactly that group's tabs and
      hides the previous group's tabs. Pinned tabs stay visible and ungrouped.
- [ ] Switching to a group that is active in another window focuses that window
      and changes nothing else. Switching to a group whose tabs are hidden in
      another window moves them into the current window as one contiguous block
      and shows them.
- [ ] Switching to an empty group opens one new tab (`about:newtab`) in it.
- [ ] A tab the user creates, or drags into a window, joins that window's active
      group.
- [ ] After a browser restart (and after disable/enable of the extension) every
      tab keeps its group membership and every window shows its previous active
      group: 0 lost assignments in the restart contract test.
- [ ] The popup lists all groups in stored order with title, tab count, a marker
      for the current window's active group and a marker for groups active in
      another window; the user can switch, create, rename, and close groups from
      it. Closing the last group leaves one new empty default group.
- [ ] The toolbar badge shows the number of groups; the toolbar tooltip names the
      current window's active group.
- [ ] A group switch in a window with 200 tabs completes in under 500 ms.
- [ ] Every user-facing string exists in the `en` and `de` locales.

## Scope

### In scope

- Fakes and their contract tests (`test/fakes/`).
- Group model and persisted group list (`storage.local`, schema version 1).
- Tab → group membership and window → active group (`sessions` values).
- Group switch, empty-group switch, cross-window switch, focus-instead-of-switch.
- Window reconciliation on first install, browser start, extension enable, and
  for windows the user opens or restores.
- New, attached, and restored tabs.
- Operation queue with event deferral.
- Minimal popup: group list, switch, create, rename, close (incl. last and empty
  group), with tokens in `src/shared/tokens.css`.
- Toolbar badge and tooltip.
- Manifest: `action` with the popup, permissions `storage`, `sessions`,
  `tabHide`, `incognito: "not_allowed"`.

### Out of scope

- Recording and restoring native tab groups across switches, the "first tab
  wins" rule, and the native-group feedback loop — Phase 2. Phase 1 only
  ungroups before hiding (see Prior decisions D13).
- Tab context menu and moving tabs between groups — Phase 3.
- Backup import / migration — Phase 4.
- Group detail with tab list, search, drag-and-drop order, keyboard shortcuts,
  marking of tabs that cannot be hidden — Phase 5.
- Full theme work and own backup format — Phase 6. Phase 1 uses the seed tokens
  from `docs/design.md` as they are.
- Options page.

## Constraints

- `docs/constitution.md` applies in full; in particular: no mutable module-level
  state except the operation queue it mandates, `src/core/` free of `browser`,
  `tabs.ungroup` before `tabs.hide` and `tabs.show` before `tabs.group`, tabs of
  a native group ungrouped before `tabs.remove`, no `innerHTML`, all strings via
  `browser.i18n`, 50-line functions, 400-line files.
- Component placement and boundaries follow `docs/architecture.md`: decisions in
  `src/core/`, API calls in `src/platform/`, listeners in `src/background/`,
  popup in `src/popup/` talking to the background only through typed messages
  in `src/shared/`.
- Observed Firefox behaviour the code and the fakes must respect (source: STG
  `docs/BEHAVIOR-*.md`, verified on Firefox 154; see Prior art):
  - F1: `tabs.hide` silently skips the active tab and tabs sharing camera,
    microphone, or screen, and resolves with the ids it did hide
    (TABGROUPS §9, §19). Hiding a hidden tab is a no-op (§24).
  - F2: Hidden tabs keep their state across restart and are restored hidden
    (TABGROUPS §6).
  - F3: A cross-window `tabs.move` reveals hidden tabs (MOVE §1); a hidden and
    discarded tab stays hidden (MOVE §3); a cross-window move of a discarded tab
    drops its `sessions` values, rewriting them right after the move works
    (MOVE §7).
  - F4: Detach/attach events arrive before the `tabs.move` promise resolves
    (MOVE §2); own actions' events can arrive after the API call resolves
    (DESIGN-EVENTS §1).
  - F5: Removing the last visible tab closes the window and its hidden tabs
    (REMOVE §1); a pinned tab keeps the window alive (REMOVE §2).
  - F6: `tabs.create` without `url` opens `about:newtab`; passing `about:newtab`
    explicitly is refused (CREATE §16). A create without index lands past a
    hidden tail (CREATE §15).
  - F7: Tab and window `sessions` values ride through `sessions.restore` and are
    readable in `tabs.onCreated` (CREATE §29); undo-close-window re-hides tabs via
    `onUpdated {hidden: true}` (TABGROUPS §18).
  - F8: No `runtime.onInstalled` on a plain restart or on enable
    (LIFECYCLE §1); windows already exist at background start (CREATE §55).
  - F9: Pinning strips native-group membership; `sessions` values survive pin
    and unpin (TABGROUPS §19).

## Prior art

- [Group switching and group state (Phase 1)](../prior-art.md#group-switching-and-group-state-phase-1)
  — global window model, focus-instead-of-switch, contiguous blocks, pinned tabs
  outside groups, activate-before-hide, sharing tabs.
- [Native Firefox tab groups interplay (Phase 2)](../prior-art.md#native-firefox-tab-groups-interplay-phase-2)
  — the STG behaviour docs are the source of F1–F9; ungroup-before-hide.
- [Testing with in-memory API fakes (Phase 1)](../prior-art.md#testing-with-in-memory-api-fakes-phase-1)
  — per-namespace fakes with `reset()`, behaviour facts as contract tests.
- [Build and release tooling (Phase 1)](../prior-art.md#build-and-release-tooling-phase-1)
  — `web-ext lint` in Verify.
- [Popup feature parity (Phase 5)](../prior-art.md#popup-feature-parity-phase-5)
  — PTG popup structure; Phase 1 builds its first level (group list).

Concrete source findings (read-only clone of STG `master` and PTG, 2026-10-14):
STG `groups.js` `applyNow` (focus if open elsewhere, `Tabs.moveToWindow` then
show, then hide), `tabs.js` `moveNative` (re-write `sessions` values after a
cross-window move), `windows.js` `initializeGroupsNow` (startup reconciliation),
`groups.js` `createId` (`crypto.randomUUID()`), manifest
`"incognito": "not_allowed"`; PTG `background.js` `setActionTitle` (badge =
group count, title = active group name) and the `GroupsFrame` popup actions.

## Human prerequisites

- none — Phase 1 needs no secrets, accounts, or external provisioning. AMO keys
  are needed only for signing (`docs/release.md`), which is not part of this
  milestone.

## Prior decisions

| Decision | Rationale | Date |
|---|---|---|
| D1 Persisted layout: `storage.local` holds `{ schemaVersion: 1, groups: [{ id, title }] }`; array order is the group order. Tab value `groupId` (group id string) per tab; window value `activeGroupId` per window. No other persisted state in Phase 1. | Constitution (group list in `storage.local`, membership in `sessions`); first persisted layout, so `SCHEMA_VERSION` stays 1 and no migration is needed. | 2026-10-14 |
| D2 Group id = `crypto.randomUUID()`. | STG precedent (`createId`); no counter to serialise, ids stay unique across import later. | 2026-10-14 |
| D3 Default title = i18n `defaultGroupTitle` ("Group $1" / "Gruppe $1") with the smallest positive integer whose title is not in use. | Readable, stable, no UUID fragments; PTG's "N: Unnamed group" mixed id and name. | 2026-10-14 |
| D4 The window invariant: every visible non-pinned tab belongs to its window's active group. All event handlers and reconciliation enforce it after re-reading state; handlers are idempotent instead of using skip flags. | Constitution (no module state, re-read on each event); makes late events of own actions (F4) harmless. | 2026-10-14 |
| D5 Operation queue: one promise chain in the background serialises every state-changing operation, including event handlers; an event that arrives while an operation runs is queued behind it and evaluated against re-read state. The chain tail is the only module-level mutable value. | Constitution mandates the queue; it carries no domain state and does not outlive the event page. | 2026-10-14 |
| D6 Switch order in window W from group A to B: (1) if B is active in another window, focus it and stop; (2) move B's tabs hidden in other windows to the end of W as one block, re-write their `sessions` values (F3); (3) `tabs.show` B's tabs; (4) activate B's most recently accessed tab, or create one new tab in W without `url` if B is empty (F6); (5) set W's `activeGroupId` = B; (6) `tabs.ungroup` A's natively grouped tabs; (7) `tabs.hide` A's tabs; (8) update tooltip. `tabs.show`/`tabs.hide`/`tabs.move` are called once per switch with id arrays. | STG `applyNow` order; F1 (activate before hide); constitution (ungroup before hide); batched calls for the 200-tab target. | 2026-10-14 |
| D7 Pinned tabs carry no membership, are never hidden, and are ignored by every count and plan. A tab that gets pinned loses its `groupId` value; a tab that gets unpinned joins its window's active group. | STG precedent (DESIGN-GROUPS §1); F9. | 2026-10-14 |
| D8 Tabs that `tabs.hide` skipped (sharing camera/microphone/screen) keep their membership and stay visible; the switch still completes. The next switch or reconciliation in that window hides them again. Marking them in the popup is Phase 5. | F1; avoids STG's auto-pinning, which changes the user's tab state. | 2026-10-14 |
| D9 Reconciliation of a window (runs for every window on start, and for a window from `windows.onCreated`): resolve the active group — the stored `activeGroupId` if it exists and no other window has it, else a new default group; assign every visible non-pinned tab without a valid membership, or with another group's membership, to it; show hidden tabs of the active group; leave hidden tabs of other groups hidden unless that group is active in another window, then move them there; assign hidden tabs without a valid membership to the active group and show them. On first install with an empty group list, each window gets a new group. | Enforces D4 everywhere with one routine; F2 and F7 make restored tabs and windows carry their values; never leaves an orphaned tab invisible. | 2026-10-14 |
| D10 Start detection: at top level the background checks a `storage.session` flag; if it is absent, it queues a full reconciliation of all normal windows and sets the flag. | F8 — `onInstalled`/`onStartup` miss enable after disable; `storage.session` is cleared on restart, reload, and disable, and is not module state. | 2026-10-14 |
| D11 New and attached tabs: `tabs.onCreated`, `tabs.onAttached`, and `tabs.onUpdated` (`pinned`, `hidden`) queue a re-check of that tab against D4. A hidden tab with a valid membership is left alone. A tab dragged into another window joins that window's active group. | STG `onAttached` precedent; D4. Covers undo-close-tab (visible restored tab joins the window's group) and restored windows (F7). | 2026-10-14 |
| D12 A user-opened normal window gets a new default group via D9 that adopts its tabs. | Vision: every window shows exactly one group; STG's "window without group" mode contradicts it. | 2026-10-14 |
| D13 Phase 1 ungroups natively grouped tabs before hiding them without recording the native group; record and restore arrive in Phase 2. | Constitution rule (ungroup before hide) is binding; leaving native groups intact would leave dead headers (vision problem statement). Phase 1 is not released (first release after Phase 4, `docs/roadmap.md`). | 2026-10-14 |
| D14 Closing a group: if it is active in a window, that window first switches to the next group in list order that is not active elsewhere (the previous one for the last row); if none exists, to a new default group. Then the group's natively grouped tabs are ungrouped, its tabs removed with one `tabs.remove`, and the group deleted from the list. A group with tabs asks for an inline confirmation in the popup; an empty group closes without one. | Switching first keeps the window alive (F5); ungroup before remove (constitution, avoids saved groups); inline confirmation per `docs/design.md`; A5 of the grilling session. | 2026-10-14 |
| D15 Creating a group from the popup appends it to the list, switches the current window to it (one new tab), and opens the inline rename field. | PTG `createGroup` precedent. | 2026-10-14 |
| D16 Rename is inline: Enter or blur saves a trimmed non-empty title, Escape cancels; an empty title keeps the old one. | PTG precedent; no empty titles in the list. | 2026-10-14 |
| D17 Badge text = number of groups (global); tooltip per window = i18n `actionTitle` ("Tab Groups — $1" with the active group title) via `action.setTitle({ windowId })`. Badge background uses the token `muted`. | PTG `setActionTitle` precedent adapted to global groups; i18n instead of PTG's hard-coded string. | 2026-10-14 |
| D18 Private windows are not supported: `"incognito": "not_allowed"`. | STG precedent; tabs cannot move between private and normal windows, which breaks global groups. Replaces assumption A4 of the grilling session. | 2026-10-14 |
| D19 Permissions: `storage` (group list, start flag), `sessions` (membership, active group), `tabHide` (`tabs.hide`). No `tabs` permission: Phase 1 shows no tab titles or URLs. No host permissions. | Constitution: every new permission justified in its spec; least privilege. | 2026-10-14 |
| D20 The popup reads state through a `getState` message (groups with id, title, tab count, active-here, active-elsewhere) and sends `switchGroup`, `createGroup`, `renameGroup`, `closeGroup`; it re-renders from each response. After a switch or a focus change the popup closes. | Architecture boundary (popup only via `shared` messages); no live sync needed for a short-lived popup. | 2026-10-14 |
| D21 The popup reads its window id once with `windows.getCurrent()` (read-only) and sends it with every message. Each response is `{ ok: true, state }` or `{ ok: false, error }`; on `ok: false` the popup logs the error and re-renders from a fresh `getState`. Tab count = non-pinned tabs with that membership in all windows, hidden ones included. | Architecture allows read-only access; the background must know which window acts. | 2026-10-14 |
| D22 Badge text is refreshed after reconciliation, create, and close; tooltips after reconciliation, switch, rename, and close. `tabs.onUpdated` listens with the filter `properties: ["pinned", "hidden"]`. | Only these operations change the shown values; the filter keeps the event page asleep on unrelated updates. | 2026-10-14 |
| D23 Build: `scripts/build.mjs` gains the entry `popup` (`src/popup/index.ts`) and copies `src/popup/popup.html` and `src/shared/tokens.css`; the manifest gets `action.default_popup` and `action.default_title`. | Existing esbuild script stays the single build path (constitution tech stack). | 2026-10-14 |
| D24 Closing a window (or its last visible tab, F5) closes the hidden tabs of other groups stored in that window; Phase 1 accepts this. Groups stay in the list (possibly empty); reopening the window through Firefox "Recently closed windows" brings the tabs back with their membership, and D9 reconciles the restored window. Recovering the tabs automatically (STG `tryRestoreMissedTabs` approach) is a separate later roadmap phase, seeded via `/loopkit:roadmap`. | Resolved at the spec-acceptance gate by the maintainer: Phase 1 is not released; automatic recovery needs the closed tabs' URLs and memberships, which the event page cannot read after the close without a persisted snapshot — a design question of its own. | 2026-10-14 |

## Design

- Switch sequence (D6):

```mermaid
sequenceDiagram
  participant P as Popup
  participant Q as Background queue
  participant C as core planner
  participant X as platform executor
  P->>Q: switchGroup(B)
  Q->>X: read groups, windows, memberships
  Q->>C: planSwitch(state, W, B)
  C-->>Q: focus W2 | plan
  Q->>X: move B tabs into W (rewrite values)
  Q->>X: show B tabs
  Q->>X: activate B tab / create new tab
  Q->>X: set W activeGroupId = B
  Q->>X: ungroup A tabs, hide A tabs
  Q->>X: update badge + tooltip
  Q-->>P: done (popup closes)
```

- Popup prototype (design surface, consumed by the popup issue):
  [`docs/design/prototypes/group-core.html`](../design/prototypes/group-core.html)
  with screenshots
  [`docs/design/assets/group-core-light.png`](../design/assets/group-core-light.png)
  and [`docs/design/assets/group-core-dark.png`](../design/assets/group-core-dark.png).
  Frames: (1) group list — active marker, tab count, active-elsewhere icon,
  rename/close icon buttons on hover or focus, "New group" footer; (2) inline
  rename (D15, D16); (3) inline close confirmation (D14). The prototype's
  `:root` token block moves unchanged into `src/shared/tokens.css`; the
  `?scheme=` switch and the frame captions are prototype-only.

## Tracking

- Milestone: added at acceptance
- Issues: created from this spec once it is merged (one per implementable step)

Each issue references this spec path in its body.

## Verification

- [ ] `npm run verify` passes, including the 80 % line coverage of `src/core/`.
- [ ] Fake contract tests cover F1–F9.
- [ ] Unit tests of the core planners cover: switch with active tab in the
      outgoing group, switch to an empty group, switch to a group hidden in
      another window, switch to a group active elsewhere (focus only), sharing
      tab skipped by hide, pinned tabs, close of the active / an inactive / the
      last / an empty group, D3 default titles, D9 reconciliation cases (missing,
      unknown, duplicate active group; orphan visible and hidden tabs; tabs of a
      group active elsewhere).
- [ ] Integration tests against the fakes: first install with two windows;
      new tab and attached tab join the active group; a fake restart (new tab
      and window ids, values and hidden state kept, `storage.session` cleared)
      loses 0 assignments; one switch issues one `tabs.hide` and one
      `tabs.show` call.
- [ ] QA in Firefox (`npm start`): first start keeps all tabs visible in one
      group per window; create, rename, switch, and close groups from the popup;
      close the last group; switch to an empty group; switch to a group active in
      another window focuses it; restart Firefox and confirm every window shows
      its previous group with all tabs; disable and enable the extension;
      badge and tooltip match.
- [ ] QA in Firefox: a window with 200 tabs (two groups of 100) switches in
      under 500 ms (measured in the background console with
      `performance.now()` around the queued operation).
- [ ] QA in Firefox: the popup in light and dark mode and with `forced-colors`
      matches the design artifact; every action works by keyboard.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Fakes diverge from Firefox behaviour | Contract tests encode F1–F9 from the STG behaviour docs; QA runs every flow in real Firefox. |
| Late events of own operations re-trigger work (F4) | D4/D11 idempotent re-checks against re-read state instead of skip flags. |
| Event page unloads during a long operation | Firefox keeps the page alive while listeners run and promises are pending; every operation is short and re-reads state, so a restart resumes via D10. |
| Native groups are lost on switch until Phase 2 | D13; Phase 1 is not released. |
| Hidden tabs lost when a window closes | D24: accepted for Phase 1, recoverable via Firefox "Recently closed windows"; automatic recovery in a later phase. |
| 200-tab switch exceeds 500 ms | Batched `tabs.*` calls (D6); `sessions` reads in parallel; QA measurement. |

## Decision log

- 2026-10-14: Prior-art clones of STG and PTG read for D2, D6, D9, D11, D14,
  D17, D18; findings recorded under Prior art.
- 2026-10-14: Spec-acceptance gate — window close (D24) resolved by the
  maintainer: accept in Phase 1, automatic recovery as a later roadmap phase.
- 2026-10-14: Design review of the popup prototype — row actions use opacity
  instead of `visibility` so they stay keyboard- and screen-reader-reachable;
  tab counts carry visually hidden text; destructive text only on the
  `secondary` surface (dark destructive on `background` is 4.26:1).
