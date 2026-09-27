import { describe, it, expect } from "vitest";
import { courseHandicapForTees, formatHandicapIndex, parseHandicapIndex } from "./ghin";

describe("parseHandicapIndex", () => {
  it("reads a plain index to one decimal", () => {
    expect(parseHandicapIndex("12.4")).toBe(12.4);
    expect(parseHandicapIndex(" 7 ")).toBe(7);
    expect(parseHandicapIndex(".5")).toBe(0.5);
    expect(parseHandicapIndex("9,8")).toBe(9.8);
    expect(parseHandicapIndex("12.46")).toBe(12.5);
  });

  it("reads GHIN's +x.x (and -x.x) as a plus handicap", () => {
    expect(parseHandicapIndex("+2.1")).toBe(-2.1);
    expect(parseHandicapIndex("-2.1")).toBe(-2.1);
  });

  it("rejects blanks, junk and out-of-range values", () => {
    expect(parseHandicapIndex("")).toBeNull();
    expect(parseHandicapIndex("abc")).toBeNull();
    expect(parseHandicapIndex("1.2.3")).toBeNull();
    expect(parseHandicapIndex("54.1")).toBeNull();
    expect(parseHandicapIndex("+10.1")).toBeNull();
  });
});

describe("formatHandicapIndex", () => {
  it("shows a plus handicap with a plus sign, like GHIN", () => {
    expect(formatHandicapIndex(7.4)).toBe("7.4");
    expect(formatHandicapIndex(10)).toBe("10.0");
    expect(formatHandicapIndex(-2.1)).toBe("+2.1");
  });

  it("round-trips through parseHandicapIndex", () => {
    for (const hi of [0, 7.4, 12.1, -2.1, 36]) expect(parseHandicapIndex(formatHandicapIndex(hi))).toBe(hi);
  });
});

describe("courseHandicapForTees", () => {
  const angelesBlue = { rating: 72.4, slope: 137, par: 72 };

  it("applies the WHS formula and rounds (same numbers as setupMatchCard)", () => {
    expect(courseHandicapForTees(7.4, angelesBlue)).toBe(9);   // 9.37
    expect(courseHandicapForTees(12.1, angelesBlue)).toBe(15); // 15.07
    expect(courseHandicapForTees(-2.1, angelesBlue)).toBe(-2); // -2.15
    expect(courseHandicapForTees(7.4, { rating: 70, slope: 122, par: 72 })).toBe(6); // 5.99
  });

  it("returns null when the tees are missing rating, slope or par", () => {
    expect(courseHandicapForTees(10, { slope: 130, par: 72 })).toBeNull();
    expect(courseHandicapForTees(10, { rating: 71, par: 72 })).toBeNull();
    expect(courseHandicapForTees(10, { rating: 71, slope: 130 })).toBeNull();
  });
});
