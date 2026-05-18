import { describe, expect, it } from 'vitest';
import { formatDayLabel } from '../formatDayLabel';

const labels = { today: "Aujourd'hui", yesterday: 'Hier' };

describe('formatDayLabel (fr)', () => {
  const now = new Date('2026-05-16T12:00:00');

  it('returns today label for the same day', () => {
    const date = new Date('2026-05-16T08:00:00');
    expect(formatDayLabel(date, 'fr', labels, now)).toBe("Aujourd'hui");
  });

  it('returns yesterday label for the day before', () => {
    const date = new Date('2026-05-15T23:00:00');
    expect(formatDayLabel(date, 'fr', labels, now)).toBe('Hier');
  });

  it('returns weekday + short month for same year', () => {
    const date = new Date('2026-05-03T10:00:00');
    expect(formatDayLabel(date, 'fr', labels, now)).toBe('Dim. 3 mai');
  });

  it('returns full date for a different year', () => {
    const date = new Date('2025-05-03T10:00:00');
    expect(formatDayLabel(date, 'fr', labels, now)).toBe('3 mai 2025');
  });
});
