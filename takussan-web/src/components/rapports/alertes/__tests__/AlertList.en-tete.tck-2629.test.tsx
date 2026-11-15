/**
 * TCK-2629 (AC-F3, relevé de fidélité a-5 du 2026-11-14) — au téléphone, « Nouvelle alerte » est le « + »
 * rond de l'en-tête de la coque (maquette a-5), déclaré par la page ; le bouton de la page ne se montre
 * qu'à partir de `md`, où l'en-tête du téléphone n'existe plus.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FournisseurDEnTete, useDeclarationDEnTete } from '@/components/layout/en-tete-de-la-coque';
import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';

vi.mock('@/app/actions/alerts', () => ({
  createThresholdAlertAction: vi.fn(),
  deleteThresholdAlertAction: vi.fn(),
  updateThresholdAlertAction: vi.fn(),
}));

const { AlertList } = await import('../AlertList');

const T = fr.rapports.alertes;

function EnTete() {
  const { action } = useDeclarationDEnTete();
  return <header data-testid="en-tete">{action}</header>;
}

describe('TCK-2629 — « Nouvelle alerte » dans l’en-tête du téléphone', () => {
  it('le « + » de l’en-tête ouvre le formulaire ; le bouton de la page est caché sous md', async () => {
    render(
      withIntl(
        <FournisseurDEnTete>
          <EnTete />
          <AlertList initialAlerts={[]} />
        </FournisseurDEnTete>,
      ),
    );
    const plus = screen.getByTestId('en-tete').querySelector('button');
    expect(plus).toHaveAccessibleName(T.nouvelle);
    const dansLaPage = screen.getAllByRole('button', { name: T.nouvelle }).filter((b) => b !== plus);
    for (const b of dansLaPage) expect(b.className).toMatch(/max-md:hidden/);
    fireEvent.click(plus as HTMLButtonElement);
    expect(await screen.findByLabelText(fr.dashboard.alerts.threshold)).toBeInTheDocument();
  });
});
