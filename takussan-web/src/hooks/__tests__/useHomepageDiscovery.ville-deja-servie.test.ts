import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

/**
 * TCK-1231 (P103.06) — l'accueil ne redemande pas `discovery` quand la ville devinée est celle que
 * le serveur a déjà servie.
 *
 * Sans ville, l'API sert sa ville de référence, Dakar ; avec `near_city=Dakar`, elle rend les mêmes
 * rangées (mesuré par l'explorateur). Le crochet relançait pourtant, pour une seconde d'appel qui
 * ne change rien à l'écran.
 */

const mockApiFetch = vi.fn();
vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

import { useHomepageDiscovery } from '../useHomepageDiscovery';
import type { HomepageDiscoveryData, PropertyListItem } from '@/types/property';

const bien = (id: number) => ({ id, slug: `bien-${id}`, title: `Bien ${id}` }) as PropertyListItem;

const SEMEES: HomepageDiscoveryData = {
  near: { items: [bien(1)], city: 'Dakar', requested_city: null, fallback: false },
  rent: { items: [bien(2)] },
  featured: { items: [bien(3)] },
  latest: { items: [bien(4)] },
};

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue({ data: SEMEES, meta: { per_row: 12 } });
});

describe('useHomepageDiscovery — ville déjà servie', () => {
  it('ville devinée égale, sans casse, à la ville semée : aucun appel', async () => {
    renderHook(() => useHomepageDiscovery({ donneesInitiales: SEMEES, enabled: true, nearCity: 'dakar' }));

    await new Promise((r) => setTimeout(r, 30));
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('ville devinée différente : une relance', async () => {
    renderHook(() => useHomepageDiscovery({ donneesInitiales: SEMEES, enabled: true, nearCity: 'Thiès' }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    expect(String(mockApiFetch.mock.calls[0][0])).toContain('near_city=Thi%C3%A8s');
  });
});
