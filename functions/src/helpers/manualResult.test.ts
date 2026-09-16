import { describe, expect, it } from "vitest";
import {
  buildManualStatusAndResult,
  computeSig,
  usesManualResult,
  validateManualResult,
} from "./manualResult";

describe("validateManualResult", () => {
  it("normalizes a halve to margin 0 / thru 18", () => {
    expect(validateManualResult({ winner: "AS" })).toEqual({ winner: "AS", margin: 0, thru: 18 });
    expect(validateManualResult({ winner: "AS", margin: 0, thru: 5 })).toEqual({ winner: "AS", margin: 0, thru: 18 });
  });

  it("rejects a halve with a margin", () => {
    expect(() => validateManualResult({ winner: "AS", margin: 2 })).toThrow(/no margin/);
  });

  it("defaults a bare win to 1 up thru 18", () => {
    expect(validateManualResult({ winner: "teamA" })).toEqual({ winner: "teamA", margin: 1, thru: 18 });
  });

  it("accepts real match-play closes", () => {
    expect(validateManualResult({ winner: "teamB", margin: 3, thru: 16 })).toEqual({ winner: "teamB", margin: 3, thru: 16 });
    expect(validateManualResult({ winner: "teamA", margin: 2, thru: 17 })).toEqual({ winner: "teamA", margin: 2, thru: 17 });
    expect(validateManualResult({ winner: "teamA", margin: 1, thru: 18 })).toEqual({ winner: "teamA", margin: 1, thru: 18 });
  });

  it("rejects margins that don't beat the holes remaining", () => {
    // 2&2 is impossible (2 up with 2 to play is dormie, not over)
    expect(() => validateManualResult({ winner: "teamA", margin: 2, thru: 16 })).toThrow(/holes remaining/);
    expect(() => validateManualResult({ winner: "teamA", margin: 1, thru: 16 })).toThrow(/holes remaining/);
    // 1 up with 1 to play is dormie, not a result
    expect(() => validateManualResult({ winner: "teamA", margin: 1, thru: 17 })).toThrow(/holes remaining/);
  });

  it("rejects impossible margins and bad inputs", () => {
    expect(() => validateManualResult({ winner: "teamA", margin: 19, thru: 18 })).toThrow(/impossible/);
    expect(() => validateManualResult({ winner: "teamA", margin: 0, thru: 18 })).toThrow(/at least 1/);
    expect(() => validateManualResult({ winner: "teamA", thru: 0 })).toThrow(/thru/);
    expect(() => validateManualResult({ winner: "teamA", thru: 16 })).toThrow(/margin/); // no default margin off 18
    expect(() => validateManualResult({ winner: "nobody" })).toThrow(/winner/);
    expect(() => validateManualResult(null)).toThrow(/winner/);
  });
});

describe("buildManualStatusAndResult", () => {
  it("closes the match for a win with the margin on the winner's side", () => {
    const { status, result } = buildManualStatusAndResult({ winner: "teamB", margin: 3, thru: 16 });
    expect(status).toMatchObject({ leader: "teamB", margin: 3, thru: 16, closed: true, dormie: false });
    expect(status.marginHistory).toEqual([]);
    expect(result).toEqual({ winner: "teamB", holesWonA: 0, holesWonB: 3 });
  });

  it("closes a halve with no leader", () => {
    const { status, result } = buildManualStatusAndResult({ winner: "AS", margin: 0, thru: 18 });
    expect(status).toMatchObject({ leader: null, margin: 0, thru: 18, closed: true });
    expect(result).toEqual({ winner: "AS", holesWonA: 0, holesWonB: 0 });
  });
});

describe("usesManualResult", () => {
  it("is true only when a manual result exists and no hole is scored", () => {
    expect(usesManualResult({ manualResult: { winner: "AS" } }, 0)).toBe(true);
    expect(usesManualResult({ manualResult: { winner: "AS" } }, 3)).toBe(false);
    expect(usesManualResult({}, 0)).toBe(false);
  });
});

describe("computeSig", () => {
  it("changes when the manual result changes but ignores audit fields", () => {
    const holes = { "1": { input: { teamAPlayerGross: null, teamBPlayerGross: null } } };
    const a = computeSig({ holes });
    const b = computeSig({ holes, manualResult: { winner: "teamA", margin: 2, thru: 17 } });
    const c = computeSig({ holes, manualResult: { winner: "teamA", margin: 2, thru: 17, setBy: "x", setAt: 123 } });
    const d = computeSig({ holes, manualResult: { winner: "AS", margin: 0, thru: 18 } });
    expect(a).not.toBe(b);
    expect(b).toBe(c);
    expect(b).not.toBe(d);
  });

  it("still changes with the holes", () => {
    expect(computeSig({ holes: { "1": {} } })).not.toBe(computeSig({ holes: { "2": {} } }));
  });
});
