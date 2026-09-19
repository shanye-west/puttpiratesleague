/** League months: a season's rounds are named after calendar months. */

import type { RoundDoc } from "../types";

export const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** A month chip's label: "September" → "Sep"; other round names pass through. */
export function shortRoundLabel(r: RoundDoc): string {
  const name = r.name?.trim() || (r.day ? `Round ${r.day}` : "Round");
  return MONTH_NAMES.includes(name.toLowerCase()) ? name.slice(0, 3) : name;
}
