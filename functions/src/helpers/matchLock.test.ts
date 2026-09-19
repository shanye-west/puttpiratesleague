import { describe, expect, it } from "vitest";
import { isMatchFinished, justFinished, nextRoundLock } from "./matchLock";

describe("isMatchFinished", () => {
  it("is true for a completed card", () => {
    expect(isMatchFinished({ completed: true, status: { closed: true } })).toBe(true);
  });

  it("is false for a match decided early with holes still to enter", () => {
    expect(isMatchFinished({ status: { closed: true } })).toBe(false);
  });

  it("is true for a closed admin-entered result", () => {
    expect(isMatchFinished({ manualResult: { winner: "teamA" }, status: { closed: true } })).toBe(true);
  });

  it("is false for a manual result the trigger hasn't closed yet", () => {
    expect(isMatchFinished({ manualResult: { winner: "teamA" }, status: { closed: false } })).toBe(false);
  });

  it("is false for a missing match", () => {
    expect(isMatchFinished(undefined)).toBe(false);
    expect(isMatchFinished(null)).toBe(false);
  });
});

describe("justFinished", () => {
  it("fires on the write that completes the card", () => {
    expect(justFinished({ status: { closed: true } }, { completed: true, status: { closed: true } })).toBe(true);
  });

  it("does not fire again on later writes to a finished match (admin unlock sticks)", () => {
    const done = { completed: true, status: { closed: true } };
    expect(justFinished(done, { ...done, locked: false } as never)).toBe(false);
  });

  it("does not fire while the match is still open", () => {
    expect(justFinished({ status: { closed: false } }, { status: { closed: true } })).toBe(false);
  });

  it("fires again when a cleared manual result is re-entered", () => {
    expect(justFinished({ status: { closed: false } }, { manualResult: { winner: "AS" }, status: { closed: true } })).toBe(true);
  });
});

describe("nextRoundLock", () => {
  it("locks the month when its last open match locks", () => {
    expect(nextRoundLock(true, true, false)).toBe(true);
  });

  it("leaves the month open while other matches are unlocked", () => {
    expect(nextRoundLock(true, false, false)).toBeNull();
  });

  it("unlocks the month when a match is unlocked and the rest are locked", () => {
    expect(nextRoundLock(false, true, true)).toBe(false);
  });

  it("keeps an admin-locked month with unplayed matches locked", () => {
    expect(nextRoundLock(false, false, true)).toBeNull();
  });

  it("is a no-op when the month already matches", () => {
    expect(nextRoundLock(true, true, true)).toBeNull();
    expect(nextRoundLock(false, true, false)).toBeNull();
  });
});
