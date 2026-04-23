import { describe, it, expect } from 'vitest';
import { boundsToString, propertiesQueryKeys } from '@/lib/queries/properties';

describe('boundsToString', () => {
  it('serializes bounds to the backend-expected format', () => {
    expect(
      boundsToString({
        swLat: 14.6,
        swLng: -17.5,
        neLat: 14.8,
        neLng: -17.3,
      }),
    ).toBe('14.600000,-17.500000,14.800000,-17.300000');
  });

  it('keeps consistent precision for very close coordinates', () => {
    expect(
      boundsToString({
        swLat: 14.6928,
        swLng: -17.4467,
        neLat: 14.6929,
        neLng: -17.4466,
      }),
    ).toBe('14.692800,-17.446700,14.692900,-17.446600');
  });
});

describe('propertiesQueryKeys', () => {
  it('produces stable keys for the same params', () => {
    const a = propertiesQueryKeys.list({ filter: { featured: true } });
    const b = propertiesQueryKeys.list({ filter: { featured: true } });
    expect(a).toEqual(b);
  });

  it('differentiates map keys by bounds', () => {
    const a = propertiesQueryKeys.map('1,2,3,4', {});
    const b = propertiesQueryKeys.map('1,2,3,5', {});
    expect(a).not.toEqual(b);
  });
});
