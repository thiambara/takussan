/**
 * TCK-2644 (AC5) — le locataire qui n'a qu'UN bail arrive sur sa fiche : `(liste)/layout.tsx` le
 * redirige, au-dessus du `loading.tsx` du groupe (TCK-426 : 307, pas 200). Plusieurs baux : la liste
 * simple. Le personnel et le bailleur ne sont jamais redirigés, et ne lisent rien de plus.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url};307;` });
  }),
);
const getMeAction = vi.hoisted(() => vi.fn());
const apiRequest = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ redirect }));
vi.mock('@/app/actions/auth', () => ({ getMeAction }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/api', () => ({ apiRequest }));
const messagesPour = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock('@/i18n/messages', () => ({ messagesPour }));
vi.mock('@/i18n/IntlProvider', () => ({ IntlProvider: ({ children }: { children: unknown }) => children }));

import Layout from '../layout';

beforeEach(() => {
  redirect.mockClear();
  apiRequest.mockReset();
});

describe('TCK-2644 — /app/leases selon le lecteur', () => {
  it('AC5 — le locataire de la démo (un bail) arrive sur /app/leases/{id}', async () => {
    getMeAction.mockResolvedValue({ id: 1, roles: ['customer', 'tenant'] });
    apiRequest.mockResolvedValue({ data: [{ id: 85 }], meta: { total: 1 } });
    await expect(Layout({ children: null })).rejects.toThrow(/NEXT_REDIRECT/);
    expect(redirect).toHaveBeenCalledWith('/app/leases/85');
    // Une lecture minimale : l'identifiant, deux lignes au plus.
    expect(apiRequest.mock.calls[0][0]).toBe('/api/leases?fields[leases]=id&per_page=2');
  });

  it('un locataire qui a plusieurs baux reste sur la liste simple', async () => {
    getMeAction.mockResolvedValue({ id: 1, roles: ['customer', 'tenant'] });
    apiRequest.mockResolvedValue({ data: [{ id: 85 }, { id: 86 }], meta: { total: 2 } });
    await expect(Layout({ children: 'liste' })).resolves.toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('une lecture en panne ne redirige pas : la liste dira son erreur', async () => {
    getMeAction.mockResolvedValue({ id: 1, roles: ['customer', 'tenant'] });
    apiRequest.mockRejectedValue(new Error('panne'));
    await expect(Layout({ children: 'liste' })).resolves.toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });

  it.each([
    ['agent', ['customer', 'agent']],
    ['admin d’agence', ['customer', 'agency_admin']],
    ['bailleur', ['customer', 'owner']],
  ])('%s : jamais redirigé, aucune lecture de plus', async (_nom, roles) => {
    getMeAction.mockResolvedValue({ id: 1, roles });
    apiRequest.mockResolvedValue({ data: [{ id: 85 }], meta: { total: 1 } });
    await expect(Layout({ children: 'liste' })).resolves.toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('le groupe est sa propre frontière de dictionnaire (la feuille de relance lit `admin`)', async () => {
    getMeAction.mockResolvedValue({ id: 1, roles: ['customer', 'agent'] });
    await Layout({ children: 'liste' });
    expect(messagesPour).toHaveBeenCalledWith('(dashboard)/app/leases/(liste)');
  });
});
