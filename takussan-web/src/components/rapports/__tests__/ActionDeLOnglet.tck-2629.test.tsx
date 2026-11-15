/**
 * TCK-2629 (O10, fidélité a-5 au bureau) — une action de tête PAR ONGLET dans l'en-tête de « Rapports » :
 * sur l'onglet Alertes, « + Nouvelle alerte » à la place d'« Exporter » (maquette a-5 1280), qui ouvre le
 * formulaire de la liste ; sur tout autre onglet, « Exporter » comme avant. Dans « Rapports », la liste n'a
 * plus de bouton à elle (l'en-tête au bureau, le « + » de la coque au téléphone).
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';

const navigation = vi.hoisted(() => ({ chemin: '/app/reports/alerts' }));
vi.mock('next/navigation', () => ({ usePathname: () => navigation.chemin }));
vi.mock('@/app/actions/alerts', () => ({
  createThresholdAlertAction: vi.fn(),
  deleteThresholdAlertAction: vi.fn(),
  updateThresholdAlertAction: vi.fn(),
}));

const { ActionDeLOnglet, FournisseurDActionDOnglet } = await import('../ActionDeLOnglet');
const { AlertList } = await import('../alertes/AlertList');

const T = fr.rapports.alertes;
const EXPORTER = <span>Exporter</span>;

function rendre(avecListe = true) {
  render(
    withIntl(
      <FournisseurDActionDOnglet>
        <header data-testid="tete">
          <ActionDeLOnglet exporter={EXPORTER} />
        </header>
        {avecListe ? <AlertList initialAlerts={[]} /> : null}
      </FournisseurDActionDOnglet>,
    ),
  );
}

describe('TCK-2629 — l’action de tête de l’onglet', () => {
  it('onglet Alertes : « Nouvelle alerte » en tête, pas « Exporter », et il ouvre le formulaire de la liste', async () => {
    navigation.chemin = '/app/reports/alerts';
    rendre();
    const tete = screen.getByTestId('tete');
    expect(tete).not.toHaveTextContent('Exporter');
    const bouton = tete.querySelector('button') as HTMLButtonElement;
    expect(bouton).toHaveTextContent(T.nouvelle);
    // Aucun autre bouton « Nouvelle alerte » dans la page (le « + » du téléphone est dans la coque).
    expect(screen.getAllByRole('button', { name: T.nouvelle })).toEqual([bouton]);
    fireEvent.click(bouton);
    expect(await screen.findByLabelText(fr.dashboard.alerts.threshold)).toBeInTheDocument();
  });

  it('tout autre onglet : « Exporter », comme avant', () => {
    for (const chemin of ['/app/reports', '/app/reports/exports', '/app/reports/unpaid']) {
      navigation.chemin = chemin;
      const { unmount } = render(withIntl(<FournisseurDActionDOnglet><ActionDeLOnglet exporter={EXPORTER} /></FournisseurDActionDOnglet>));
      expect(screen.getByText('Exporter')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: T.nouvelle })).toBeNull();
      unmount();
    }
  });

  it('hors de « Rapports » (aucun fournisseur), la liste garde son bouton dès md', () => {
    render(withIntl(<AlertList initialAlerts={[]} />));
    const boutons = screen.getAllByRole('button', { name: T.nouvelle });
    expect(boutons.some((b) => /max-md:hidden/.test(b.className))).toBe(true);
  });
});
