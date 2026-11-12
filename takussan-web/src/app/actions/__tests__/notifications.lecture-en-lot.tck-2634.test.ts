// @vitest-environment node
/**
 * TCK-2634 — « Tout lire » d'un repli : l'API n'a pas de route en lot, l'action fait l'éventail. Il
 * est BORNÉ à la liste affichée (20 lignes au plus), et un échec partiel est compté, pas avalé : les
 * lignes lues restent lues, l'écran dit combien ne l'ont pas été. Tout échoue → le repli traduit.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import fr from '@/messages/fr.json';
import type { AppNotification } from '@/lib/notifications';

const client = vi.hoisted(() => ({
  fetchNotifications: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: vi.fn(),
  markNotificationUnread: vi.fn(),
}));

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton-A' }));
vi.mock('@/lib/notifications', () => client);
const journal = vi.hoisted(() => ({ journaliserErreurInattendue: vi.fn() }));
vi.mock('@/lib/journal-erreur-action', () => journal);

const { markNotificationsReadAction } = await import('../notifications');

const lue = (id: number) => ({ data: { id, read_at: '2026-11-12T10:00:00Z' } as AppNotification });
const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('TCK-2634 — markNotificationsReadAction', () => {
  // Des accolades : `mockReset()` rend le mock, et une fonction rendue par `beforeEach` est jouée
  // comme nettoyage après le test — le mock aurait été appelé une fois de plus, hors de l'action.
  beforeEach(() => {
    client.markNotificationRead.mockReset();
    journal.journaliserErreurInattendue.mockReset();
  });

  it('borne l’éventail à 20 lignes, même pour une liste plus longue', async () => {
    client.markNotificationRead.mockImplementation(async (_jeton: string, id: number) => lue(id));
    const res = await markNotificationsReadAction(ids(25));

    expect(client.markNotificationRead).toHaveBeenCalledTimes(20);
    expect(res).toEqual({ ok: true, data: { lues: ids(20).map((id) => lue(id).data), echecs: 0 } });
  });

  it('un échec partiel est COMPTÉ, les lignes lues restent', async () => {
    client.markNotificationRead.mockImplementation(async (_jeton: string, id: number) => {
      if (id === 3 || id === 7) throw new Error('500');
      return lue(id);
    });
    const res = await markNotificationsReadAction(ids(9));

    expect(res.ok && res.data.echecs).toBe(2);
    expect(res.ok && res.data.lues.map((l) => l.id)).toEqual([1, 2, 4, 5, 6, 8, 9]);
    // Sans `catch`, l'échec partiel se journalise quand même, une fois par ligne refusée (TCK-775).
    expect(journal.journaliserErreurInattendue).toHaveBeenCalledTimes(2);
  });

  it('tout échoue : le refus traduit, comme les autres gestes', async () => {
    client.markNotificationRead.mockRejectedValue(new Error('500'));
    const res = await markNotificationsReadAction(ids(3));

    expect(res).toEqual({ ok: false, message: fr.serverActions.notifications.markReadFailed });
  });
});
