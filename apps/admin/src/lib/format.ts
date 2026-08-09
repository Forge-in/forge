/**
 * Formatting helpers.
 *
 * Every function here is deterministic and locale-independent by construction.
 * `Number.prototype.toLocaleString('en-IN')` is deliberately avoided: its output
 * depends on the ICU data compiled into the runtime, so Node and the browser can
 * disagree and produce a React hydration mismatch.
 */

const LAKH = 100_000;
const CRORE = 10_000_000;

/**
 * Groups an integer using the Indian numbering system: the last three digits,
 * then pairs (12,34,567).
 */
export function groupIndian(value: number): string {
  if (!Number.isFinite(value)) return '0';

  const negative = value < 0;
  const digits = Math.trunc(Math.abs(value)).toString();

  let grouped: string;
  if (digits.length <= 3) {
    grouped = digits;
  } else {
    const tail = digits.slice(-3);
    const head = digits.slice(0, -3);
    grouped = `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${tail}`;
  }

  return negative ? `-${grouped}` : grouped;
}

/** Whole counts: 43548 -> "43,548". */
export function formatCount(value: number): string {
  return groupIndian(value);
}

/**
 * Rupee amounts, compacted the way Indian finance teams read them:
 * >= 1 crore -> "₹1.24Cr", >= 1 lakh -> "₹10.3L", otherwise grouped in full.
 */
export function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return '₹0';

  const sign = value < 0 ? '-' : '';
  const magnitude = Math.abs(value);

  if (magnitude >= CRORE) return `${sign}₹${(magnitude / CRORE).toFixed(2)}Cr`;
  if (magnitude >= LAKH) return `${sign}₹${(magnitude / LAKH).toFixed(1)}L`;

  return `${sign}₹${groupIndian(magnitude)}`;
}

/** Share of a total in the 0..1 range, guarded against a zero denominator. */
export function ratio(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total === 0) return 0;
  return part / total;
}

/** "Sameer Rathore" -> "SR". Falls back to "?" for an empty name. */
export function initials(name: string, max = 2): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

  return letters.slice(0, max) || '?';
}

/** Reads a "₹1,44,000" style string back into a number. Returns 0 if it can't. */
export function parseMoney(value: string): number {
  const digits = value.replace(/[^\d.-]/g, '');
  const parsed = Number.parseFloat(digits);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Two-digit rank label: 1 -> "01". */
export function rankLabel(index: number): string {
  return String(index + 1).padStart(2, '0');
}
