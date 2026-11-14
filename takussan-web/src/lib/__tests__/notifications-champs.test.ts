import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-1326 (P128.05) — la cloche nomme ses colonnes (`fields[app_notifications]`) : sans elles,
 * l'API rendait `data` et `sent_at`, qu'aucun lecteur n'emploie, et resignait à chaque
 * interrogation les pièces d'une retenue sur caution que `data` porte.
 */

const mockApiRequest = vi.fn();

vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, apiRequest: (...args: unknown[]) => mockApiRequest(...args) };
});

const { fetchNotifications } = await import('@/lib/notifications');

function urlAppelee(): URLSearchParams {
  const appel = mockApiRequest.mock.calls.at(-1);
  if (!appel) throw new Error('apiRequest n’a pas été appelé');
  return new URLSearchParams(String(appel[0]).split('?')[1] ?? '');
}

describe('fetchNotifications', () => {
  beforeEach(() => {
    mockApiRequest.mockReset();
    mockApiRequest.mockResolvedValue({ data: [], meta: { total: 0, unread: 0, current_page: 1 } });
  });

  it('demande les seules colonnes que la cloche lit, sans `data`', async () => {
    await fetchNotifications('jeton', { page: 2, perPage: 20, unread: true });

    const champs = (urlAppelee().get('fields[app_notifications]') ?? '').split(',');
    expect(champs).toEqual(
      expect.arrayContaining(['id', 'type', 'code', 'params', 'param_types', 'target', 'title', 'body', 'is_read', 'read_at', 'created_at']),
    );
    expect(champs).not.toContain('data');
    expect(champs).not.toContain('sent_at');
    expect(urlAppelee().get('page')).toBe('2');
    expect(urlAppelee().get('per_page')).toBe('20');
    expect(urlAppelee().get('filter[unread]')).toBe('1');
  });

  it('TCK-2634 — nomme `famille` et `a_traiter` (sans quoi l’API ne les rend pas), et filtre côté serveur', async () => {
    await fetchNotifications('jeton', { perPage: 20, aTraiter: true, familles: ['visite', 'demande'] });

    const champs = (urlAppelee().get('fields[app_notifications]') ?? '').split(',');
    expect(champs).toEqual(expect.arrayContaining(['famille', 'a_traiter']));
    expect(urlAppelee().get('filter[a_traiter]')).toBe('1');
    expect(urlAppelee().get('filter[famille]')).toBe('visite,demande');
    // « À traiter » = à traiter ET non lue : la liste dit ce que dit sa puce (`a_traiter_non_lues`).
    expect(urlAppelee().get('filter[unread]')).toBe('1');
  });

  it('TCK-2634 — sans puce ni famille, aucun de ces filtres', async () => {
    await fetchNotifications('jeton', { perPage: 20 });
    expect(urlAppelee().get('filter[a_traiter]')).toBeNull();
    expect(urlAppelee().get('filter[famille]')).toBeNull();
    expect(urlAppelee().get('filter[unread]')).toBeNull();
  });
});
