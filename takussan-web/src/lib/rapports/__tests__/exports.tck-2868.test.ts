import { describe, expect, it } from 'vitest';

import { PREREGLAGES, bornesDuPrereglage, prereglageDe } from '../exports';
import { ecrituresDuReglage, inverse, type ChiffreRegle } from '../indicateurs';

/** TCK-2868 — « Trimestre » rejoint les préréglages, dans l'ordre de la maquette ; « Autre… » n'en est pas un. */
describe('TCK-2868 — le préréglage « Trimestre »', () => {
  it('AC5 — le trimestre COURANT : octobre–décembre le 10 novembre, janvier–mars le 3 février', () => {
    expect(bornesDuPrereglage('trimestre', new Date('2026-11-10T10:00:00Z'))).toEqual({ from: '2026-10-01', to: '2026-12-31' });
    expect(bornesDuPrereglage('trimestre', new Date('2027-02-03T00:30:00Z'))).toEqual({ from: '2027-01-01', to: '2027-03-31' });
    expect(bornesDuPrereglage('trimestre', new Date('2027-06-30T23:59:00Z'))).toEqual({ from: '2027-04-01', to: '2027-06-30' });
  });

  it('dans l’ordre de la maquette : Ce mois · Mois dernier · Trimestre · Année', () => {
    expect(PREREGLAGES).toEqual(['ceMois', 'moisDernier', 'trimestre', 'annee']);
  });

  it('les bornes d’un trimestre rallument sa puce', () => {
    expect(prereglageDe({ from: '2026-10-01', to: '2026-12-31' }, new Date('2026-11-10T10:00:00Z'))).toBe('trimestre');
  });
});

/** TCK-2868 (AC6) — le libellé et le format d'un chiffre affiché partent avec l'ordre, et se défont avec lui. */
describe('TCK-2868 — libellé et format dans les écritures du réglage', () => {
  const avant: ChiffreRegle[] = [
    { id: 1, metric: 'properties_total', label: 'Biens', format: 'number', sort_order: 0, is_enabled: true },
    { id: 2, metric: 'revenue_month', label: 'Encaissé', format: 'currency', sort_order: 1, is_enabled: true },
  ];

  it('un libellé changé (sans ses blancs de bord) et un format changé : une seule écriture, pour cette ligne', () => {
    const apres = [{ ...avant[0]!, label: '  Biens publiés ', format: 'percent' as const }, avant[1]!];
    expect(ecrituresDuReglage(avant, apres)).toEqual([{ id: 1, label: 'Biens publiés', format: 'percent' }]);
  });

  it('rien de changé : aucune écriture ; le même libellé à des blancs près non plus', () => {
    expect(ecrituresDuReglage(avant, [{ ...avant[0]!, label: 'Biens ' }, avant[1]!])).toEqual([]);
  });

  it('l’inverse rend l’ancien libellé et l’ancien format', () => {
    expect(inverse({ id: 1, label: 'Biens publiés', format: 'percent' }, avant)).toEqual({ id: 1, label: 'Biens', format: 'number' });
  });
});
