/**
 * TCK-2677 — la table de traduction `/app/payments` → « Argent » (ADR-0100 § 7) : une ligne par
 * ligne de la table du ticket, puis ce qui passe et ce qui tombe.
 */
import { describe, expect, it } from 'vitest';

import { adresseDeLArgent } from '../depuis-les-paiements';
import { TAB_VALUES, vueDeLArgent } from '../vue-argent';

const lire = (adresse: string) => {
  const url = new URL(adresse, 'http://x');
  return { chemin: url.pathname, params: Object.fromEntries(url.searchParams) };
};

describe('TCK-2677 — la table de traduction des onglets', () => {
  it.each([
    [{}, 'encaissements'],
    [{ tab: 'history' }, 'encaissements'],
    [{ tab: 'invoices' }, 'factures'],
    [{ tab: 'payouts' }, 'reversements'],
    [{ tab: 'approvals' }, 'a-approuver'],
    [{ tab: 'bills' }, 'interventions'],
  ])('%j → ?tab=%s', (params, onglet) => {
    const { chemin, params: sortie } = lire(adresseDeLArgent(params));
    expect(chemin).toBe('/app/agency/finances');
    expect(sortie).toEqual({ tab: onglet });
    // L'adresse rendue ouvre bien ce registre dans « Argent » (et non le point du mois).
    expect(vueDeLArgent(new URL(adresseDeLArgent(params), 'http://x').searchParams)).toEqual({ sorte: 'registre', onglet });
  });

  it('chaque onglet d’arrivée est une valeur que « Argent » accepte', () => {
    for (const tab of ['history', 'invoices', 'payouts', 'approvals', 'bills']) {
      expect(TAB_VALUES as readonly string[]).toContain(lire(adresseDeLArgent({ tab })).params.tab);
    }
  });

  it('un onglet inconnu valait l’historique : il ouvre les encaissements, sans erreur', () => {
    expect(lire(adresseDeLArgent({ tab: 'nimporte' })).params).toEqual({ tab: 'encaissements' });
    expect(lire(adresseDeLArgent({ tab: '' })).params).toEqual({ tab: 'encaissements' });
  });
});

describe('TCK-2677 — les filtres de l’historique', () => {
  const filtres = { status: 'paid', entity_type: 'lease', entity_id: '12', date_from: '2026-10-01', date_to: '2026-10-31' };

  it('passent avec leur valeur vers les encaissements', () => {
    expect(lire(adresseDeLArgent(filtres)).params).toEqual({ tab: 'encaissements', ...filtres });
    expect(lire(adresseDeLArgent({ tab: 'history', ...filtres })).params).toEqual({ tab: 'encaissements', ...filtres });
  });

  it('ne suivent pas vers un autre registre, qu’ils ne filtraient pas', () => {
    expect(lire(adresseDeLArgent({ tab: 'payouts', ...filtres })).params).toEqual({ tab: 'reversements' });
    expect(lire(adresseDeLArgent({ tab: 'bills', status: 'paid' })).params).toEqual({ tab: 'interventions' });
  });

  it('`page` et tout paramètre inconnu tombent ; une valeur vide aussi', () => {
    expect(lire(adresseDeLArgent({ page: '3', foo: 'bar', status: '', date_to: '2026-10-31' })).params).toEqual({
      tab: 'encaissements',
      date_to: '2026-10-31',
    });
  });

  it('un paramètre répété garde sa première valeur, encodée', () => {
    expect(lire(adresseDeLArgent({ tab: ['invoices', 'payouts'] })).params).toEqual({ tab: 'factures' });
    expect(adresseDeLArgent({ status: ['late', 'paid'] })).toBe('/app/agency/finances?tab=encaissements&status=late');
  });
});
