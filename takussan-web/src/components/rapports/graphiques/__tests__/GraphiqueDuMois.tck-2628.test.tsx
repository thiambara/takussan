import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { withIntl } from '@/test/intl';

import { GraphiqueDuMois } from '../GraphiqueDuMois';

const MOIS = ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
const ENCAISSE = [46.2, 48.9, 51.4, 53, 55.8, 54.1, 57.6, 60.3, 62.7, 69.3, 88.1, 101.394241].map((v) => Math.round(v * 1_000_000));

const graduations = (c: HTMLElement) => [...c.querySelectorAll('[data-graduation]')].map((e) => e.textContent?.replace(/\s/g, ' '));
const bulle = (c: HTMLElement) => c.querySelector('[data-slot="bulle"]')?.textContent?.replace(/\s/g, ' ');

describe('TCK-2628 — un graphique de Rapports', () => {
  it('AC5 — des graduations rondes en millions, jamais la valeur brute', () => {
    const { container } = render(withIntl(<GraphiqueDuMois mois={MOIS} valeurs={ENCAISSE} unite="montant" libelle="Encaissé" />));
    expect(graduations(container)).toEqual(['0', '100 M', '200 M']);
    expect(container.textContent).not.toMatch(/101\s?394\s?241/);
  });

  it('AC5 — une seule série : une barre par mois, une couleur', () => {
    const { container } = render(withIntl(<GraphiqueDuMois mois={MOIS} valeurs={ENCAISSE} unite="montant" libelle="Encaissé" />));
    expect(container.querySelectorAll('[data-mois]')).toHaveLength(12);
    expect(container.querySelectorAll('.bg-chart-2, .bg-chart-3, .bg-chart-4')).toHaveLength(0);
  });

  it('la bulle sur le dernier mois mesuré ; ← la déplace d’un mois', () => {
    const { container } = render(withIntl(<GraphiqueDuMois mois={MOIS} valeurs={[...ENCAISSE.slice(0, 11), null]} unite="montant" libelle="Encaissé" />));
    expect(bulle(container)).toBe('Oct. 2026 · 88,1 M F');
    const curseur = screen.getByRole('slider', { name: 'Encaissé' });
    fireEvent.keyDown(curseur, { key: 'ArrowLeft' });
    expect(bulle(container)).toBe('Sept. 2026 · 69,3 M F');
    expect([curseur.getAttribute('aria-valuetext')?.replace(/\s/g, ' '), curseur.getAttribute('aria-valuenow')]).toEqual(['Sept. 2026 · 69,3 M F', '9']);
  });

  it('un taux : 0 · 50 % · 100 %, une courbe coupée sur un mois sans mesure', () => {
    const valeurs = [64, 65, null, 68, 67, 69, 70, 71, 70, 72, 72, 73];
    const { container } = render(withIntl(<GraphiqueDuMois mois={MOIS} valeurs={valeurs} unite="pourcent" forme="courbe" libelle="Occupation" />));
    expect(graduations(container)).toEqual(['0 %', '50 %', '100 %']);
    expect(container.querySelectorAll('polyline')).toHaveLength(2);
  });

  it('le tableau des valeurs est dans le document, pour un lecteur d’écran', () => {
    render(withIntl(<GraphiqueDuMois mois={MOIS} valeurs={ENCAISSE} unite="montant" libelle="Encaissé" />));
    expect(screen.getByRole('table', { name: 'Encaissé' })).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(12);
  });
});
