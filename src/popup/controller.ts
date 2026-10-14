// Popup behaviour (spec-group-core D14–D16, D20, D21): sends one request per
// user action, re-renders from each response, and keeps the inline rename or
// close confirmation and the keyboard focus across re-renders. The popup page
// is short-lived; its view state lives in a per-popup session object, not in
// the background.
import type { Translate } from "../shared/i18n";
import type { GroupView, OkResponse, Request, Response } from "../shared/messages";
import {
  findFocusTarget,
  renderList,
  renderRow,
  type FocusKey,
  type ListHandlers,
  type ListModel,
} from "./view";

/** Distributes `Omit` over the request union. */
type WithoutWindow<T> = T extends unknown ? Omit<T, "windowId"> : never;
export type PopupRequest = WithoutWindow<Request>;

export interface PopupDeps {
  readonly list: HTMLElement;
  readonly newGroupButton: HTMLButtonElement;
  readonly windowId: number;
  readonly send: (request: Request) => Promise<Response>;
  /** Closes the popup after a switch (D20). */
  readonly close: () => void;
  readonly t: Translate;
}

export interface Popup {
  /** Loads the state and renders it; resolves when rendered. */
  start(): Promise<void>;
  /** Resolves once every action started so far is answered and rendered. */
  idle(): Promise<void>;
}

/**
 * What to do after an action: focus an element after a full render ("new" =
 * the "New group" button), render without moving focus (`undefined`), or
 * re-render only one row and leave focus alone (`{ row }`).
 */
type Focus = FocusKey | "new" | undefined | { readonly row: string };

interface ViewState {
  groups: readonly GroupView[];
  renaming?: string;
  confirming?: string;
}

class Session {
  readonly view: ViewState = { groups: [] };
  readonly handlers: ListHandlers = createHandlers(this);
  private pending: Promise<unknown> = Promise.resolve();

  constructor(readonly deps: PopupDeps) {}

  /**
   * Sends one request and applies its state. On failure it logs the error,
   * drops the inline mode, applies a fresh state (D21), and returns `undefined`.
   */
  async request(message: PopupRequest): Promise<OkResponse | undefined> {
    const { send, windowId } = this.deps;
    try {
      const response = await send({ ...message, windowId } as Request);
      if (response.ok) {
        this.view.groups = response.state.groups;
        return response;
      }
      console.error("Tab Groups:", message.type, response.error);
    } catch (error) {
      console.error("Tab Groups:", message.type, error);
    }
    this.view.renaming = undefined;
    this.view.confirming = undefined;
    try {
      const fresh = await send({ type: "getState", windowId });
      if (fresh.ok) this.view.groups = fresh.state.groups;
    } catch (error) {
      console.error("Tab Groups: getState", error);
    }
    return undefined;
  }

  /** Runs `action` after earlier ones, then renders with its focus. */
  run(action: () => Promise<Focus>): void {
    this.pending = this.pending.then(action).then(
      (focus) => this.render(focus),
      (error: unknown) => console.error("Tab Groups:", error),
    );
  }

  idle(): Promise<unknown> {
    return this.pending;
  }

  render(focus?: Focus): void {
    const model: ListModel = this.view;
    if (typeof focus === "object") {
      renderRow(this.deps.list, focus.row, model, this.handlers, this.deps.t);
      return;
    }
    renderList(this.deps.list, model, this.handlers, this.deps.t);
    if (focus === "new") this.deps.newGroupButton.focus();
    else if (focus !== undefined) this.focus(focus);
  }

  private focus(key: FocusKey): void {
    const target = findFocusTarget(this.deps.list, key);
    target?.focus();
    if (target instanceof HTMLInputElement) target.select();
  }
}

/** Focus after a close: the row now at the closed row's position, else "New group". */
function focusAfterClose(groups: readonly GroupView[], index: number): Focus {
  const next = groups[Math.min(index, groups.length - 1)];
  return next === undefined ? "new" : `switch:${next.id}`;
}

function closeGroup(session: Session, groupId: string): void {
  session.run(async () => {
    const index = session.view.groups.findIndex((group) => group.id === groupId);
    session.view.confirming = undefined;
    await session.request({ type: "closeGroup", groupId });
    return focusAfterClose(session.view.groups, index);
  });
}

/**
 * Focus after a rename: Enter (no `next`) returns focus to the row; a blur
 * into the list re-renders only the renamed row, so the click that caused the
 * blur still lands; a blur elsewhere leaves focus where the user moved it.
 */
function afterRename(session: Session, groupId: string, next: Element | null): Focus {
  if (next === null) return `switch:${groupId}`;
  return session.deps.list.contains(next) ? { row: groupId } : undefined;
}

function commitRename(session: Session, groupId: string, title: string, next: Element | null) {
  const { view } = session;
  view.renaming = undefined;
  const trimmed = title.trim();
  const current = view.groups.find((group) => group.id === groupId)?.title;
  const focus = afterRename(session, groupId, next);
  // D16: an empty title keeps the old one; an unchanged title sends nothing.
  if (trimmed === "" || trimmed === current) {
    session.render(focus);
    return;
  }
  session.run(async () => {
    const response = await session.request({ type: "renameGroup", groupId, title: trimmed });
    return response === undefined && typeof focus === "object" ? undefined : focus;
  });
}

function createHandlers(session: Session): ListHandlers {
  const { view } = session;
  return {
    switchGroup(groupId) {
      session.run(async () => {
        // D20: the popup closes after a switch; on failure it shows fresh state.
        if (await session.request({ type: "switchGroup", groupId })) session.deps.close();
        return `switch:${groupId}`;
      });
    },
    startRename(groupId) {
      view.renaming = groupId;
      view.confirming = undefined;
      session.render(`input:${groupId}`);
    },
    commitRename: (groupId, title, next) => commitRename(session, groupId, title, next),
    cancelRename(groupId) {
      view.renaming = undefined;
      session.render(`switch:${groupId}`);
    },
    requestClose(group) {
      // D14: only a group with tabs asks for confirmation.
      if (group.tabCount === 0) return closeGroup(session, group.id);
      view.confirming = group.id;
      session.render(`cancel:${group.id}`);
    },
    confirmClose: (groupId) => closeGroup(session, groupId),
    cancelClose(groupId) {
      view.confirming = undefined;
      session.render(`close:${groupId}`);
    },
  };
}

/** D15: "New group" appends a group and opens its inline rename, no switch. */
function createGroup(session: Session): void {
  session.run(async () => {
    const created = (await session.request({ type: "createGroup" }))?.createdGroupId;
    session.view.renaming = created;
    return created === undefined ? "new" : `input:${created}`;
  });
}

export function createPopup(deps: PopupDeps): Popup {
  const session = new Session(deps);
  deps.newGroupButton.addEventListener("click", () => createGroup(session));
  return {
    async start() {
      session.run(async () => {
        await session.request({ type: "getState" });
        return undefined;
      });
      await session.idle();
    },
    idle: async () => {
      await session.idle();
    },
  };
}
