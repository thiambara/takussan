/**
 * TCK-2600 — la position collée se résout par la route PUBLIQUE sans compte (TCK-2599) : la route
 * sous session rendrait 401 au visiteur de `/publish`. Connecté, la route d'aujourd'hui.
 */
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const etat = vi.hoisted(() => ({ user: null as { id: number } | null, chemins: [] as string[] }));

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: etat.user }) }));
vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: vi.fn(),
  useApiMutation: (options: { path: string }) => {
    etat.chemins.push(options.path);
    return { mutate: vi.fn(), isPending: false };
  },
}));

import { useResolutionDeLien } from '../useReferentielGeo';

beforeEach(() => {
  etat.chemins = [];
});

describe('useResolutionDeLien (TCK-2600)', () => {
  it('sans compte : la route publique', () => {
    etat.user = null;
    renderHook(() => useResolutionDeLien());
    expect(etat.chemins.at(-1)).toBe('/api/public/geo/resolve-link');
  });

  it('connecté : la route sous session', () => {
    etat.user = { id: 1 };
    renderHook(() => useResolutionDeLien());
    expect(etat.chemins.at(-1)).toBe('/api/geo/resolve-link');
  });
});
