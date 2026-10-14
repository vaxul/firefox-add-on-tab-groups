// Popup message handlers (spec-group-core D14, D15, D16, D20, D21, D22).
// Each request runs as one locked operation and answers with fresh state.
import { planClose } from "../core/close";
import { createGroup, renameGroup, type GroupDeps } from "../core/groups";
import type { GroupLayout } from "../core/layout";
import { activeGroupOf, memberOf, type PlannerState } from "../core/planner-state";
import { planSwitch } from "../core/switch";
import { applyClose, applySwitch } from "../platform/executor";
import { saveLayout } from "../platform/group-store";
import { refreshIndicators } from "../platform/indicators";
import { readPlannerState } from "../platform/tab-meta";
import {
  isRequest,
  type GroupView,
  type OkResponse,
  type PopupState,
  type Request,
  type Response,
} from "../shared/messages";
import { requireLayout, runOperation, type Context } from "./operation";

/** Builds the popup state for `windowId` from a planner snapshot (D20, D21). */
export function popupState(state: PlannerState, windowId: number): PopupState {
  const counts = new Map<string, number>();
  for (const tab of state.tabs) {
    const groupId = memberOf(state, tab);
    if (groupId !== undefined) counts.set(groupId, (counts.get(groupId) ?? 0) + 1);
  }
  const owners = new Map<string, number[]>();
  for (const window of state.windows) {
    const groupId = activeGroupOf(state, window);
    if (groupId !== undefined) owners.set(groupId, [...(owners.get(groupId) ?? []), window.id]);
  }
  const groups = state.layout.groups.map(({ id, title }): GroupView => {
    const windows = owners.get(id) ?? [];
    return {
      id,
      title,
      tabCount: counts.get(id) ?? 0,
      activeHere: windows.includes(windowId),
      activeElsewhere: windows.some((other) => other !== windowId),
    };
  });
  return { groups };
}

async function respond(windowId: number, createdGroupId?: string): Promise<OkResponse> {
  const state = popupState(await readPlannerState(await requireLayout()), windowId);
  return createdGroupId === undefined ? { ok: true, state } : { ok: true, state, createdGroupId };
}

async function changeLayout(layout: GroupLayout, next: GroupLayout): Promise<void> {
  if (next === layout) return;
  await saveLayout(next);
  await refreshIndicators(next);
}

/** Applies one request; returns the id of a created group, if any. */
async function apply(deps: GroupDeps, request: Request): Promise<string | undefined> {
  const layout = await requireLayout();
  switch (request.type) {
    case "getState":
      return undefined;
    case "createGroup": {
      const created = createGroup(layout, deps);
      await changeLayout(layout, created.layout);
      return created.group.id;
    }
    case "renameGroup":
      await changeLayout(layout, renameGroup(layout, request.groupId, request.title));
      return undefined;
    case "switchGroup": {
      const state = await readPlannerState(layout);
      await applySwitch(planSwitch(state, request.windowId, request.groupId));
      break;
    }
    case "closeGroup": {
      const state = await readPlannerState(layout);
      await applyClose(planClose(state, request.groupId, deps));
      break;
    }
  }
  await refreshIndicators(await requireLayout());
  return undefined;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Handles one popup message (D20, D21): `{ ok: true, state }` with the fresh
 * popup state, or `{ ok: false, error }`. A failed request is reconciled for
 * all windows, since a switch or close can touch tabs in any window (D5).
 */
export async function handleMessage(ctx: Context, message: unknown): Promise<Response> {
  if (!isRequest(message)) return { ok: false, error: "Invalid message" };
  try {
    return await runOperation(ctx, "all", async () => {
      const createdGroupId = await apply(ctx.deps, message);
      return respond(message.windowId, createdGroupId);
    });
  } catch (error) {
    return { ok: false, error: errorText(error) };
  }
}
