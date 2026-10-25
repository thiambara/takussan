import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P220.07 (TCK-2281) — l'écran d'acceptation d'un compte connecté ne connaissait pas le nom que
 * l'agence avait saisi. `GET /api/invitations/{token}/prefill` le rend au destinataire sans nom,
 * `data: null` à tout autre compte ; un échec de lecture ne bloque pas l'acceptation.
 */
const apiRequest = vi.fn();
vi.mock('@/lib/api', () => ({ apiRequest: (...a: unknown[]) => apiRequest(...a) }));

import { lireNomsPreremplis } from '../invitation-prerempli';

describe('lireNomsPreremplis', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lit le prérempli de l’invitation avec la session', async () => {
    apiRequest.mockResolvedValue({ data: { first_name: 'Awa', last_name: 'Sarr' } });

    await expect(lireNomsPreremplis('jeton abc', 'session')).resolves.toEqual({ prenom: 'Awa', nom: 'Sarr' });
    expect(apiRequest).toHaveBeenCalledWith('/api/invitations/jeton%20abc/prefill', { token: 'session' });
  });

  it('ne rend rien quand l’API ne rend rien, ou ne répond pas', async () => {
    apiRequest.mockResolvedValueOnce({ data: null });
    await expect(lireNomsPreremplis('j', 's')).resolves.toBeNull();

    apiRequest.mockRejectedValueOnce(new Error('410'));
    await expect(lireNomsPreremplis('j', 's')).resolves.toBeNull();

    // Un jeton qui réécrirait le chemin est refusé par `cheminApi` : aucun appel ne part.
    apiRequest.mockClear();
    await expect(lireNomsPreremplis('../admin', 's')).resolves.toBeNull();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
