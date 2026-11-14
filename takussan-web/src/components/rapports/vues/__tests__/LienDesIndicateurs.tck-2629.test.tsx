/**
 * TCK-2629 — « Personnaliser les chiffres » s'ouvre SUR LA PAGE (créer, réordonner, masquer, supprimer) :
 * il n'est rendu, et les indicateurs de l'agence ne sont lus, qu'à qui ouvre les indicateurs
 * (`indicateursOuverts` : l'admin et l'hôte, hors `analytics` masqué). Ni l'agent ni le bailleur.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ContexteServeurDesRapports } from '@/lib/rapports/contexte-serveur';

const etat = vi.hoisted(() => ({ contexte: {} as Partial<ContexteServeurDesRapports> }));
const lectures = vi.hoisted(() => ({ configs: vi.fn(), catalogue: vi.fn() }));

vi.mock('@/lib/rapports/contexte-serveur', () => ({ lireLeContexteDesRapports: async () => etat.contexte }));
vi.mock('@/lib/queries/kpis', () => ({ fetchKpiConfigs: lectures.configs, fetchKpiMetricsCatalog: lectures.catalogue }));
vi.mock('@/components/rapports/indicateurs/ReglageDesChiffres', () => ({ PersonnaliserLesChiffres: () => 'reglage' }));

const { LienDesIndicateurs } = await import('../LienDesIndicateurs');

beforeEach(() => {
  lectures.configs.mockReset().mockResolvedValue({ data: [] });
  lectures.catalogue.mockReset().mockResolvedValue({ data: [] });
});

describe('TCK-2629 — qui reçoit « Personnaliser les chiffres »', () => {
  it.each(['agent', 'bailleur', 'locataire'] as const)('%s : rien, et aucune lecture des indicateurs', async (persona) => {
    etat.contexte = { persona, modulesMasques: [] };
    expect(await LienDesIndicateurs({})).toBeNull();
    expect(lectures.configs).not.toHaveBeenCalled();
    expect(lectures.catalogue).not.toHaveBeenCalled();
  });

  it('admin d’agence avec `analytics` masqué : rien', async () => {
    etat.contexte = { persona: 'admin-agence', modulesMasques: ['analytics'] };
    expect(await LienDesIndicateurs({})).toBeNull();
    expect(lectures.configs).not.toHaveBeenCalled();
  });

  it('admin d’agence : le réglage, sur les indicateurs lus', async () => {
    etat.contexte = { persona: 'admin-agence', modulesMasques: [] };
    expect(await LienDesIndicateurs({})).not.toBeNull();
    expect(lectures.configs).toHaveBeenCalledTimes(1);
  });

  it('une lecture en échec retire le geste, sans casser la page', async () => {
    etat.contexte = { persona: 'hote', modulesMasques: [] };
    lectures.configs.mockRejectedValue(new Error('500'));
    expect(await LienDesIndicateurs({})).toBeNull();
  });
});
