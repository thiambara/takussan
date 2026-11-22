import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useTelechargementApi } from '../useTelechargementApi';

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton-de-test' }) }));
vi.mock('next-intl', () => ({ useLocale: () => 'fr' }));
vi.mock('@/lib/config-publique', () => ({ origineApi: () => 'https://api.test' }));

/**
 * TCK-2770 — un pilote PDF qui échoue au milieu d'une archive rend un 503 (limite de débit) ou un 502
 * (tout autre échec), jamais un `.zip`. Le hook les range dans la catégorie « echec », que le coffre
 * traduit (« L’archive n’a pas pu être téléchargée. Réessayez. ») : ni la prose de l'API, ni un 500 nu.
 */
describe('useTelechargementApi — un échec du rendu côté serveur', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([502, 503])('un %i se lit « echec », et rien ne se télécharge', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"code":"document.archive_render_failed"}', { status })));
    const lien = vi.spyOn(document, 'createElement');
    const { result } = renderHook(() => useTelechargementApi());

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.telecharger('/api/me/document-vault/archive?folder=receipts%3A2026', 'Quittances 2026.zip');
    });

    expect(ok).toBe(false);
    expect(result.current.echec).toBe('echec');
    expect(lien).not.toHaveBeenCalledWith('a');
  });
});
