/**
 * Unit tests for matchHelpers.ts
 */

import { describe, it, expect } from "vitest";
import {
  playersPerSide,
  emptyHolesFor,
  defaultStatus,
  zeros18,
  ensureSideSize,
  normalizeHoles,
  holeHasScore,
  countScoredHoles,
} from "./matchHelpers.js";
import type { RoundFormat } from "../types.js";

// --- playersPerSide tests ---

describe("playersPerSide", () => {
  it("returns 1 for singles format", () => {
    expect(playersPerSide("singles")).toBe(1);
  });

  it("returns 2 for twoManBestBall format", () => {
    expect(playersPerSide("twoManBestBall")).toBe(2);
  });

  it("returns 2 for twoManShamble format", () => {
    expect(playersPerSide("twoManShamble")).toBe(2);
  });

  it("returns 2 for twoManScramble format", () => {
    expect(playersPerSide("twoManScramble")).toBe(2);
  });
});

// --- zeros18 tests ---

describe("zeros18", () => {
  it("returns array of exactly 18 elements", () => {
    expect(zeros18()).toHaveLength(18);
  });

  it("returns all zeros", () => {
    const arr = zeros18();
    expect(arr.every(v => v === 0)).toBe(true);
  });

  it("returns new array each call (no mutation risk)", () => {
    const arr1 = zeros18();
    const arr2 = zeros18();
    expect(arr1).not.toBe(arr2);
    arr1[0] = 999;
    expect(arr2[0]).toBe(0);
  });
});

// --- defaultStatus tests ---

describe("defaultStatus", () => {
  it("returns correct initial status object", () => {
    const status = defaultStatus();
    expect(status).toEqual({
      leader: null,
      margin: 0,
      thru: 0,
      dormie: false,
      closed: false,
    });
  });

  it("returns new object each call", () => {
    const s1 = defaultStatus();
    const s2 = defaultStatus();
    expect(s1).not.toBe(s2);
  });
});

// --- emptyHolesFor tests ---

describe("emptyHolesFor", () => {
  it("creates 18 holes for all formats", () => {
    const formats: RoundFormat[] = ["singles", "twoManBestBall", "twoManShamble", "twoManScramble"];
    for (const format of formats) {
      const holes = emptyHolesFor(format);
      expect(Object.keys(holes)).toHaveLength(18);
      for (let i = 1; i <= 18; i++) {
        expect(holes[String(i)]).toBeDefined();
      }
    }
  });

  describe("singles format", () => {
    it("has teamAPlayerGross and teamBPlayerGross fields", () => {
      const holes = emptyHolesFor("singles");
      const input = holes["1"].input;
      expect(input).toHaveProperty("teamAPlayerGross", null);
      expect(input).toHaveProperty("teamBPlayerGross", null);
    });

    it("does NOT have drive tracking fields", () => {
      const holes = emptyHolesFor("singles");
      const input = holes["1"].input;
      expect(input).not.toHaveProperty("teamADrive");
      expect(input).not.toHaveProperty("teamBDrive");
    });

    it("does NOT have player arrays", () => {
      const holes = emptyHolesFor("singles");
      const input = holes["1"].input;
      expect(input).not.toHaveProperty("teamAPlayersGross");
      expect(input).not.toHaveProperty("teamBPlayersGross");
    });
  });

  describe("twoManScramble format", () => {
    it("has team gross fields", () => {
      const holes = emptyHolesFor("twoManScramble");
      const input = holes["1"].input;
      expect(input).toHaveProperty("teamAGross", null);
      expect(input).toHaveProperty("teamBGross", null);
    });

    it("has drive tracking fields", () => {
      const holes = emptyHolesFor("twoManScramble");
      const input = holes["1"].input;
      expect(input).toHaveProperty("teamADrive", null);
      expect(input).toHaveProperty("teamBDrive", null);
    });

    it("does NOT have player arrays", () => {
      const holes = emptyHolesFor("twoManScramble");
      const input = holes["1"].input;
      expect(input).not.toHaveProperty("teamAPlayersGross");
      expect(input).not.toHaveProperty("teamBPlayersGross");
    });
  });

  describe("twoManShamble format", () => {
    it("has player arrays with 2 nulls each", () => {
      const holes = emptyHolesFor("twoManShamble");
      const input = holes["1"].input;
      expect(input.teamAPlayersGross).toEqual([null, null]);
      expect(input.teamBPlayersGross).toEqual([null, null]);
    });

    it("has drive tracking fields", () => {
      const holes = emptyHolesFor("twoManShamble");
      const input = holes["1"].input;
      expect(input).toHaveProperty("teamADrive", null);
      expect(input).toHaveProperty("teamBDrive", null);
    });
  });

  describe("twoManBestBall format", () => {
    it("has player arrays with 2 nulls each", () => {
      const holes = emptyHolesFor("twoManBestBall");
      const input = holes["1"].input;
      expect(input.teamAPlayersGross).toEqual([null, null]);
      expect(input.teamBPlayersGross).toEqual([null, null]);
    });

    it("does NOT have drive tracking fields", () => {
      const holes = emptyHolesFor("twoManBestBall");
      const input = holes["1"].input;
      expect(input).not.toHaveProperty("teamADrive");
      expect(input).not.toHaveProperty("teamBDrive");
    });
  });
});

// --- ensureSideSize tests ---

describe("ensureSideSize", () => {
  describe("creates new players when needed", () => {
    it("handles null input", () => {
      const result = ensureSideSize(null, 2);
      expect(result).toHaveLength(2);
      expect(result[0].playerId).toBe("");
      expect(result[0].strokesReceived).toHaveLength(18);
    });

    it("handles undefined input", () => {
      const result = ensureSideSize(undefined, 2);
      expect(result).toHaveLength(2);
    });

    it("handles non-array input", () => {
      const result = ensureSideSize({ not: "an array" }, 2);
      expect(result).toHaveLength(2);
    });
  });

  describe("pads short arrays", () => {
    it("pads array with 1 player to 2", () => {
      const input = [{ playerId: "p1", strokesReceived: Array(18).fill(1) }];
      const result = ensureSideSize(input, 2);
      
      expect(result).toHaveLength(2);
      expect(result[0].playerId).toBe("p1");
      expect(result[0].strokesReceived).toEqual(Array(18).fill(1));
      expect(result[1].playerId).toBe("");
      expect(result[1].strokesReceived).toEqual(Array(18).fill(0));
    });

    it("pads empty array", () => {
      const result = ensureSideSize([], 2);
      expect(result).toHaveLength(2);
      expect(result[0].playerId).toBe("");
      expect(result[1].playerId).toBe("");
    });
  });

  describe("trims long arrays", () => {
    it("trims array with 3 players to 2", () => {
      const input = [
        { playerId: "p1", strokesReceived: Array(18).fill(0) },
        { playerId: "p2", strokesReceived: Array(18).fill(0) },
        { playerId: "p3", strokesReceived: Array(18).fill(0) },
      ];
      const result = ensureSideSize(input, 2);
      
      expect(result).toHaveLength(2);
      expect(result[0].playerId).toBe("p1");
      expect(result[1].playerId).toBe("p2");
    });

    it("trims to 1 for singles", () => {
      const input = [
        { playerId: "p1", strokesReceived: Array(18).fill(0) },
        { playerId: "p2", strokesReceived: Array(18).fill(0) },
      ];
      const result = ensureSideSize(input, 1);
      
      expect(result).toHaveLength(1);
      expect(result[0].playerId).toBe("p1");
    });
  });

  describe("validates strokesReceived", () => {
    it("replaces invalid strokesReceived with zeros", () => {
      const input = [{ playerId: "p1", strokesReceived: "not an array" }];
      const result = ensureSideSize(input, 1);
      
      expect(result[0].strokesReceived).toEqual(Array(18).fill(0));
    });

    it("replaces short strokesReceived with zeros", () => {
      const input = [{ playerId: "p1", strokesReceived: [1, 0, 1] }]; // Only 3 elements
      const result = ensureSideSize(input, 1);
      
      expect(result[0].strokesReceived).toHaveLength(18);
      expect(result[0].strokesReceived).toEqual(Array(18).fill(0));
    });

    it("replaces null strokesReceived with zeros", () => {
      const input = [{ playerId: "p1", strokesReceived: null }];
      const result = ensureSideSize(input, 1);
      
      expect(result[0].strokesReceived).toEqual(Array(18).fill(0));
    });

    it("preserves valid 18-element strokesReceived", () => {
      const strokes = [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0];
      const input = [{ playerId: "p1", strokesReceived: strokes }];
      const result = ensureSideSize(input, 1);
      
      expect(result[0].strokesReceived).toEqual(strokes);
    });
  });

  describe("validates playerId", () => {
    it("replaces non-string playerId with empty string", () => {
      const input = [{ playerId: 123, strokesReceived: Array(18).fill(0) }];
      const result = ensureSideSize(input, 1);
      
      expect(result[0].playerId).toBe("");
    });

    it("replaces null playerId with empty string", () => {
      const input = [{ playerId: null, strokesReceived: Array(18).fill(0) }];
      const result = ensureSideSize(input, 1);
      
      expect(result[0].playerId).toBe("");
    });

    it("preserves valid string playerId", () => {
      const input = [{ playerId: "player123", strokesReceived: Array(18).fill(0) }];
      const result = ensureSideSize(input, 1);
      
      expect(result[0].playerId).toBe("player123");
    });
  });
});

// --- normalizeHoles tests ---

describe("normalizeHoles", () => {
  describe("handles missing/invalid input", () => {
    it("creates fresh structure from undefined", () => {
      const result = normalizeHoles(undefined, "singles");
      expect(Object.keys(result)).toHaveLength(18);
      expect(result["1"].input.teamAPlayerGross).toBeNull();
    });

    it("creates fresh structure from empty object", () => {
      const result = normalizeHoles({}, "singles");
      expect(Object.keys(result)).toHaveLength(18);
    });

    it("replaces non-object hole entries", () => {
      const result = normalizeHoles({ "1": "invalid", "2": null }, "singles");
      expect(result["1"].input).toBeDefined();
      expect(result["2"].input).toBeDefined();
    });
  });

  describe("singles format normalization", () => {
    it("preserves existing singles scores", () => {
      const existing = {
        "1": { input: { teamAPlayerGross: 4, teamBPlayerGross: 5 } },
      };
      const result = normalizeHoles(existing, "singles");
      
      expect(result["1"].input.teamAPlayerGross).toBe(4);
      expect(result["1"].input.teamBPlayerGross).toBe(5);
    });

    it("migrates from bestBall format (uses first player score)", () => {
      const existing = {
        "1": { input: { teamAPlayersGross: [4, 5], teamBPlayersGross: [3, 6] } },
      };
      const result = normalizeHoles(existing, "singles");
      
      expect(result["1"].input.teamAPlayerGross).toBe(4);
      expect(result["1"].input.teamBPlayerGross).toBe(3);
    });

    it("removes drive tracking fields", () => {
      const existing = {
        "1": { input: { teamAPlayerGross: 4, teamBPlayerGross: 5, teamADrive: 0, teamBDrive: 1 } },
      };
      const result = normalizeHoles(existing, "singles");
      
      expect(result["1"].input).not.toHaveProperty("teamADrive");
      expect(result["1"].input).not.toHaveProperty("teamBDrive");
    });
  });

  describe("scramble format normalization", () => {
    it("preserves team gross and drive fields", () => {
      const existing = {
        "1": { input: { teamAGross: 4, teamBGross: 5, teamADrive: 0, teamBDrive: 1 } },
      };
      const result = normalizeHoles(existing, "twoManScramble");
      
      expect(result["1"].input.teamAGross).toBe(4);
      expect(result["1"].input.teamBGross).toBe(5);
      expect(result["1"].input.teamADrive).toBe(0);
      expect(result["1"].input.teamBDrive).toBe(1);
    });

    it("defaults missing drive fields to null", () => {
      const existing = {
        "1": { input: { teamAGross: 4, teamBGross: 5 } },
      };
      const result = normalizeHoles(existing, "twoManScramble");
      
      expect(result["1"].input.teamADrive).toBeNull();
      expect(result["1"].input.teamBDrive).toBeNull();
    });
  });

  describe("shamble format normalization", () => {
    it("preserves player arrays and drive fields", () => {
      const existing = {
        "1": { input: { teamAPlayersGross: [4, 5], teamBPlayersGross: [3, 6], teamADrive: 0, teamBDrive: 1 } },
      };
      const result = normalizeHoles(existing, "twoManShamble");
      
      expect(result["1"].input.teamAPlayersGross).toEqual([4, 5]);
      expect(result["1"].input.teamBPlayersGross).toEqual([3, 6]);
      expect(result["1"].input.teamADrive).toBe(0);
      expect(result["1"].input.teamBDrive).toBe(1);
    });

    it("normalizes short player arrays to 2 elements", () => {
      const existing = {
        "1": { input: { teamAPlayersGross: [4], teamBPlayersGross: [] } },
      };
      const result = normalizeHoles(existing, "twoManShamble");
      
      expect(result["1"].input.teamAPlayersGross).toEqual([4, null]);
      expect(result["1"].input.teamBPlayersGross).toEqual([null, null]);
    });
  });

  describe("bestBall format normalization", () => {
    it("preserves player arrays", () => {
      const existing = {
        "1": { input: { teamAPlayersGross: [4, 5], teamBPlayersGross: [3, 6] } },
      };
      const result = normalizeHoles(existing, "twoManBestBall");
      
      expect(result["1"].input.teamAPlayersGross).toEqual([4, 5]);
      expect(result["1"].input.teamBPlayersGross).toEqual([3, 6]);
    });

    it("removes drive tracking fields", () => {
      const existing = {
        "1": { input: { teamAPlayersGross: [4, 5], teamBPlayersGross: [3, 6], teamADrive: 0, teamBDrive: 1 } },
      };
      const result = normalizeHoles(existing, "twoManBestBall");
      
      expect(result["1"].input).not.toHaveProperty("teamADrive");
      expect(result["1"].input).not.toHaveProperty("teamBDrive");
    });

    it("creates player arrays from non-array input", () => {
      const existing = {
        "1": { input: { teamAPlayersGross: "invalid", teamBPlayersGross: null } },
      };
      const result = normalizeHoles(existing, "twoManBestBall");
      
      expect(result["1"].input.teamAPlayersGross).toEqual([null, null]);
      expect(result["1"].input.teamBPlayersGross).toEqual([null, null]);
    });
  });

  describe("fills all 18 holes", () => {
    it("adds missing holes", () => {
      const existing = {
        "1": { input: { teamAPlayerGross: 4, teamBPlayerGross: 5 } },
        // Holes 2-18 missing
      };
      const result = normalizeHoles(existing, "singles");
      
      expect(Object.keys(result)).toHaveLength(18);
      expect(result["1"].input.teamAPlayerGross).toBe(4);
      expect(result["18"].input.teamAPlayerGross).toBeNull();
    });
  });
});

// --- holeHasScore / countScoredHoles ---

describe("holeHasScore", () => {
  it("singles: any non-null gross on either side counts", () => {
    expect(holeHasScore("singles", { teamAPlayerGross: null, teamBPlayerGross: null })).toBe(false);
    expect(holeHasScore("singles", { teamAPlayerGross: 4, teamBPlayerGross: null })).toBe(true);
    expect(holeHasScore("singles", { teamAPlayerGross: null, teamBPlayerGross: 5 })).toBe(true);
    expect(holeHasScore("singles", undefined)).toBe(false);
  });

  it("scramble uses team gross, best ball / shamble use the player arrays", () => {
    expect(holeHasScore("twoManScramble", { teamAGross: 4, teamBGross: null })).toBe(true);
    expect(holeHasScore("twoManScramble", { teamAGross: null, teamBGross: null })).toBe(false);
    expect(holeHasScore("twoManBestBall", { teamAPlayersGross: [null, null], teamBPlayersGross: [null, 4] })).toBe(true);
    expect(holeHasScore("twoManShamble", { teamAPlayersGross: [null, null], teamBPlayersGross: [null, null] })).toBe(false);
  });
});

describe("countScoredHoles", () => {
  it("counts only holes 1-18 with a score", () => {
    const holes = {
      "1": { input: { teamAPlayerGross: 4, teamBPlayerGross: 4 } },
      "2": { input: { teamAPlayerGross: null, teamBPlayerGross: null } },
      "3": { input: { teamAPlayerGross: null, teamBPlayerGross: 3 } },
      "19": { input: { teamAPlayerGross: 4, teamBPlayerGross: 4 } },
    };
    expect(countScoredHoles("singles", holes)).toBe(2);
    expect(countScoredHoles("singles", undefined)).toBe(0);
    expect(countScoredHoles("singles", {})).toBe(0);
  });
});
