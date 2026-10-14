---
kind: "both"
# Design tokens — the durable contract for the popup and options UI. Seeded from
# Firefox's Acorn design system (`toolkit/themes/shared/design-system/dist/
# tokens-shared.css`, base layer, read 2026-10-14). Colour values are
# light / dark pairs used via CSS `light-dark()`; they are a seed and are
# re-verified against the then-current Firefox tokens (incl. the "Nova"
# overrides) in Phase 6.
color:
  background: "#ffffff / #42414d"
  foreground: "#15141a / #fbfbfe"
  primary: "#0061e0 / #00ddff"
  secondary: "#f0f0f4 / #2b2a33"
  accent: "#0061e0 / #00ddff"
  muted: "#5b5b66 / #bfbfc9"
  border: "color-mix(in srgb, currentColor 24%, transparent)"
  destructive: "#c50042 / #ff848b"
type:
  font-sans: "system-ui"
  font-mono: "ui-monospace, monospace"
  scale: "12 / 13 / 15 / 17 px (popup base 13 px; Acorn large 1.133rem relative to it)"
  weights: "400 / 600 / 700"
  line-height: "1.4 body / 1.2 headings"
spacing:
  unit: "4px"
  scale: "2 / 4 / 8 / 12 / 16 / 24 / 32 px (Acorn --space-xxsmall … --space-xxlarge)"
radii:
  sm: "4px"
  md: "8px"
  lg: "16px"
  full: "9999px"
shadow:
  sm: "0 0 1px rgba(0,0,0,.15), 0 1px 2px rgba(0,0,0,.2)"
  md: "0 0.25px 0.75px rgba(0,0,0,.03), 0 2px 6px rgba(0,0,0,.05)"
---

# Design contract

> Design contract for the loopkit skills (`/loopkit:design`, `/loopkit:plan`,
> `/loopkit:implement`) — the single source for this project's design medium,
> rules, and handoff. The sibling of `docs/workflow.md`.

## Overview

The popup should feel like a part of Firefox, not like a web page: compact,
dense lists, Firefox's system font, the Acorn spacing and radius scale, and
Firefox's accent colour. It follows the browser's light/dark mode through
`color-scheme: light dark` and `light-dark()` tokens, and honours
`forced-colors` (high contrast) by falling back to system colours. Accessibility
target: WCAG 2.1 AA (contrast, full keyboard operation, visible focus). The
structure follows the Panorama Tab Groups popup — group list, then group detail —
not Simple Tab Groups' layout (see `docs/prior-art.md`).

## Design tool

- Tool: static HTML/CSS prototypes in the repo, built with the real tokens.
  Preview in Firefox (or as a Claude artifact) while iterating.
- The tool is the **editor, never the source of truth.** The durable design
  state is the committed files in this repo (see Durable form).
- Auth: in-session / subscription only — no headless run, no API key, no
  scheduler.

## Where designs live

- Source / working designs: `docs/design/prototypes/<feature>.html`.
- Committed tokens: this file's front-matter; the implementation mirrors them as
  CSS custom properties named after Acorn (`--space-small`, `--border-radius-medium`,
  …) in `src/shared/tokens.css`.
- Committed assets: `docs/design/assets/<feature>-light.png` and
  `docs/design/assets/<feature>-dark.png`.

## Diagram medium

- Medium: Mermaid (renders on GitHub, diffs cleanly).
- Where diagrams live: inline in the spec, or `docs/design/<topic>.md` when
  shared by several specs.
- Decisions it clarifies: group switch sequence (ungroup → hide → show →
  re-group), native-group state machine, startup reconciliation, migration
  matching.

## Durable form

The durable design form is **a file committed to this repo** — a tokens file,
an exported image, or a screenshot — referenced from the spec or the issue. An
external-tool URL (a Figma / v0 / Paper share link) is NOT a valid durable form:
the tool is the editor, the committed file is the state (constitution:
GitHub-only durable state). When `/loopkit:design` finishes, the design exists
as a committed file at the location above, not as a link.

## Review path

- Reviewer: an in-session Agent reviewer checking token usage, the
  accessibility target, and consistency with this contract.
- The design is reviewed **AT the spec-acceptance gate** as part of the spec
  package — never a separate stop after planning.

## Handoff format

- Format the implementer consumes: the committed HTML prototype plus light/dark
  screenshots referenced from the issue; tokens via `src/shared/tokens.css`.
- `/loopkit:implement` consumes the committed artifact referenced from the
  design-surface issue; it never reaches into an external tool.

## Components

- **Group row** — one line: group title, tab count, active marker (accent bar or
  check); states default / hover / active / focus-visible; height 32 px; padding
  `--space-small`; radius `sm`.
- **Tab row** (group detail) — favicon 16 px, title with ellipsis, close button
  on hover/focus; marks tabs that cannot be hidden (camera/microphone) with an
  icon and tooltip.
- **Icon button** — 24 × 24 px, transparent background, hover with `secondary`,
  focus ring 2 px `accent` with 2 px offset.
- **Text input** (search, rename) — full width, border `border`, radius `sm`,
  focus ring as icon button.
- **Destructive action** (close group) — text in `destructive`; confirmation
  inline, never a modal dialog.
- **Header / footer bar** — title or back navigation left, actions right;
  separated by a 1 px `border` line.

## Do's and Don'ts

**Do**

- Use the spacing scale above for every margin and padding.
- Meet WCAG 2.1 AA on every interactive element; every action reachable by
  keyboard.
- Reference only the named tokens — never a raw hex outside the tokens file.
- Check every screen in light, dark, and `forced-colors` mode.

**Don't**

- Introduce a colour, font, or radius not in the front-matter.
- Rely on `prefers-color-scheme` or `theme.getCurrent()` to pick colours; use
  `light-dark()` with `color-scheme`.
- Treat a share link as the design — commit the file.
- Add a third human gate — design is reviewed at spec-acceptance.
