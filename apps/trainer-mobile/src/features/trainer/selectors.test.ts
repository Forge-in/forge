import { clients } from './data';
import {
  circumference,
  clamp01,
  filterClients,
  formatClock,
  formatDayLabel,
  formatPercent,
  initialsOf,
  itemAt,
  presentCount,
  programmeLabel,
  programmeProgress,
  ringOffset,
  sessionProgress,
  totalSetsLogged,
} from './selectors';

describe('clamp01', () => {
  it('passes through values already in range', () => {
    expect(clamp01(0.42)).toBe(0.42);
  });

  it('clamps a session that has run past its scheduled length', () => {
    expect(clamp01(1.8)).toBe(1);
  });

  it('clamps negatives to zero rather than drawing a ring backwards', () => {
    expect(clamp01(-0.5)).toBe(0);
  });

  it.each([NaN, Infinity, -Infinity])('treats %p as zero', (value) => {
    expect(clamp01(value)).toBe(0);
  });
});

describe('sessionProgress', () => {
  it('reports the fraction of the session elapsed', () => {
    expect(sessionProgress(1350, 2700)).toBeCloseTo(0.5);
  });

  it('does not divide by a zero duration', () => {
    expect(sessionProgress(100, 0)).toBe(0);
  });

  it('caps at fully complete once the session overruns', () => {
    expect(sessionProgress(4000, 2700)).toBe(1);
  });
});

describe('ring geometry', () => {
  it("matches the design's 653.5 dasharray for the Today dial", () => {
    expect(circumference(104)).toBeCloseTo(653.45, 1);
  });

  it('offsets a full ring to zero and an empty ring to its whole length', () => {
    const length = circumference(104);
    expect(ringOffset(length, 1)).toBeCloseTo(0);
    expect(ringOffset(length, 0)).toBeCloseTo(length);
  });

  it("reproduces the design's idle offset of 196 at 70%", () => {
    expect(ringOffset(circumference(104), 0.7)).toBeCloseTo(196, 0);
  });
});

describe('formatClock', () => {
  it('formats the seeded 724 seconds the way the design does', () => {
    expect(formatClock(724)).toBe('12:04');
  });

  it('pads seconds below ten', () => {
    expect(formatClock(65)).toBe('1:05');
  });

  it('keeps counting in minutes past the hour rather than wrapping', () => {
    expect(formatClock(3785)).toBe('63:05');
  });

  it.each([0, -10, NaN])('renders %p as zero', (value) => {
    expect(formatClock(value)).toBe('0:00');
  });
});

describe('formatPercent', () => {
  it('renders adherence the way the design prints it', () => {
    expect(formatPercent(0.82)).toBe('82%');
  });

  it('rounds to the nearest whole percent', () => {
    expect(formatPercent(1 / 3)).toBe('33%');
  });
});

describe('programme progress', () => {
  it("matches the design's 33% for week 4 of 12", () => {
    expect(formatPercent(programmeProgress(4, 12))).toBe('33%');
  });

  it('is zero for a client with no plan yet', () => {
    expect(programmeProgress(null, null)).toBe(0);
    expect(programmeLabel(null, null)).toBe('No plan yet');
  });

  it('labels an active programme', () => {
    expect(programmeLabel(4, 12)).toBe('Week 4 of 12');
  });
});

describe('initialsOf', () => {
  it('reduces a short roster name to its initials', () => {
    expect(initialsOf('Priya S.')).toBe('PS');
  });

  it('handles a full name', () => {
    expect(initialsOf('Neha Desai')).toBe('ND');
  });

  it('survives double and trailing spaces, which the design\'s split(" ") did not', () => {
    expect(initialsOf('  Rahul   Mehra ')).toBe('RM');
  });

  it('returns an empty string for an empty name', () => {
    expect(initialsOf('   ')).toBe('');
  });
});

describe('filterClients', () => {
  it('returns the whole roster for All', () => {
    expect(filterClients(clients, 'All')).toHaveLength(clients.length);
  });

  it('narrows to the slipping group', () => {
    const slipping = filterClients(clients, 'Slipping');
    expect(slipping.map((client) => client.id)).toEqual(['arjun-kapoor', 'divya-patel']);
  });

  it('narrows to the lapsed group', () => {
    expect(filterClients(clients, 'Lapsed').map((client) => client.id)).toEqual(['vikram-rao']);
  });

  it('does not mutate the roster it was given', () => {
    const before = [...clients];
    filterClients(clients, 'Lapsed');
    expect(clients).toEqual(before);
  });
});

describe('counts', () => {
  it('sums logged sets across the room', () => {
    expect(totalSetsLogged({ a: 2, b: 0, c: 3 })).toBe(5);
  });

  it('returns zero for an empty room', () => {
    expect(totalSetsLogged({})).toBe(0);
  });

  it('counts checked-in clients plus waitlist promotions', () => {
    expect(presentCount({ a: true, b: false, c: true }, ['rohan-tiwari'])).toBe(3);
  });
});

describe('itemAt', () => {
  it('returns the item at the index', () => {
    expect(itemAt(['a', 'b', 'c'], 1)).toBe('b');
  });

  it('clamps an out-of-range index instead of returning undefined', () => {
    expect(itemAt(['a', 'b', 'c'], 99)).toBe('c');
    expect(itemAt(['a', 'b', 'c'], -4)).toBe('a');
  });

  it('throws on an empty list, which would be a programming error', () => {
    expect(() => itemAt([], 0)).toThrow(/empty list/);
  });
});

describe('formatDayLabel', () => {
  it("prints the design's 'Tuesday · 13 Aug' shape", () => {
    expect(formatDayLabel(new Date(2026, 7, 13))).toBe('Thursday · 13 Aug');
  });

  it('formats a single-digit day without padding', () => {
    expect(formatDayLabel(new Date(2026, 0, 4))).toBe('Sunday · 4 Jan');
  });

  it('returns an empty string for an invalid date rather than "Invalid Date"', () => {
    expect(formatDayLabel(new Date('nonsense'))).toBe('');
  });
});
