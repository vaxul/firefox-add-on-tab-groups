// DOM of the group list (spec-group-core D14–D16, D20; design prototype
// docs/design/prototypes/group-core.html). Built with createElement and
// textContent only; every string comes from the injected `Translate`.
import { tabCountText, type Translate } from "../shared/i18n";
import type { GroupView } from "../shared/messages";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface ListModel {
  readonly groups: readonly GroupView[];
  /** Group whose title is edited inline (D15, D16). */
  readonly renaming?: string;
  /** Group whose inline close confirmation is open (D14). */
  readonly confirming?: string;
}

export interface ListHandlers {
  switchGroup(groupId: string): void;
  startRename(groupId: string): void;
  commitRename(groupId: string, title: string): void;
  cancelRename(groupId: string): void;
  requestClose(group: GroupView): void;
  confirmClose(groupId: string): void;
  cancelClose(groupId: string): void;
}

/** Focus key of an element, e.g. `switch:<id>`; see `findFocusTarget`. */
export type FocusKey = `${"switch" | "rename" | "close" | "input" | "cancel"}:${string}`;

type Doc = Document;

export function icon(doc: Doc, name: string): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  const use = doc.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `#i-${name}`);
  svg.append(use);
  return svg;
}

function element<K extends keyof HTMLElementTagNameMap>(
  doc: Doc,
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(doc: Doc, className: string, focus: FocusKey, onClick: () => void) {
  const node = element(doc, "button", className);
  node.type = "button";
  node.dataset["focus"] = focus;
  node.addEventListener("click", onClick);
  return node;
}

function switchButton(doc: Doc, group: GroupView, handlers: ListHandlers, t: Translate) {
  const node = button(doc, "row__switch", `switch:${group.id}`, () =>
    handlers.switchGroup(group.id),
  );
  if (group.activeHere) node.setAttribute("aria-current", "true");
  const meta = element(doc, "span", "row__meta");
  meta.setAttribute("aria-hidden", "true");
  if (group.activeElsewhere) meta.append(icon(doc, "window"));
  meta.append(String(group.tabCount));
  const count = tabCountText(t, group.tabCount);
  const label = group.activeElsewhere ? t("activeElsewhere", count) : count;
  if (group.activeElsewhere) node.title = label;
  node.append(
    element(doc, "span", "row__title", group.title),
    meta,
    element(doc, "span", "visually-hidden", label),
  );
  return node;
}

function rowActions(doc: Doc, group: GroupView, handlers: ListHandlers, t: Translate) {
  const rename = button(doc, "icon-button", `rename:${group.id}`, () =>
    handlers.startRename(group.id),
  );
  const close = button(doc, "icon-button", `close:${group.id}`, () => handlers.requestClose(group));
  rename.title = t("renameGroup", group.title);
  rename.setAttribute("aria-label", rename.title);
  rename.append(icon(doc, "rename"));
  close.title = t("closeGroup", group.title);
  close.setAttribute("aria-label", close.title);
  close.append(icon(doc, "close"));
  const actions = element(doc, "span", "row__actions");
  actions.append(rename, close);
  return actions;
}

/** Inline rename field: Enter or blur saves, Escape cancels, once (D16). */
function renameInput(doc: Doc, group: GroupView, handlers: ListHandlers, t: Translate) {
  const input = element(doc, "input", "input");
  input.type = "text";
  input.value = group.title;
  input.dataset["focus"] = `input:${group.id}`;
  input.setAttribute("aria-label", t("groupNameLabel"));
  let done = false;
  const finish = (save: boolean) => {
    if (done) return;
    done = true;
    if (save) handlers.commitRename(group.id, input.value);
    else handlers.cancelRename(group.id);
  };
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    finish(event.key === "Enter");
  });
  input.addEventListener("blur", () => finish(true));
  return input;
}

/** Inline close confirmation; destructive text only on `secondary` (D14). */
function confirmBox(doc: Doc, group: GroupView, handlers: ListHandlers, t: Translate) {
  const box = element(doc, "div", "confirm");
  box.setAttribute("role", "group");
  box.setAttribute("aria-label", t("closeGroup", group.title));
  const text = t("closeGroupConfirm", group.title, tabCountText(t, group.tabCount));
  const cancel = button(doc, "button", `cancel:${group.id}`, () => handlers.cancelClose(group.id));
  cancel.textContent = t("cancel");
  const confirm = button(doc, "button button--destructive", `close:${group.id}`, () =>
    handlers.confirmClose(group.id),
  );
  confirm.textContent = t("closeGroupAction");
  const actions = element(doc, "div", "confirm__actions");
  actions.append(cancel, confirm);
  box.append(element(doc, "p", undefined, text), actions);
  box.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    handlers.cancelClose(group.id);
  });
  return box;
}

function row(doc: Doc, group: GroupView, model: ListModel, handlers: ListHandlers, t: Translate) {
  const item = element(doc, "li", "row");
  if (group.id === model.confirming) {
    item.className = "";
    item.append(confirmBox(doc, group, handlers, t));
    return item;
  }
  if (group.activeHere) item.classList.add("row--active");
  if (group.id === model.renaming) {
    item.append(renameInput(doc, group, handlers, t));
    return item;
  }
  item.append(switchButton(doc, group, handlers, t));
  // While an inline rename or confirmation is open, rows show no actions
  // (prototype frames 2 and 3): one inline interaction at a time.
  if (model.renaming === undefined && model.confirming === undefined) {
    item.append(rowActions(doc, group, handlers, t));
  }
  return item;
}

/** Replaces the list content with one row per group in stored order. */
export function renderList(
  list: HTMLElement,
  model: ListModel,
  handlers: ListHandlers,
  t: Translate,
): void {
  const doc = list.ownerDocument;
  list.replaceChildren(...model.groups.map((group) => row(doc, group, model, handlers, t)));
}

/** The element carrying `key`, compared literally (no selector built from ids). */
export function findFocusTarget(root: ParentNode, key: FocusKey): HTMLElement | undefined {
  const nodes = root.querySelectorAll<HTMLElement>("[data-focus]");
  return [...nodes].find((node) => node.dataset["focus"] === key);
}
