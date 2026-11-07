import { ConvexError } from "convex/values";

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Returns today's date in ISO YYYY-MM-DD (UTC).
 */
export function getTodayIsoDate(nowMs: number = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/**
 * Validates that a string is a valid calendar date in YYYY-MM-DD format.
 */
export function assertValidIsoDate(dateStr: string, fieldName: string): void {
  if (!ISO_DATE_REGEX.test(dateStr)) {
    throw new ConvexError(`INVALID_DATE_${fieldName.toUpperCase()}`);
  }
  const parsed = new Date(`${dateStr}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== dateStr
  ) {
    throw new ConvexError(`INVALID_DATE_${fieldName.toUpperCase()}`);
  }
}

/**
 * Checks whether two inclusive date ranges [startA, endA] and [startB, endB] overlap.
 * Because dates are formatted as ISO YYYY-MM-DD, lexicographical comparison is exact.
 */
export function rangesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  return startA <= endB && startB <= endA;
}

/**
 * Checks if a single date (e.g. today) falls within [startDate, endDate] inclusive.
 */
export function dateOverlapsDay(
  startDate: string,
  endDate: string,
  dayIso: string
): boolean {
  return startDate <= dayIso && dayIso <= endDate;
}

