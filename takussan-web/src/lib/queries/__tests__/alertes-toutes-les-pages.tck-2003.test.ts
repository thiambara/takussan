/**
 * TCK-2003 (P171.02) — la page « Alertes » de l'aperçu lit TOUTES les alertes de seuil de l'agence.
 *
 * Avant : `fetchThresholdAlerts` appelait `/api/threshold-alerts` sans paramètre, et
 * `ThresholdAlertController` rendait la taille par défaut d'Eloquent, 15 : la 16ᵉ alerte agissait
 * sans pouvoir être vue, modifiée ni supprimée. L'API est bouchonnée : 15 par défaut, 100 au plus,
 * `meta.last_page`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchThresholdAlerts } from '../alerts';

vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));

function bouchonnerApi(nombre: number) {
  const alertes = Array.from({ length: nombre }, (_, i) => ({ id: i + 1, metric: 'occupancy_rate' }));
  const lus: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = new URL(String(url), 'http://api.test');
      const perPage = Math.min(Number(u.searchParams.get('per_page') ?? 15), 100);
      const page = Number(u.searchParams.get('page') ?? 1);
      lus.push(`${u.pathname} page=${page} per_page=${u.searchParams.get('per_page')}`);
      return new Response(
        JSON.stringify({
          data: alertes.slice((page - 1) * perPage, page * perPage),
          meta: { current_page: page, last_page: Math.max(1, Math.ceil(alertes.length / perPage)), per_page: perPage, total: alertes.length },
        }),
        { status: 200 },
      );
    }),
  );
  return lus;
}

describe('TCK-2003 — toutes les alertes de seuil', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rend la 16ᵉ alerte, par pages de 100', async () => {
    const lus = bouchonnerApi(16);
    const reponse = await fetchThresholdAlerts();
    expect(reponse?.data).toHaveLength(16);
    expect(reponse?.data.at(-1)?.id).toBe(16);
    expect(lus).toEqual(['/api/threshold-alerts page=1 per_page=100']);
  });

  it('lit les pages suivantes au-delà de 100', async () => {
    const lus = bouchonnerApi(101);
    const reponse = await fetchThresholdAlerts();
    expect(reponse?.data).toHaveLength(101);
    expect(lus).toHaveLength(2);
  });
});
