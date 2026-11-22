import { afterEach, describe, expect, it, vi } from 'vitest';

import { lireLeReleve, remettreLeReleve } from '../releve';

/**
 * TCK-2641 — « Envoyer le relevé » lit le PDF par un `fetch` porteur du jeton : l'URL doit viser
 * Laravel SOUS `/api` (le piège du préfixe : hors de `api/*`, le navigateur rend un échec CORS, pas
 * un 404), avec le mois et le bailleur. Puis le PDF est partagé comme fichier, ou téléchargé.
 */
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('lireLeReleve', () => {
  it('vise /api/owner-statements/pdf avec le mois et le bailleur, jeton et langue', async () => {
    const fetchMock = vi.fn(async () => new Response(new Blob(['%PDF']), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await lireLeReleve('jeton', '2026-11', 9, 'en');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).pathname).toBe('/api/owner-statements/pdf');
    expect(new URL(url).searchParams.get('period')).toBe('2026-11');
    expect(new URL(url).searchParams.get('landlord_id')).toBe('9');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer jeton', 'Accept-Language': 'en', Accept: 'application/pdf' });
  });

  it('un refus de l’API remonte en ApiError, avec son statut', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 })));
    await expect(lireLeReleve('jeton', '2026-11', 9, 'fr')).rejects.toMatchObject({ status: 403 });
  });
});

describe('remettreLeReleve', () => {
  it('partage le fichier quand le navigateur sait le partager ; refermer la feuille n’est pas un échec', async () => {
    const share = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { canShare: () => true, share });
    expect(await remettreLeReleve(new Blob(['%PDF']), 'releve-2026-11.pdf', 'Relevé')).toBe('partage');
    expect((share.mock.calls[0] as unknown as [{ files: File[] }])[0].files[0]?.name).toBe('releve-2026-11.pdf');
    share.mockRejectedValueOnce(new DOMException('fermé', 'AbortError'));
    expect(await remettreLeReleve(new Blob(['%PDF']), 'releve-2026-11.pdf', 'Relevé')).toBe('abandon');
  });

  it('sans partage de fichier, le PDF se télécharge', async () => {
    vi.stubGlobal('navigator', {});
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    expect(await remettreLeReleve(new Blob(['%PDF']), 'releve-2026-11.pdf', 'Relevé')).toBe('telechargement');
    expect(clic).toHaveBeenCalled();
  });
});
