import { describe, it, expect } from 'vitest';
import {
  addDays,
  addMonths,
  endOfDay,
  eventTouchesDay,
  formatISODate,
  isSameDay,
  monthGrid,
  parseServerDate,
  startOfDay,
  startOfMonth,
  startOfWeek,
  visibleRange,
  weekDays,
} from '@/lib/calendar-date';

/**
 * TCK-072 — Date helpers tests.
 *
 * On teste tout ce qui est load-bearing pour la grille : lundi-first,
 * 6×7 regularity, edge cases de mois (jan→fév 30 jours, fév 31 jours).
 */

describe('startOfWeek (lundi-first)', () => {
  it('returns monday for any weekday', () => {
    // 2026-04-24 is a Friday
    const friday = new Date(2026, 3, 24);
    const monday = startOfWeek(friday);
    expect(monday.getDay()).toBe(1); // JS: monday = 1
    expect(monday.getDate()).toBe(20);
    expect(monday.getHours()).toBe(0);
  });

  it('does not move when input is already monday', () => {
    const mon = new Date(2026, 3, 20);
    const s = startOfWeek(mon);
    expect(isSameDay(s, mon)).toBe(true);
  });

  it('handles sunday → previous monday', () => {
    // 2026-04-26 is a Sunday
    const sunday = new Date(2026, 3, 26);
    const monday = startOfWeek(sunday);
    expect(monday.getDate()).toBe(20);
  });
});

describe('monthGrid', () => {
  it('returns 42 days (6 weeks × 7 days)', () => {
    const grid = monthGrid(new Date(2026, 3, 15));
    expect(grid.length).toBe(42);
  });

  it('starts on a monday', () => {
    const grid = monthGrid(new Date(2026, 3, 15));
    // mondayFirstIndex(grid[0]) === 0 ⇒ grid[0].getDay() === 1 (monday)
    expect(grid[0].getDay()).toBe(1);
  });

  it('contains the 1st of the focus month', () => {
    const grid = monthGrid(new Date(2026, 3, 15));
    const first = new Date(2026, 3, 1);
    expect(grid.some((d) => isSameDay(d, first))).toBe(true);
  });
});

describe('weekDays', () => {
  it('returns 7 days starting monday', () => {
    const w = weekDays(new Date(2026, 3, 24)); // Friday
    expect(w.length).toBe(7);
    expect(w[0].getDate()).toBe(20); // monday
    expect(w[6].getDate()).toBe(26); // sunday
  });
});

describe('addMonths / addDays', () => {
  it('advances months without day-overflow (jan 31 + 1m → feb 1)', () => {
    const jan31 = new Date(2026, 0, 31);
    const next = addMonths(jan31, 1);
    // We snap to day=1 before shifting, so day = 1 of feb
    expect(next.getMonth()).toBe(1);
    expect(next.getDate()).toBe(1);
  });

  it('adds days straightforwardly', () => {
    const d = addDays(new Date(2026, 3, 24), 10);
    expect(d.getDate()).toBe(4);
    expect(d.getMonth()).toBe(4);
  });
});

describe('parseServerDate', () => {
  it('accepts the `YYYY-MM-DD HH:mm:ss` shape', () => {
    const d = parseServerDate('2026-04-24 10:30:00');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(3);
    expect(d!.getHours()).toBe(10);
  });

  it('returns null for invalid input', () => {
    expect(parseServerDate(null)).toBeNull();
    expect(parseServerDate(undefined)).toBeNull();
    expect(parseServerDate('not a date')).toBeNull();
  });
});

describe('eventTouchesDay', () => {
  it('matches an event spanning the day', () => {
    const evt = {
      start: new Date(2026, 3, 20, 10, 0),
      end: new Date(2026, 3, 25, 18, 0),
    };
    expect(eventTouchesDay(evt, new Date(2026, 3, 22))).toBe(true);
  });

  it('excludes the day after the event ends', () => {
    const evt = {
      start: new Date(2026, 3, 20, 10, 0),
      end: new Date(2026, 3, 20, 18, 0),
    };
    expect(eventTouchesDay(evt, new Date(2026, 3, 21))).toBe(false);
  });

  it('handles null end as single-day event', () => {
    const evt = { start: new Date(2026, 3, 20, 10, 0), end: null };
    expect(eventTouchesDay(evt, new Date(2026, 3, 20))).toBe(true);
    expect(eventTouchesDay(evt, new Date(2026, 3, 19))).toBe(false);
  });
});

describe('visibleRange', () => {
  it('month → grid-extended range (42 days)', () => {
    const r = visibleRange('month', new Date(2026, 3, 15));
    // 6 weeks × 7 days - 1 ms short of 42 days (end = 23:59:59.999 of day 42)
    const spanMs = r.end.getTime() - r.start.getTime();
    const dayMs = 1000 * 60 * 60 * 24;
    expect(spanMs).toBeGreaterThan(41 * dayMs);
    expect(spanMs).toBeLessThan(42 * dayMs);
  });

  it('week → 7 days', () => {
    const r = visibleRange('week', new Date(2026, 3, 24));
    expect(r.start.getDay()).toBe(1); // monday
    expect(r.end.getDay()).toBe(0); // sunday
  });

  it('day → same day', () => {
    const r = visibleRange('day', new Date(2026, 3, 24));
    expect(isSameDay(r.start, r.end)).toBe(true);
  });
});

describe('startOfDay / endOfDay / startOfMonth', () => {
  it('startOfDay resets time', () => {
    const d = startOfDay(new Date(2026, 3, 24, 18, 45));
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it('endOfDay pushes to 23:59:59.999', () => {
    const d = endOfDay(new Date(2026, 3, 24, 9, 0));
    expect(d.getHours()).toBe(23);
    expect(d.getMilliseconds()).toBe(999);
  });

  it('startOfMonth snaps to day 1', () => {
    const d = startOfMonth(new Date(2026, 3, 24));
    expect(d.getDate()).toBe(1);
  });
});

describe('formatISODate', () => {
  it('pads month and day to 2 digits', () => {
    expect(formatISODate(new Date(2026, 0, 3))).toBe('2026-01-03');
    expect(formatISODate(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});
