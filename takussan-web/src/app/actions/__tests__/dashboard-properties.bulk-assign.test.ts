/**
 * TCK-603 — « Changer l'agent responsable » d'un lot passe par UNE action serveur,
 * `bulkAssignPropertiesAction`, qui appelle `POST /api/properties/bulk-assign`.
 *
 * Une action serveur est un point d'entrée que n'importe quel client peut appeler avec n'importe
 * quels arguments : le typage `number[]` ne protège rien à l'exécution. Les identifiants partent dans
 * un CORPS JSON (pas dans un chemin), mais l'action refuse quand même tout ce qui n'est pas un entier
 * positif sûr — `../`, `?`, `NaN`, flottant, négatif, liste vide — sans rien envoyer. C'est la règle
 * que TCK-600 (`cheminApi`, non fusionné) pose pour les chemins, appliquée ici sans l'attendre.
 *
 * Seul `apiRequest` est doublé : l'action et le module de requêtes sont les vrais.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.fn();

vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, apiRequest: (...args: unknown[]) => apiRequestMock(...args) };
});
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton-de-test' }));

import { bulkAssignPropertiesAction } from '../dashboard-properties';

describe('bulkAssignPropertiesAction (TCK-603)', () => {
  beforeEach(() => apiRequestMock.mockReset());

  it('envoie le lot en UN appel à bulk-assign et rend le bilan', async () => {
    const bilan = { updated: 2, updated_ids: [3, 9], unchanged: 1, unchanged_ids: [4], failed: [] };
    apiRequestMock.mockResolvedValueOnce(bilan);

    const res = await bulkAssignPropertiesAction([3, 4, 9], 12);

    expect(res).toEqual({ ok: true, data: bilan });
    expect(apiRequestMock).toHaveBeenCalledTimes(1);
    expect(apiRequestMock).toHaveBeenCalledWith('/api/properties/bulk-assign', {
      method: 'POST',
      body: { property_ids: [3, 4, 9], user_id: 12 },
      token: 'jeton-de-test',
    });
  });

  it.each([
    ['un identifiant de bien en chemin relatif', ['../1'], 12],
    ['un identifiant de bien porteur de requête', ['1?user_id=1'], 12],
    ['un agent en chemin relatif', [1], '../7'],
    ['un agent porteur de requête', [1], '7?x=1'],
    ['NaN', [Number.NaN], 12],
    ['un flottant', [1.5], 12],
    ['un négatif', [-1], 12],
    ['zéro', [0], 12],
    ['un entier non sûr', [2 ** 53], 12],
    ['un agent NaN', [1], Number.NaN],
    ['une liste vide', [], 12],
    ['autre chose qu’une liste', '1,2' as unknown as number[], 12],
  ])('refuse %s sans rien envoyer', async (_cas, ids, userId) => {
    const res = await bulkAssignPropertiesAction(ids as number[], userId as number);

    expect(res).toEqual({ ok: false, status: 422, message: 'Action en lot impossible.' });
    expect(apiRequestMock).not.toHaveBeenCalled();
  });
});
