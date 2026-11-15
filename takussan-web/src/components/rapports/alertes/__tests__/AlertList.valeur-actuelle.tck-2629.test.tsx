/**
 * TCK-2629 (AC-F3, relevé de fidélité du 2026-11-14) — « Nouvelle alerte » dit, sous la métrique, sa valeur
 * actuelle (maquette a-6 : « Valeur actuelle : 27 % »), lue du résumé de l'agence que l'onglet passe
 * (`apercus`, la même table que « Personnaliser »). Sans résumé (hôte, lecture en échec), la ligne n'existe
 * pas ; une mesure absente se lit « — », jamais 0.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';

vi.mock('@/app/actions/alerts', () => ({
  createThresholdAlertAction: vi.fn(),
  deleteThresholdAlertAction: vi.fn(),
  updateThresholdAlertAction: vi.fn(),
}));

const { AlertList } = await import('../AlertList');

const T = fr.rapports.alertes;

function ouvrir(apercus?: Record<string, number | null>) {
  render(withIntl(<AlertList initialAlerts={[]} apercus={apercus} />));
  fireEvent.click(screen.getAllByRole('button', { name: T.nouvelle })[0]);
}

describe('TCK-2629 — la valeur actuelle de la métrique choisie', () => {
  it('« Taux d’impayés » (par défaut) : « Valeur actuelle : 3,9 % »', async () => {
    ouvrir({ unpaid_rate_percent: 3.91, occupancy_rate_percent: 46.94 });
    expect(await screen.findByText(/Valeur actuelle\s:\s3,9\s%/u)).toBeInTheDocument();
  });

  it('une mesure absente se lit « — », jamais 0', async () => {
    ouvrir({ unpaid_rate_percent: null });
    expect(await screen.findByText(/Valeur actuelle\s:\s—/u)).toBeInTheDocument();
  });

  it('sans résumé, aucune ligne', async () => {
    ouvrir(undefined);
    await screen.findByLabelText(fr.dashboard.alerts.threshold);
    expect(screen.queryByText(/Valeur actuelle\s:/u)).toBeNull();
  });
});
