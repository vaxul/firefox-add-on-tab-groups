# Constitution

> Normative and binding. Every principle must be verifiable and specific.
> Keep to ~1 page; this file is permanently loaded via CLAUDE.md. No status
> marker — foundation docs carry none.

## Tech stack

| Area | Choice | Rationale |
| ---- | ------ | --------- |
| Platform | Firefox WebExtension, Manifest V3, `strict_min_version` `140.0` (current ESR), `gecko_android` `142.0` | Firefox-only; `tabGroups` exists from 139; AMO-required `data_collection_permissions` is supported from 140 (Android 142) |
| Background | `background.scripts` as non-persistent event page | MV3 in Firefox; no memory held between events |
| Language | TypeScript, `strict: true` | typed browser APIs, safer refactors |
| Bundler | esbuild | fast, near-zero config |
| UI | plain DOM, no framework | small codebase, no runtime dependencies |
| API types | `@types/firefox-webext-browser` | covers `tabGroups`, `tabs.hide`, `sessions` |
| Tests | vitest with own in-memory fakes of `tabs`, `sessions`, `tabGroups`, `windows`, `storage`; E2E later via `selenium-webdriver` (WebDriver BiDi) | no maintained fake library covers `sessions`/`tabGroups` |
| Extension tooling | `web-ext` (lint, run, build, sign) | Mozilla's reference tooling |
| Lint / format | ESLint (typescript-eslint, flat config) + Prettier | enforces the limits below |
| Package manager | npm with committed `package-lock.json` | reproducible installs |
| License | MPL-2.0 | allows reuse of PTG code and locales |

## Architecture principles

- The background holds no mutable module-level state. Every event handler reads
  what it needs from `storage.local` (global group list) or `sessions` tab/window
  values (tab → group membership, native-group records) at its start.
- Every state-changing operation runs through one serialising operation queue.
  Browser events that arrive while an own operation runs are deferred and
  re-evaluated against re-read state afterwards.
- Domain logic lives in `src/core/` and never touches `browser`:
  `grep -rn "browser\." src/core` returns nothing.
- A native `groupId` is never persisted; native groups are identified by an own
  stable key stored per tab via `sessions.setTabValue`.
- Hiding a group: `tabs.ungroup` before `tabs.hide`. Showing a group: `tabs.show`
  before `tabs.group`. Tabs of a native group are ungrouped before `tabs.remove`.
- Max function length 50 lines, max file length 400 lines (ESLint
  `max-lines-per-function`, `max-lines`).
- Persisted data carries a schema version; every version bump ships a migration
  function with a unit test.
- No `innerHTML`, `outerHTML`, or `insertAdjacentHTML` (ESLint
  `no-restricted-properties`); DOM is built with `createElement` + `textContent`.
- Search matches literally; no `RegExp` is built from user input.

## Conventions

- Code, comments, identifiers, and commit messages in English; commits follow
  Conventional Commits.
- Every user-facing string goes through `browser.i18n`; locales `en` and `de`
  are kept complete.
- File names in kebab-case; tests as `*.test.ts` next to the source file.

## Quality gates

- `npm run verify` is green: `tsc --noEmit`, ESLint, Prettier check, vitest,
  `web-ext lint`.
- Line coverage of `src/core/` is at least 80 % (vitest coverage threshold).
- Every bug fix adds a regression test that fails without the fix.
- Every new manifest permission is justified in the spec that introduces it.

## Don'ts

- No runtime `dependencies` in `package.json` — only `devDependencies`.
- No UI framework, no `webextension-polyfill`, no Chrome compatibility layer.
- No remote code, no `eval`/`new Function`, no network requests; the manifest
  declares `data_collection_permissions` `required: ["none"]`.
- No persistent background page and no in-memory cache that outlives an event.
