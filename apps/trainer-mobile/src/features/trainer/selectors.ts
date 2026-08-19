/**
 * Pure derivations shared by the trainer screens.
 *
 * The design computed all of this inline inside `renderVals()`. Pulling it out keeps the
 * screens declarative and — more usefully — makes the arithmetic (ring geometry, clock
 * formatting, progress clamping) testable without mounting a component.
 */
import type { ClientFilter, TrainerClient } from './data';

/**
 * `list[index]` with the index clamped into range.
 *
 * Every index in this app comes from reducer state that already clamps, so this is belt and
 * braces — but it is what lets the screens read `exerciseAt(i).name` without a non-null
 * assertion under `noUncheckedIndexedAccess`.
 */
export function itemAt<T>(list: readonly T[], index: number): T {
  const safeIndex = Math.min(Math.max(0, Math.trunc(index)), list.length - 1);
  const item = list[safeIndex];
  if (item === undefined) throw new Error('itemAt was called with an empty list');
  return item;
}

/** Circumference of the SVG ring at a given radius — the design's `stroke-dasharray`. */
export function circumference(radius: number): number {
  return 2 * Math.PI * radius;
}

/**
 * Clamps a ratio into [0, 1].
 *
 * Guards two real cases: a session that runs past its scheduled length (progress > 1, which
 * would make `stroke-dashoffset` negative and draw the ring backwards) and a zero or missing
 * duration, which would otherwise divide by zero.
 */
export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  return value > 1 ? 1 : value;
}

export function sessionProgress(elapsedSeconds: number, durationSeconds: number): number {
  if (durationSeconds <= 0) return 0;
  return clamp01(elapsedSeconds / durationSeconds);
}

/** `stroke-dashoffset` for a ring that should read `progress` full. */
export function ringOffset(ringCircumference: number, progress: number): number {
  return ringCircumference * (1 - clamp01(progress));
}

/**
 * `m:ss`, matching the design's `fmt()`.
 *
 * Minutes are intentionally not wrapped into hours: a session that overruns should read
 * "63:12", which is unambiguous to a trainer glancing at a phone on a gym floor.
 */
export function formatClock(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** `0.82 -> "82%"`. Also used for programme progress, which the design renders the same way. */
export function formatPercent(fraction: number): string {
  return `${Math.round(clamp01(fraction) * 100)}%`;
}

/** Fraction of a programme completed, or 0 when the client has no plan yet. */
export function programmeProgress(week: number | null, totalWeeks: number | null): number {
  if (week === null || totalWeeks === null || totalWeeks <= 0) return 0;
  return clamp01(week / totalWeeks);
}

/** "Week 4 of 12", or the design's fallback wording when there is no plan. */
export function programmeLabel(week: number | null, totalWeeks: number | null): string {
  if (week === null || totalWeeks === null) return 'No plan yet';
  return `Week ${week} of ${totalWeeks}`;
}

/**
 * "Priya S." -> "PS".
 *
 * Splits on any run of whitespace and drops empty parts, so a double space or a trailing one
 * cannot produce `undefined` in the middle of the initials — which the design's
 * `name.split(' ').map(p => p[0])` would.
 */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function filterClients(roster: TrainerClient[], filter: ClientFilter): TrainerClient[] {
  switch (filter) {
    case 'Slipping':
      return roster.filter((client) => client.group === 'slipping');
    case 'Lapsed':
      return roster.filter((client) => client.group === 'lapsed');
    case 'All':
    default:
      return roster;
  }
}

/** Total sets logged across the room — the runner's headline count. */
export function totalSetsLogged(setsByClientId: Record<string, number>): number {
  return Object.values(setsByClientId).reduce((sum, count) => sum + count, 0);
}

/** Everyone physically in the room: checked-in bookings plus anyone promoted off the waitlist. */
export function presentCount(
  presentByClientId: Record<string, boolean>,
  promotedWaitlistIds: readonly string[],
): number {
  const checkedIn = Object.values(presentByClientId).filter(Boolean).length;
  return checkedIn + promotedWaitlistIds.length;
}

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/**
 * "Tuesday · 13 Aug" — the format the design prints above the trainer's name.
 *
 * Hand-rolled rather than `toLocaleDateString`, because `Intl` is not guaranteed to be present
 * in every Hermes build and a missing one would throw at the top of the first screen.
 */
export function formatDayLabel(date: Date): string {
  if (Number.isNaN(date.getTime())) return '';
  return `${WEEKDAYS[date.getDay()]} · ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}
