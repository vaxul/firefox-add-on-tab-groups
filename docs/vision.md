# Vision

> Normative. What and why only — no implementation detail. Keep to ~1 page;
> this file is permanently loaded via CLAUDE.md. No status marker — foundation
> docs carry none.

## Problem

Panorama Tab Groups (PTG, last release 0.8.12, unmaintained since 2020-05) hides
the tabs of inactive groups and offers a compact popup to switch between them.
Since Firefox ships native tab groups, PTG breaks them: hiding a group leaves
empty native group labels in the tab strip that open nothing. Moving tabs between
groups works one tab at a time, and the tab context menu misses newly created
groups until it is refreshed.

## Why now

Native tab groups are in release Firefox. PTG users must choose between native
groups and hidden contexts. No maintained hide-based extension offers the PTG
popup model together with a migration that keeps the open tabs.

## Target users

- Primary: existing PTG users who want to keep their groups.
- Secondary: Firefox users with many tabs who want contexts hidden, not only
  collapsed.

## Goal

A Firefox extension that keeps many tab contexts ("groups") and shows exactly one
of them per window, switched through a compact popup. Users move any number of
selected tabs between groups in one action. Native Firefox tab groups survive
every group switch, and an existing PTG setup is taken over without reopening
tabs.

## USP / differentiation

The successor of PTG's popup: a compact two-level popup in current Firefox style,
in-place migration of PTG backups against the open tabs, native tab groups
preserved across group switches, multi-tab moves with an always-current menu, on
a small Manifest V3 codebase. The closest alternative, Simple Tab Groups, and
what we adopt from or avoid in it are recorded in `docs/prior-art.md`.

## Success criteria

- Migration: every tab of a PTG backup (format v1/v2) that matches an open tab by
  URL and order lands in its group, without opening new windows (test fixtures:
  100 % of matchable tabs).
- Native groups survive a group switch and a browser restart in the dissolved
  state with identical title, colour, collapsed state, and order.
- After a browser restart no tab has lost its group assignment (0 losses).
- A group switch in a window with 200 tabs completes in under 500 ms.
- N selected tabs move to another group with one context-menu action; a newly
  created group appears in the menu without any refresh.
- The popup follows Firefox's light/dark mode in current Firefox style.
- End of Phase 2: every feature of the PTG popup view is available.
- Every build passes `web-ext lint` with 0 errors and is signed (unlisted) on AMO.

## Scope

### In

- Global groups: each window shows exactly one group; a group is open in at most
  one window.
- Hiding and showing a group's tabs; new tabs join the window's active group.
- Dissolving and restoring native tab groups on group switch.
- Import of PTG backups (`panoramaView` v1/v2) and legacy "Tab Groups" backups,
  matched in place or opened in new windows.
- Export and re-import in an own backup format.
- Popup: group list and group detail with tab list, search, reorder, create,
  rename, close.
- Tab context menu: move selected tabs to a group or a new group.
- Keyboard shortcuts for next/previous group; toolbar badge.
- Light/dark theme in current Firefox style.

### Out

- The freeform Panorama view.
- Browsers other than Firefox.

## Non-goals

- Sync, container or proxy binding per group, URL rules — beyond a tab-grouping tool's job.
- Sidebar or full management page — the popup is the product.
- More shortcuts than next/previous group and opening the popup — keeps the surface small.
- Import formats other than PTG and legacy "Tab Groups" — migration targets PTG users only.
- Recovering Firefox "saved groups" — not reachable through the API; we prevent them instead.
- A per-window group model — groups are global.
