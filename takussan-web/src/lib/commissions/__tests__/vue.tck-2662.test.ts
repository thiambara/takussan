/** TCK-2662 — l'état de `/app/commissions` dans l'URL : lu borné, la puce par défaut selon la largeur. */
import { describe, expect, it } from 'vitest';

import { anneesProposees, bornesDeLAnnee, jourDeLInstant, statutAEcrire, statutAffiche, vueDesCommissions } from '../vue';

const lire = (q: string) => vueDesCommissions(new URLSearchParams(q), '2026-11-12');

describe('TCK-2662 — vueDesCommissions', () => {
  it('sans rien : l’année et le mois courants, « Par agent », aucun solde', () => {
    expect(lire('')).toEqual({ statut: null, page: 1, annee: '2026', toutesLesDates: false, mois: '2026-11', lignes: false, agent: null, solder: null });
  });

  it('lit les valeurs connues', () => {
    expect(lire('status=paid&page=3&annee=2025&periode=tout&mois=2026-10&vue=lignes&solder=12')).toEqual({
      statut: 'paid', page: 3, annee: '2025', toutesLesDates: true, mois: '2026-10', lignes: true, agent: null, solder: 12,
    });
    expect(lire('status=toutes').statut).toBe('toutes');
  });

  it('`agent` ouvre le registre de ce bénéficiaire', () => {
    expect(lire('agent=7')).toMatchObject({ agent: 7, lignes: true });
  });

  it('ignore l’inconnu, le futur et le mal formé', () => {
    expect(lire('status=bidon&page=0&annee=2030&mois=2027-01&agent=abc&solder=-1&vue=autre')).toEqual(lire(''));
    expect(lire('mois=2026-13').mois).toBe('2026-11');
  });
});

describe('TCK-2662 — la puce par défaut (décision 4 b)', () => {
  it('sans `status` : « Dues », à toute largeur ; un `status` explicite l’emporte, `toutes` compris', () => {
    expect(statutAffiche({ statut: null })).toBe('due');
    expect(statutAffiche({ statut: 'toutes' })).toBeNull();
    expect(statutAffiche({ statut: 'paid' })).toBe('paid');
  });

  it('écrire « Dues » retire la clé ; « Toutes » s’écrit `toutes`', () => {
    expect(statutAEcrire('due')).toBeNull();
    expect(statutAEcrire(null)).toBe('toutes');
    expect(statutAEcrire('cancelled')).toBe('cancelled');
  });
});

describe('TCK-2662 — dates', () => {
  it('bornes de l’année, années proposées, jour de Dakar d’un instant', () => {
    expect(bornesDeLAnnee('2026')).toEqual({ du: '2026-01-01', au: '2026-12-31' });
    expect(anneesProposees('2026-11-12')).toEqual(['2026', '2025', '2024']);
    expect(jourDeLInstant('2026-11-05T23:30:00Z')).toBe('2026-11-05');
    expect(jourDeLInstant(null)).toBeNull();
  });
});
