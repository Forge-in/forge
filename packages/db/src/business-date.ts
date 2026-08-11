/**
 * The single place a timestamp becomes a business day.
 *
 * A gym's day is not a UTC day. A 00:30 IST check-in happened on the *previous* UTC date,
 * so deriving the day with `toISOString().slice(0, 10)` moves every late-night visit into
 * tomorrow. That error is invisible in testing — it only shows up as daily counts that are
 * slightly wrong for exactly the branches that stay open late, which is the hardest kind
 * of bug to notice and the easiest to disbelieve when someone reports it.
 *
 * Every caller in the system routes through here. Nothing else formats a business date.
 */

/** IANA zone. Studios carry their own; this is the default and today the only one in use. */
export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

/**
 * `en-CA` is not a locale choice, it is a formatting trick: it is the only widely
 * supported locale whose short date format is already YYYY-MM-DD, which is what Postgres
 * wants for a `date` column. Building the string from parts avoids depending on it.
 */
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * Converts an instant into the calendar date it falls on in `timeZone`, as 'YYYY-MM-DD'.
 *
 * @throws if the timezone is unknown, rather than silently falling back to UTC. A silent
 * fallback would produce plausible-looking dates that are off by a day — the exact failure
 * this function exists to prevent. Note that on Android, Hermes ships without full ICU
 * unless configured, so an unguarded `Intl` call there can quietly resolve to UTC; this
 * throw is what turns that into something you find out about.
 */
export function toBusinessDate(instant: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError('toBusinessDate received an invalid Date');
  }

  const parts = formatterFor(timeZone).formatToParts(instant);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;

  // Unreachable in practice: formatToParts always yields these three for the options
  // above, and an unknown timezone throws in the DateTimeFormat constructor before we get
  // here. Kept because noUncheckedIndexedAccess makes the lookups optional and the
  // alternative is a non-null assertion, which would turn a hypothetical miss into
  // "undefined-undefined-undefined" written to a date column.
  /* v8 ignore next 3 */
  if (!year || !month || !day) {
    throw new RangeError(`Could not derive a business date in timezone "${timeZone}"`);
  }

  return `${year}-${month}-${day}`;
}

/**
 * The UTC instant range covering one business day, as a half-open interval [start, end).
 *
 * Half-open on purpose: a closed range needs an end-of-day sentinel (23:59:59.999) that
 * silently drops anything in the final millisecond, and gets worse with microsecond
 * precision in Postgres. Query with `>= start AND < end`.
 */
export function businessDayRange(
  businessDate: string,
  timeZone: string = DEFAULT_TIMEZONE,
): { start: Date; end: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate)) {
    throw new RangeError(`Expected a YYYY-MM-DD business date, received "${businessDate}"`);
  }

  return {
    start: zonedMidnight(businessDate, timeZone),
    end: zonedMidnight(addDays(businessDate, 1), timeZone),
  };
}

/** Resolves local midnight on `businessDate` in `timeZone` to its UTC instant. */
function zonedMidnight(businessDate: string, timeZone: string): Date {
  // Start from the naive UTC reading, then correct by however far that instant's local
  // time is from UTC. Two passes because the offset itself can differ across the shift in
  // a DST zone — India has no DST, but this must not silently break if a studio opens in
  // a zone that does.
  let guess = new Date(`${businessDate}T00:00:00Z`);
  for (let i = 0; i < 2; i += 1) {
    const offsetMs = zoneOffsetMs(guess, timeZone);
    guess = new Date(new Date(`${businessDate}T00:00:00Z`).getTime() - offsetMs);
  }
  return guess;
}

/** How far ahead of UTC `timeZone` is at `instant`, in milliseconds. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  // 'en-US' + hourCycle h23 gives a parseable, zero-padded local wall clock.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');

  const asUtc = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    read('hour'),
    read('minute'),
    read('second'),
  );

  return asUtc - instant.getTime();
}

function addDays(businessDate: string, days: number): string {
  const next = new Date(`${businessDate}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}
