# Tab Groups — Roadmap

> Living document: the sequenced queue of phases. The hand-off to `/plan`, which
> picks the next phase, creates its spec + issues, and links them back here.
> No status markers — progress lives in the GitHub issues and milestones each
> phase links to. Specs (created by `/plan`) carry no lifecycle state either;
> a spec is "accepted" once merged on the default branch with a milestone and
> issues.

## Phase overview

| Phase | Name | Spec | Milestone |
|---|---|---|---|
| 1 | Foundation and group core — project scaffold (build, Verify, fakes), global groups, hide/show, new tabs join the active group, restore after restart, minimal popup (list, switch, create, rename, close incl. last/empty group), badge and tooltip | — | — |
| 2 | Native tab groups — dissolve on hide and restore on show, persist native-group state per tab, "first tab wins" conflict rule, no event feedback loop | — | — |
| 3 | Move tabs between groups — tab context menu moves all selected tabs to an existing or new group; group list always current | — | — |
| 4 | Migration — import PTG `panoramaView` v1/v2 and legacy "Tab Groups" backups, matched in place against open tabs or opened in new windows | — | — |
| 5 | Popup parity — group detail with tab list, literal search, drag-and-drop group order, next/previous group shortcuts | — | — |
| 6 | Theme and own backup — light/dark theme in current Firefox style, export/import in own backup format v1 | — | — |

A phase gets a Spec link once `/plan` drafts it, and a Milestone link once the
spec is merged. The milestone (open/closed + issue progress) is where status
lives. Phase 4 completes the migration path; it is the natural point for the
first signed unlisted release. Further extensions are seeded later via
`/loopkit:roadmap`.

## North star

Panorama Tab Groups users move to a maintained successor with a compact popup
without losing a single tab or native tab group.
