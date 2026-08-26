/**
 * Formatting helpers.
 *
 * Every function here is deterministic and locale-independent BY CONSTRUCTION.
 * `Number.prototype.toLocaleString('en-IN')` is deliberately avoided even though
 * it produces the same grouping: its output depends on the ICU data compiled
 * into the runtime, so Node and the browser can disagree and produce a React
 * hydration mismatch on the one thing an owner reads first — the money.
 */

/** The rupee sign, once, so no component has to type the glyph. */
const RUPEE = '₹';

/**
 * Groups an integer using the Indian numbering system: the last three digits,
 * then pairs. 842500 -> "8,42,500".
 *
 * Non-finite input yields "0" rather than "NaN": a metric tile that reads zero
 * is wrong in a way someone notices, where "NaN" is wrong in a way that gets
 * screenshotted to support.
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

/**
 * A rupee amount in full: 842500 -> "₹8,42,500".
 *
 * Never compacted to lakh/crore. A gym owner reconciles these figures against a
 * bank statement and a cash drawer, and "₹8.4L" cannot be reconciled against
 * anything. (The platform console compacts because it reads portfolio-scale
 * numbers; this one does not.)
 */
export function rupees(value: number): string {
  return `${RUPEE}${groupIndian(value)}`;
}

/**
 * A negative amount written the way an invoice writes it — "− ₹11,400", with a
 * true minus sign and the sign OUTSIDE the currency symbol.
 */
export function negativeRupees(value: number): string {
  return `− ${rupees(Math.abs(value))}`;
}

/** Whole counts: 43548 -> "43,548". */
export function count(value: number): string {
  return groupIndian(value);
}

/** "Aarav Shah" -> "AS". Falls back to "?" so an avatar is never an empty circle. */
export function initials(name: string, max = 2): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');

  return letters.slice(0, max) || '?';
}

/** The first word of a name, for a greeting or a toast. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/**
 * Share of a total, clamped to 0..1 and guarded against a zero denominator —
 * which is not hypothetical here: a class with capacity 0 is a data error the
 * dashboard should survive, not divide by.
 */
export function ratio(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(Math.max(part / total, 0), 1);
}

/**
 * A CSS width for a meter fill.
 *
 * `floor` is deliberate: rounding up would let a 99.6%-full class render as a
 * full bar. The minimum is not zero because a 1-of-400 bar that renders as
 * nothing reads as "no data" rather than "almost none" — except at exactly
 * zero, where nothing is the honest answer.
 */
export function meterWidth(part: number, total: number, minPercent = 2): string {
  if (part <= 0) return '0%';
  const percent = ratio(part, total) * 100;
  return `${Math.max(Math.floor(percent), minPercent)}%`;
}

/** A whole-number percentage label: 0.864 -> "86%". */
export function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * Digits only, for comparing two phone numbers a human typed.
 *
 * The stored numbers carry a space ("98204 11238") and a person may type a
 * country code, dashes or nothing at all; comparing the raw strings would let
 * the same person be registered twice.
 */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * The last ten digits of a phone number.
 *
 * Indian mobiles are ten digits and may arrive with +91, 91 or 0 in front. The
 * duplicate check has to compare the subscriber number itself, or "+91 98204
 * 11238" and "9820411238" read as two different people.
 */
export function subscriberNumber(phone: string): string {
  return phoneDigits(phone).slice(-10);
}
