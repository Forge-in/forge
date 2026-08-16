/**
 * Time rendering for the console.
 *
 * Two decisions worth stating, because both are easy to get wrong quietly.
 *
 * ABSOLUTE TIMES ARE PINNED TO IST, not the viewer's machine. This console is operated from
 * India, and its screens are the ones people read back to each other during an incident —
 * "the invite expired at 18:40" has to mean the same thing to everyone on the call. A laptop
 * left on a US timezone would otherwise quietly shift every timestamp on the page. The zone
 * is printed alongside the time so the reading is never ambiguous.
 *
 * `now` IS AN ARGUMENT, not a call to Date.now() inside. Relative time is the kind of logic
 * that is either tested properly or is wrong at the boundaries, and it cannot be tested at
 * all if it reads the clock itself.
 */

const IST = 'Asia/Kolkata';

/** Rendered when a value is absent or unparseable, so a row never shows "Invalid Date". */
const NO_VALUE = '—';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Parses an ISO string, returning null rather than an Invalid Date.
 *
 * `new Date('nonsense')` produces an object that passes every truthiness check and then
 * renders as "Invalid Date" in the middle of a table. Failing to null here means every
 * caller's `??` fallback does the right thing.
 */
function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "12 Aug 2026, 09:42 IST". Stable for everyone, whatever their machine is set to. */
export function absoluteTime(iso: string | null | undefined): string {
  const date = parse(iso);
  if (!date) return NO_VALUE;

  const formatted = new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  return `${formatted} IST`;
}

/** "12 Aug 2026" — for a date where the time of day carries no meaning. */
export function absoluteDate(iso: string | null | undefined): string {
  const date = parse(iso);
  if (!date) return NO_VALUE;

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

/**
 * How long ago something happened: "just now", "5 minutes ago", "3 days ago".
 *
 * Deliberately coarse. This sits next to an absolute timestamp in the UI, so its job is to
 * make "recent" and "stale" distinguishable at a glance, not to be precise — and a precise
 * relative time invites people to rely on it for exactly the reckoning it is worst at.
 *
 * A FUTURE timestamp returns "just now" rather than "in -3 minutes". Small clock skew
 * between the server and the viewer is normal, and a negative duration on a "last signed in"
 * column reads as a bug when it is really a few seconds of drift.
 */
export function timeAgo(iso: string | null | undefined, now: Date): string {
  const date = parse(iso);
  if (!date) return NO_VALUE;

  const elapsed = now.getTime() - date.getTime();

  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return `${plural(Math.floor(elapsed / MINUTE), 'minute')} ago`;
  if (elapsed < DAY) return `${plural(Math.floor(elapsed / HOUR), 'hour')} ago`;
  if (elapsed < 30 * DAY) return `${plural(Math.floor(elapsed / DAY), 'day')} ago`;

  // Past a month, a relative figure stops being useful and a date is what someone wants.
  return absoluteDate(iso);
}

/**
 * How long until something expires: "in 2 days", "in 40 minutes", "expired".
 *
 * The already-expired case is the one that matters. The API filters expired invites out of
 * its list, but a row can still be on screen when its expiry passes — a console left open —
 * and it must then read "expired" rather than counting down into negative numbers beside a
 * button that will no longer work.
 */
export function timeUntil(iso: string | null | undefined, now: Date): string {
  const date = parse(iso);
  if (!date) return NO_VALUE;

  const remaining = date.getTime() - now.getTime();

  if (remaining <= 0) return 'expired';
  if (remaining < MINUTE) return 'in under a minute';
  if (remaining < HOUR) return `in ${plural(Math.floor(remaining / MINUTE), 'minute')}`;
  if (remaining < DAY) return `in ${plural(Math.floor(remaining / HOUR), 'hour')}`;

  return `in ${plural(Math.floor(remaining / DAY), 'day')}`;
}

/** True once an expiry has passed. Kept separate so the UI can disable rather than just relabel. */
export function hasExpired(iso: string | null | undefined, now: Date): boolean {
  const date = parse(iso);
  if (!date) return false;
  return date.getTime() <= now.getTime();
}
