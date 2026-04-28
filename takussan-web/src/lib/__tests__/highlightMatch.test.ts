import { describe, it, expect } from 'vitest';
import { highlightMatch } from '../highlightMatch';

describe('highlightMatch', () => {
  it('splits label into before/match/after when prefix found', () => {
    const result = highlightMatch('Dakar', 'da');
    expect(result.before).toBe('');
    expect(result.match).toBe('Da');
    expect(result.after).toBe('kar');
  });

  it('is case-insensitive', () => {
    const result = highlightMatch('Saint-Louis', 'SAINT');
    expect(result.match.toLowerCase()).toBe('saint');
  });

  it('handles accents in query', () => {
    const result = highlightMatch('Thiès', 'thi');
    expect(result.match).toBeTruthy();
    expect(result.before).toBe('');
  });

  it('returns full label in before when no match', () => {
    const result = highlightMatch('Dakar', 'xyz');
    expect(result.before).toBe('Dakar');
    expect(result.match).toBe('');
    expect(result.after).toBe('');
  });

  it('handles empty query', () => {
    const result = highlightMatch('Dakar', '');
    expect(result.before).toBe('Dakar');
    expect(result.match).toBe('');
    expect(result.after).toBe('');
  });
});
