import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { withIntl } from '@/test/intl';

import { GraphiquesDuRapport, type SerieDuRapport } from '../GraphiquesDuRapport';

const MOIS = ['2026-09', '2026-10', '2026-11'];
const ENCAISSE: SerieDuRapport = { id: 'encaisse', mois: MOIS, valeurs: [80_000_000, 100_000_000, 3_000_000] };
const OCCUPATION: SerieDuRapport = { id: 'occupation', mois: MOIS, valeurs: [64, null, 73] };

function bloc(titre: string) {
  return screen.getByRole('heading', { name: titre }).closest('[data-slot="bloc-graphique"]') as HTMLElement;
}

describe('TCK-2628 — les graphiques de la vue d’ensemble', () => {
  it('un bloc par série, chacun une seule série (AC5), le total au-dessus du tracé', () => {
    render(withIntl(<GraphiquesDuRapport series={[ENCAISSE, OCCUPATION]} moisEnCours="2026-11" />));
    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual(['Encaissé · 12 derniers mois', 'Occupation · 12 derniers mois']);
    expect(bloc('Encaissé · 12 derniers mois').querySelector('.font-display')?.textContent).toMatch(/^183\sM\sF$/);
    expect(bloc('Encaissé · 12 derniers mois').querySelectorAll('[data-mois]')).toHaveLength(3);
  });

  it('la variation compare le dernier mois CLOS : novembre en cours n’est pas comparé à octobre', () => {
    render(withIntl(<GraphiquesDuRapport series={[ENCAISSE]} moisEnCours="2026-11" />));
    const variation = bloc('Encaissé · 12 derniers mois').querySelector('[data-ton]') as HTMLElement;
    expect(variation.textContent).toBe('octobre : +25 % sur septembre');
    expect(variation.dataset.ton).toBe('succes');
  });

  it('un taux : sa dernière mesure, et son écart en points sur la série', () => {
    render(withIntl(<GraphiquesDuRapport series={[OCCUPATION]} moisEnCours="2026-11" />));
    const b = bloc('Occupation · 12 derniers mois');
    expect(b.querySelector('.font-display')?.textContent).toMatch(/^73\s%$/);
    expect(b.querySelector('[data-ton]')?.textContent).toBe('+9 points en un an');
  });

  it('les commissions : leur part depuis janvier, sans ton', () => {
    const s: SerieDuRapport = { id: 'commissions', mois: ['2025-12', '2026-01', '2026-02'], valeurs: [500_000, 200_000, 300_000] };
    render(withIntl(<GraphiquesDuRapport series={[s]} moisEnCours="2026-02" />));
    const v = bloc('Commissions · 12 derniers mois').querySelector('[data-ton]') as HTMLElement;
    expect([v.textContent, v.dataset.ton]).toEqual(['dont 500 k F depuis janvier', 'neutre']);
  });

  it('au téléphone, un graphique à la fois : les segments choisissent celui qu’on voit', () => {
    render(withIntl(<GraphiquesDuRapport series={[ENCAISSE, OCCUPATION]} moisEnCours="2026-11" />));
    const choix = screen.getByRole('group', { name: 'Graphique affiché' });
    expect(choix.className).toContain('md:hidden');
    expect(bloc('Occupation · 12 derniers mois').className).toContain('max-md:hidden');
    fireEvent.click(within(choix).getByRole('button', { name: 'Occupation' }));
    expect(bloc('Occupation · 12 derniers mois').className).not.toContain('max-md:hidden');
    expect(bloc('Encaissé · 12 derniers mois').className).toContain('max-md:hidden');
    expect(within(choix).getByRole('button', { name: 'Occupation' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('une seule série : pas de segments', () => {
    render(withIntl(<GraphiquesDuRapport series={[ENCAISSE]} moisEnCours="2026-11" />));
    expect(screen.queryByRole('group', { name: 'Graphique affiché' })).toBeNull();
  });
});
