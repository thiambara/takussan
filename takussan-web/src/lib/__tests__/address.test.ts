import { describe, it, expect } from 'vitest';
import { formatAddressShort } from '../format/address';

describe('formatAddressShort (TCK-164)', () => {
  it('returns "Quartier, Ville" by default', () => {
    expect(formatAddressShort({ quarter: 'Amitié', city: 'Dakar' })).toBe('Amitié, Dakar');
  });

  it('drops the region when it duplicates the city', () => {
    expect(
      formatAddressShort({ quarter: 'Amitié', city: 'Dakar', region: 'Dakar' }, { withRegion: true }),
    ).toBe('Amitié, Dakar');
  });

  it('keeps the region when it differs from the city', () => {
    expect(
      formatAddressShort(
        { quarter: 'Sébikotane', city: 'Rufisque', region: 'Dakar' },
        { withRegion: true },
      ),
    ).toBe('Sébikotane, Rufisque, Dakar');
  });

  it('omits the region by default', () => {
    expect(
      formatAddressShort({ quarter: 'Amitié', city: 'Dakar', region: 'Dakar', country: 'SN' }),
    ).toBe('Amitié, Dakar');
  });

  it('appends country only when withCountry=true', () => {
    expect(
      formatAddressShort({ city: 'Saint-Louis', country: 'SN' }, { withCountry: true }),
    ).toBe('Saint-Louis, SN');
  });

  it('handles missing parts gracefully', () => {
    expect(formatAddressShort(null)).toBe('');
    expect(formatAddressShort(undefined)).toBe('');
    expect(formatAddressShort({})).toBe('');
    expect(formatAddressShort({ quarter: '   ' })).toBe('');
  });

  it('uses the fallback when nothing usable is provided', () => {
    expect(formatAddressShort({}, { fallback: 'Adresse à venir' })).toBe('Adresse à venir');
  });

  it('skips empty quarter and falls back to city alone', () => {
    expect(formatAddressShort({ quarter: '', city: 'Dakar' })).toBe('Dakar');
  });
});
