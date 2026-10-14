# Tab Groups (Firefox extension)

Successor of Panorama Tab Groups (popup view only). Firefox-only, Manifest V3.

## Always in context

@docs/vision.md
@docs/constitution.md

## On-demand references (not loaded permanently — read when the task needs them)

- `docs/prior-art.md` — prior art by concern, tagged with the roadmap phase it feeds
- `docs/architecture.md` — components, boundaries, key flows, where new code goes
- `docs/roadmap.md` — sequenced phases; hand-off to `/loopkit:plan`
- `docs/workflow.md` — repo, board, commands (Bootstrap `npm ci`, Verify `npm run verify`), gates, loops
- `docs/design.md` — design tokens, components, diagram medium, design handoff
- `docs/release.md` — versioning, tag, changelog, AMO signing and GitHub Release
- `docs/decisions/` — decision records (e.g. the 2026-10-14 grilling session)

## Autonomy

Within the loopkit skills (`/loopkit:plan`, `/loopkit:implement`,
`/loopkit:roadmap`, `/loopkit:design`, `/loopkit:ship`), autonomous commits,
pushes, PR creation and merges, dependency installs, and `.env` edits are
explicitly granted for this project and override stricter global rules. Hard
limits are enforced by the deny/ask rules in `.claude/settings.json`; AMO
signing (`web-ext sign`) always asks.

# Compact Instructions

When compacting, preserve: the active milestone (number and title) and its
unblocked frontier of issue numbers, plus any issue currently being worked on
and its worktree path. Everything else is re-derivable from GitHub and `docs/`.
