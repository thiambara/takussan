/**
 * Vérification adverse de TCK-2584 (m1, B16 et B17) — les paramètres de chaque vue de la boîte des
 * demandes : ce qui attend se lit des plus anciennes aux plus récentes, l'historique à l'inverse ;
 * « À moi » ne montre que les demandes à traiter.
 */
import { describe, it, expect } from 'vitest';
import { parametresDesDemandes } from '../contact-leads';
import type { FiltreDesDemandes } from '../contact-leads';

const parametres = (filtre: FiltreDesDemandes) => parametresDesDemandes(filtre, 1);

describe('parametresDesDemandes — l’ordre et le filtre de chaque vue', () => {
  it.each([['todo'], ['unassigned'], ['mine']] as const)('B16 — « %s » : les plus anciennes d’abord', (filtre) => {
    expect(parametres(filtre).sort).toEqual(['created_at']);
  });

  it.each([['handled'], ['all']] as const)('B16 — « %s » : les plus récentes d’abord', (filtre) => {
    expect(parametres(filtre).sort).toEqual(['-created_at']);
  });

  it('B17 — « À moi » ne lit que MES demandes À TRAITER', () => {
    expect(parametres('mine').filter).toEqual({ handled: '0', mine: '1' });
  });

  it('les filtres du bureau s’ajoutent à la vue sans la remplacer', () => {
    expect(parametresDesDemandes('mine', 2, { recherche: ' awa ', bien: 10 }).filter).toEqual({
      handled: '0',
      mine: '1',
      search: 'awa',
      property_id: '10',
    });
  });
});
