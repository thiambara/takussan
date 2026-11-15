import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { lireLoyersDuMois } from '@/lib/accueil/loyers-du-mois';

import { LoyersDuMois } from '../LoyersDuMois';

/** TCK-2820, AC4 — l'accueil du bailleur nourri de la réponse d'AC1 : « 2 en retard » et « 1 reçu puis remboursé ». */
const AC1 = {
  received_count: 8,
  expected_count: 14,
  received_amount: 2_400_000,
  overdue_count: 2,
  overdue_amount: 600_000,
  upcoming_count: 3,
  upcoming_amount: 750_000,
  refunded_count: 1,
  refunded_amount: 300_000,
};

const bloc = () => screen.getByRole('region', { name: 'Loyers de novembre' });

describe('AC4 — un loyer échu remboursé n’est pas « en retard »', () => {
  it('les segments restent rendus, et la part « reçu puis remboursé » dit son montant, sans couleur d’alerte', () => {
    render(withIntl(<LoyersDuMois loyers={lireLoyersDuMois({ rent_month: AC1 })!} jour="2026-11-13" />));
    expect(within(bloc()).getByText('2 en retard')).toBeTruthy();
    expect(within(bloc()).getByText('3 à venir')).toBeTruthy();
    const part = within(bloc()).getByText('1 reçu puis remboursé').closest('[data-slot="loyers-rembourses"]') as HTMLElement;
    expect(part).toBeTruthy();
    expect(part.textContent).toMatch(/300\s*k\s*F/);
    expect(part.innerHTML).not.toMatch(/destructive|warning/);
  });

  it('au pluriel', () => {
    render(withIntl(<LoyersDuMois loyers={lireLoyersDuMois({ rent_month: { ...AC1, overdue_count: 1, refunded_count: 2 } })!} jour="2026-11-13" />));
    expect(within(bloc()).getByText('2 reçus puis remboursés')).toBeTruthy();
  });

  it('aucun remboursé : aucune part', () => {
    render(withIntl(<LoyersDuMois loyers={lireLoyersDuMois({ rent_month: { ...AC1, overdue_count: 3, refunded_count: 0, refunded_amount: 0 } })!} jour="2026-11-13" />));
    expect(within(bloc()).getByText('3 en retard')).toBeTruthy();
    expect(document.querySelector('[data-slot="loyers-rembourses"]')).toBeNull();
  });
});
