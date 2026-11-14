/**
 * TCK-2629 — l'onglet « Alertes » dit l'état de chaque alerte : la valeur actuelle et le seuil (lus de
 * `current_value`, jamais 0 à la place d'une valeur absente), le dernier déclenchement, les destinataires
 * (`recipients.count`), le canal et le délai ; création et modification dans le même formulaire.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { updateThresholdAlertAction } from '@/app/actions/alerts';
import type { ThresholdAlert } from '@/lib/queries/alerts';
import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';

vi.mock('@/app/actions/alerts', () => ({
  createThresholdAlertAction: vi.fn(),
  deleteThresholdAlertAction: vi.fn(),
  updateThresholdAlertAction: vi.fn(),
}));

const { AlertList } = await import('../AlertList');

const T = fr.rapports.alertes;

const TAUX: ThresholdAlert = {
  id: 7,
  agency_id: 1,
  metric: 'unpaid_rate_percent',
  operator: '>',
  threshold: 10,
  severity: 'warning',
  is_enabled: true,
  cooldown_hours: 24,
  last_triggered_at: null,
  last_value: null,
  current_value: 3.91,
  recipients: { count: 2, users: [] },
  channels: ['inapp', 'email'],
  triggers: [],
};

const ligneDe = (id: number) => screen.getByRole('table', { name: T.caption }).querySelector(`[data-alerte="${id}"]`) as HTMLElement;

beforeEach(() => {
  vi.mocked(updateThresholdAlertAction).mockReset();
});

describe('TCK-2629 — l’onglet « Alertes »', () => {
  it('AC3 — « Taux d’impayés > 10 % » jamais déclenchée : « 3,91 % », « seuil 10 % », « jamais », et les destinataires comptés', () => {
    render(withIntl(<AlertList initialAlerts={[TAUX]} />));
    const ligne = ligneDe(7);
    expect(ligne).toHaveTextContent(/3,91\s%/u);
    expect(ligne).toHaveTextContent(/seuil 10\s%/u);
    expect(within(ligne).getByText('jamais')).toBeInTheDocument();
    expect(ligne).toHaveTextContent('2 administrateurs');
    expect(ligne).toHaveTextContent('notification et E-mail');
    expect(ligne).toHaveTextContent('24 h');
    // La jauge est lue de `current_value` : 3,91 sur une échelle de 15 (seuil × 1,5).
    expect(ligne.querySelector('[data-slot="jauge"]')).toHaveAttribute('data-part', String(Math.round((3.91 / 15) * 100)));
  });

  it('sans valeur actuelle : « — » et aucune jauge, jamais 0', () => {
    render(withIntl(<AlertList initialAlerts={[{ ...TAUX, current_value: null }]} />));
    const ligne = ligneDe(7);
    expect(ligne).not.toHaveTextContent(/(?<![\d,])0\s%/u);
    expect(ligne).toHaveTextContent('—');
    expect(ligne.querySelector('[data-slot="jauge"]')).toBeNull();
  });

  it('une alerte déclenchée : sa date, et les noms quand l’API les donne', () => {
    render(
      withIntl(
        <AlertList
          initialAlerts={[
            {
              ...TAUX,
              metric: 'occupancy_rate_percent',
              operator: '<',
              threshold: 80,
              current_value: 73,
              recipients: { count: 1, users: [{ id: 3, name: 'Awa Diop' }] },
              triggers: [{ at: '2026-11-03T08:00:00Z', value: 72 }],
            },
          ]}
        />,
      ),
    );
    const ligne = ligneDe(7);
    expect(ligne).toHaveTextContent('Déclenchée le 3 nov.');
    expect(ligne).toHaveTextContent('Awa Diop');
  });

  it('dit que les mesures sont relues toutes les heures', () => {
    render(withIntl(<AlertList initialAlerts={[TAUX]} />));
    expect(screen.getByText(/mesures relues toutes les heures/)).toBeInTheDocument();
  });

  it('« Modifier » envoie le PATCH de l’alerte, et la ligne lit la réponse', async () => {
    vi.mocked(updateThresholdAlertAction).mockResolvedValue({ ok: true, data: { ...TAUX, threshold: 5, current_value: 3.91 } });
    render(withIntl(<AlertList initialAlerts={[TAUX]} />));
    fireEvent.click(within(ligneDe(7)).getByRole('button', { name: /Modifier ou supprimer/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: T.modifier }));
    const seuil = await screen.findByLabelText(fr.dashboard.alerts.threshold);
    fireEvent.change(seuil, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: T.enregistrer }));
    await waitFor(() => expect(updateThresholdAlertAction).toHaveBeenCalledWith(7, expect.objectContaining({ threshold: 5, operator: '>', cooldown_hours: 24 })));
    await waitFor(() => expect(ligneDe(7)).toHaveTextContent(/seuil 5\s%/u));
  });
});
