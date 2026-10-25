import { afterEach, describe, expect, it, vi } from 'vitest';

import fr from '@/messages/fr.json';
import { ApiError, CODES_ERREUR_API, messageErreurApi } from '../api';

/**
 * TCK-2370 (P236.03) — une requête qui n'aboutit pas (`TypeError` de `fetch`) n'accuse plus le
 * réseau de l'utilisateur quand le navigateur se dit en ligne : c'est le serveur qui est
 * injoignable (API arrêtée, 502 ou 503 du mandataire sans en-tête CORS). « Vérifiez votre connexion
 * internet » reste pour `navigator.onLine === false`. Par un relais, la même panne disait déjà
 * « serveur » (`upstream_unavailable`).
 */
function resous(chemin: string): string | undefined {
  const v = chemin
    .split('.')
    .reduce<unknown>((n, k) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[k] : undefined), fr);
  return typeof v === 'string' ? v : undefined;
}
const t = (cle: string) => resous(cle) ?? cle;

const INJOIGNABLE = 'Le serveur est injoignable pour le moment. Réessayez dans un instant.';
const RESEAU = 'La connexion au serveur a échoué. Vérifiez votre connexion internet et réessayez.';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('messageErreurApi — serveur injoignable ou absence de réseau', () => {
  it('le code est au catalogue que le front sait traduire', () => {
    expect(CODES_ERREUR_API).toContain('server_unreachable');
  });

  it('en ligne, un fetch rejeté dit le serveur injoignable', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);

    expect(messageErreurApi(new TypeError('Failed to fetch'), t, 'repli')).toBe(INJOIGNABLE);
  });

  it('hors ligne, il dit toujours de vérifier la connexion', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    expect(messageErreurApi(new TypeError('Failed to fetch'), t, 'repli')).toBe(RESEAU);
  });

  it('sans navigator (action serveur), la panne est celle du serveur', () => {
    vi.stubGlobal('navigator', undefined);
    try {
      expect(messageErreurApi(new TypeError('fetch failed'), t, 'repli')).toBe(INJOIGNABLE);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('le relais en panne garde son libellé « serveur »', () => {
    expect(messageErreurApi(new ApiError(502, { code: 'upstream_unavailable' }), t, 'repli')).toBe(
      'Le serveur a rencontré une erreur. Réessayez dans un instant.',
    );
  });
});
