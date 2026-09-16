import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TIMEZONE } from '@/i18n/config';
import { usePropertyMapQuery, type MapBounds } from '../properties';

/**
 * Retour d'administration du 2026-09-16 : « sur la carte, le popup d'un point s'ouvre puis se
 * referme tout seul ». Reproduit au navigateur — ouvert à 250 ms, fermé à 500 ms.
 *
 * La chaîne : l'ouverture déplace la vue (`autoPan`) → nouvelles bornes → nouvelle clé de requête.
 * Si `data` repasse à `undefined` pendant ce rechargement, `PropertyMap` rend zéro `<Marker>`, et
 * Leaflet ferme le popup du marqueur retiré. Ce test fige la moitié qui se teste sans Leaflet :
 * **les marqueurs précédents restent pendant que les nouveaux arrivent.**
 */
function reponse(ids: number[]) {
  return {
    type: 'FeatureCollection',
    features: ids.map((id) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-17.4, 14.7] },
      properties: { id, slug: `bien-${id}`, title: `Bien ${id}`, price: 1000, currency: 'XOF', contract_type: 'sale', thumbnail: null },
    })),
    meta: { truncated: false, returned: ids.length },
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <NextIntlClientProvider locale="fr" messages={{}} timeZone={TIMEZONE} now={new Date()}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </NextIntlClientProvider>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('usePropertyMapQuery — un déplacement de la carte ne vide pas les marqueurs', () => {
  it('garde les marqueurs des bornes précédentes tant que les nouvelles ne sont pas servies', async () => {
    let liberer: () => void = () => {};
    let appel = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        appel += 1;
        const corps = appel === 1 ? reponse([1, 2]) : reponse([3]);
        // La seconde réponse est RETENUE : c'est la fenêtre où le popup se fermait.
        if (appel > 1) await new Promise<void>((r) => { liberer = r; });
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => corps,
          text: async () => JSON.stringify(corps),
        };
      }),
    );

    const b1: MapBounds = { swLat: 14, swLng: -18, neLat: 15, neLng: -17 };
    const b2: MapBounds = { swLat: 14.1, swLng: -18, neLat: 15.1, neLng: -17 };
    const { result, rerender } = renderHook(({ bornes }) => usePropertyMapQuery(bornes), {
      wrapper,
      initialProps: { bornes: b1 },
    });

    await waitFor(() => expect(result.current.data?.features).toHaveLength(2));

    rerender({ bornes: b2 });
    await waitFor(() => expect(appel).toBe(2));

    // Le cœur du retour : pendant le rechargement, les deux marqueurs sont TOUJOURS là.
    expect(result.current.isFetching).toBe(true);
    expect(result.current.data?.features.map((f) => f.properties.id)).toEqual([1, 2]);

    await act(async () => liberer());
    await waitFor(() => expect(result.current.data?.features.map((f) => f.properties.id)).toEqual([3]));
  });
});
