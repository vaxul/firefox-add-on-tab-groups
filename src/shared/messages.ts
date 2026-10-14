// Typed message contract between the popup and the background
// (spec-group-core D20, D21). Every request carries the window the popup
// belongs to; every response is either the fresh popup state or an error.

export interface GroupView {
  readonly id: string;
  readonly title: string;
  /** Non-pinned tabs with this membership in all windows, hidden ones included (D21). */
  readonly tabCount: number;
  /** The group is the active group of the request's window. */
  readonly activeHere: boolean;
  /** The group is the active group of another window. */
  readonly activeElsewhere: boolean;
}

export interface PopupState {
  /** All groups in stored order. */
  readonly groups: readonly GroupView[];
}

export type Request =
  | { readonly type: "getState"; readonly windowId: number }
  | { readonly type: "switchGroup"; readonly windowId: number; readonly groupId: string }
  | { readonly type: "createGroup"; readonly windowId: number }
  | {
      readonly type: "renameGroup";
      readonly windowId: number;
      readonly groupId: string;
      readonly title: string;
    }
  | { readonly type: "closeGroup"; readonly windowId: number; readonly groupId: string };

export type RequestType = Request["type"];

export interface OkResponse {
  readonly ok: true;
  readonly state: PopupState;
  /** Set only in the response to `createGroup` (D15 inline rename). */
  readonly createdGroupId?: string;
}

export interface ErrorResponse {
  readonly ok: false;
  readonly error: string;
}

export type Response = OkResponse | ErrorResponse;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasGroupId(message: Record<string, unknown>): boolean {
  return typeof message["groupId"] === "string";
}

/** Validates an incoming message against the request contract. */
export function isRequest(message: unknown): message is Request {
  if (!isRecord(message) || !Number.isInteger(message["windowId"])) return false;
  switch (message["type"]) {
    case "getState":
    case "createGroup":
      return true;
    case "switchGroup":
    case "closeGroup":
      return hasGroupId(message);
    case "renameGroup":
      return hasGroupId(message) && typeof message["title"] === "string";
    default:
      return false;
  }
}
