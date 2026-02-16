import { describe, expect, it } from "vitest";
import { getResumedActiveTurnId, getResumedTurnState } from "./threadRpc";

describe("threadRpc", () => {
  it("prefers explicit activeTurnId when present", () => {
    const state = getResumedTurnState({
      id: "thread-1",
      activeTurnId: "turn-explicit",
      turns: [{ id: "turn-old", status: "completed" }],
    });

    expect(state).toEqual({
      activeTurnId: "turn-explicit",
      activeTurnStartedAtMs: null,
      confidentNoActiveTurn: false,
    });
    expect(
      getResumedActiveTurnId({ id: "thread-1", activeTurnId: "turn-explicit" }),
    ).toBe("turn-explicit");
  });

  it("treats explicit empty active-turn fields as confidently idle", () => {
    const state = getResumedTurnState({
      id: "thread-1",
      active_turn_id: null,
      turns: [{ id: "turn-1", status: "inProgress" }],
    });

    expect(state).toEqual({
      activeTurnId: null,
      activeTurnStartedAtMs: null,
      confidentNoActiveTurn: true,
    });
  });

  it("detects active turns from waiting statuses and normalizes seconds timestamps", () => {
    const state = getResumedTurnState({
      id: "thread-1",
      turns: [{ id: "turn-live", status: "waiting_for_input", started_at: 1_700_000_000 }],
    });

    expect(state).toEqual({
      activeTurnId: "turn-live",
      activeTurnStartedAtMs: 1_700_000_000_000,
      confidentNoActiveTurn: false,
    });
  });

  it("marks completed-only turn snapshots as confidently idle", () => {
    const state = getResumedTurnState({
      id: "thread-1",
      turns: [
        { id: "turn-1", status: "completed" },
        { id: "turn-2", status: "cancelled" },
      ],
    });

    expect(state).toEqual({
      activeTurnId: null,
      activeTurnStartedAtMs: null,
      confidentNoActiveTurn: true,
    });
  });

  it("keeps confidence low when turn statuses are unknown", () => {
    const state = getResumedTurnState({
      id: "thread-1",
      turns: [{ id: "turn-1", status: "mystery" }],
    });

    expect(state).toEqual({
      activeTurnId: null,
      activeTurnStartedAtMs: null,
      confidentNoActiveTurn: false,
    });
  });
});
