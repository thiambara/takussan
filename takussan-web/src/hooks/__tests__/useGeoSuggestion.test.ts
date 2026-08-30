import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockLocation = vi.hoisted(() => ({ value: null as unknown, loading: false }));

vi.mock('@/components/providers/UserLocationProvider', () => ({
  useUserLocation: () => ({
    location: mockLocation.value,
    loading: mockLocation.loading,
    city: 'Dakar',
  }),
}));

import { useGeoSuggestion } from '../useGeoSuggestion';

describe('useGeoSuggestion', () => {
  it('propose la ville et la région sans jamais les poser d’office', () => {
    mockLocation.value = { city: 'Saly', region: 'Thiès', country_code: 'SN', currency: 'XOF' };
    const { result } = renderHook(() => useGeoSuggestion());
    expect(result.current.suggestion).toEqual({ city: 'Saly', region: 'Thiès' });
  });

  it('pose d’office le pays, la devise et le centre de carte', () => {
    mockLocation.value = {
      city: 'Dakar', region: 'Dakar', country_code: 'SN', currency: 'XOF',
      latitude: 14.6928, longitude: -17.4467,
    };
    const { result } = renderHook(() => useGeoSuggestion());
    expect(result.current.defaults).toEqual({
      country: 'SN', currency: 'XOF', lat: 14.6928, lng: -17.4467,
    });
  });

  it('ignore une devise que le backend n’accepte pas, plutôt que de la propager', () => {
    mockLocation.value = { city: 'Paris', country_code: 'FR', currency: 'GBP' };
    const { result } = renderHook(() => useGeoSuggestion());
    expect(result.current.defaults.currency).toBeUndefined();
    expect(result.current.defaults.country).toBe('FR');
  });

  it('ne suggère rien quand la géo-IP n’a pas répondu', () => {
    mockLocation.value = null;
    const { result } = renderHook(() => useGeoSuggestion());
    expect(result.current.suggestion).toBeNull();
    expect(result.current.defaults).toEqual({});
  });

  it('ne suggère rien quand la ville est vide ou blanche', () => {
    mockLocation.value = { city: '   ', region: 'Dakar', country_code: 'SN' };
    const { result } = renderHook(() => useGeoSuggestion());
    expect(result.current.suggestion).toBeNull();
  });

  it('normalise le code pays en majuscules sur deux caractères', () => {
    mockLocation.value = { city: 'Dakar', country_code: 'sn' };
    const { result } = renderHook(() => useGeoSuggestion());
    expect(result.current.defaults.country).toBe('SN');
  });
});
