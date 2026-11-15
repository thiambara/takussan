/**
 * TCK-2868 — « Qui est prévenu » et « Canal » d'une alerte (TCK-2866) :
 *
 * - AC3 : « Nouvelle alerte » avec « Awa Diop » et « WhatsApp » : la requête porte `recipient_ids` et
 *   `channel = whatsapp` ; le tableau dit « Awa Diop » et « WhatsApp » ;
 * - les choix possibles sont ceux de la MESURE (`recipient-candidates`), relus quand elle change ; aucun
 *   choisi = « Tous les administrateurs » (`recipient_ids: null`) ;
 * - AC7 : « Déclenchements récents » dit ce qui est parti (canal, personnes prévenues), et une alerte
 *   modifiée ne perd pas ses déclenchements.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createThresholdAlertAction, recipientCandidatesAction, updateThresholdAlertAction } from '@/app/actions/alerts';
import type { ThresholdAlert } from '@/lib/queries/alerts';
import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';

vi.mock('@/app/actions/alerts', () => ({
  createThresholdAlertAction: vi.fn(),
  deleteThresholdAlertAction: vi.fn(),
  updateThresholdAlertAction: vi.fn(),
  recipientCandidatesAction: vi.fn(),
}));

const { AlertList } = await import('../AlertList');

const T = fr.rapports.alertes;
const A = fr.dashboard.alerts;

const VACANCE: ThresholdAlert = {
  id: 9,
  agency_id: 1,
  metric: 'occupancy_rate_percent',
  operator: '<',
  threshold: 80,
  severity: 'critical',
  is_enabled: true,
  cooldown_hours: 24,
  last_triggered_at: '2026-11-03T08:00:00Z',
  last_value: 73,
  current_value: 73,
  recipients: { count: 2, users: [{ id: 3, name: 'Awa Diop' }, { id: 4, name: 'Oumy Samb' }] },
  channels: ['inapp', 'email'],
  channel: 'email',
  recipient_ids: [],
  recipient_candidates: [
    { id: 3, name: 'Awa Diop' },
    { id: 4, name: 'Oumy Samb' },
  ],
  triggers: [{ at: '2026-11-03T08:00:00Z', value: 73, channel: 'email', recipients_count: 2 }],
};

const ligneDe = (id: number) => screen.getByRole('table', { name: T.caption }).querySelector(`[data-alerte="${id}"]`) as HTMLElement;

beforeEach(() => {
  vi.mocked(createThresholdAlertAction).mockReset();
  vi.mocked(updateThresholdAlertAction).mockReset();
  vi.mocked(recipientCandidatesAction).mockReset();
  vi.mocked(recipientCandidatesAction).mockImplementation(async (metric) => ({
    ok: true,
    data: metric === 'overdue_amount' ? [{ id: 3, name: 'Awa Diop' }] : [{ id: 3, name: 'Awa Diop' }, { id: 4, name: 'Oumy Samb' }],
  }));
});

/** Le champ « Qui est prévenu », une fois les destinataires possibles lus. */
async function champ() {
  const c = await screen.findByLabelText(T.quiEstPrevenu);
  await waitFor(() => expect(screen.queryByText(T.destinatairesChargement)).toBeNull());
  return c;
}

async function ouvrirLaCreation() {
  fireEvent.click(screen.getAllByRole('button', { name: T.nouvelle })[0]!);
  return champ();
}

describe('TCK-2868 — qui est prévenu, et par quel canal', () => {
  it('AC3 — « Awa Diop » et « WhatsApp » : la requête porte `recipient_ids` et `channel`, le tableau les dit', async () => {
    vi.mocked(createThresholdAlertAction).mockImplementation(async (input) => ({
      ok: true,
      data: {
        ...VACANCE,
        id: 21,
        metric: input.metric,
        triggers: [],
        channel: input.channel,
        channels: ['inapp', 'whatsapp'],
        recipient_ids: input.recipient_ids ?? [],
        recipients: { count: 1, users: [{ id: 3, name: 'Awa Diop' }] },
      },
    }));
    const u = userEvent.setup();
    render(withIntl(<AlertList initialAlerts={[]} />));
    const qui = await ouvrirLaCreation();
    expect(recipientCandidatesAction).toHaveBeenCalledWith('unpaid_rate_percent');
    // Aucun choisi : le champ dit « Tous les administrateurs » (maquette : un champ, comme « Métrique »).
    expect(qui).toHaveTextContent(T.tousLesAdministrateurs);
    await u.click(qui);
    await u.click(await screen.findByRole('option', { name: 'Awa Diop' }));
    await u.keyboard('{Escape}');
    await waitFor(() => expect(qui).toHaveTextContent('Awa Diop'));
    expect(qui).not.toHaveTextContent(T.tousLesAdministrateurs);
    fireEvent.click(within(screen.getByRole('radiogroup', { name: T.colonnes.canal })).getByRole('radio', { name: 'WhatsApp' }));
    fireEvent.click(screen.getByRole('button', { name: A.create }));
    await waitFor(() =>
      expect(createThresholdAlertAction).toHaveBeenCalledWith(expect.objectContaining({ recipient_ids: [3], channel: 'whatsapp' })),
    );
    await waitFor(() => expect(ligneDe(21)).toBeTruthy());
    const ligne = ligneDe(21);
    expect(ligne).toHaveTextContent('Awa Diop');
    expect(ligne).toHaveTextContent('WhatsApp');
    expect(ligne).not.toHaveTextContent('notification');
  });

  it('sans choix, l’alerte part pour « tous » (`recipient_ids: null`) et par e-mail par défaut', async () => {
    vi.mocked(createThresholdAlertAction).mockResolvedValue({ ok: true, data: { ...VACANCE, id: 22 } });
    render(withIntl(<AlertList initialAlerts={[]} />));
    await ouvrirLaCreation();
    fireEvent.click(screen.getByRole('button', { name: A.create }));
    await waitFor(() =>
      expect(createThresholdAlertAction).toHaveBeenCalledWith(expect.objectContaining({ recipient_ids: null, channel: 'email' })),
    );
  });

  it('changer de mesure relit les destinataires possibles et retire un choix qui n’en est plus', async () => {
    vi.mocked(updateThresholdAlertAction).mockResolvedValue({ ok: true, data: VACANCE });
    render(withIntl(<AlertList initialAlerts={[{ ...VACANCE, recipient_ids: [4] }]} />));
    fireEvent.click(within(ligneDe(9)).getByRole('button', { name: /Modifier ou supprimer/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: T.modifier }));
    const qui = await champ();
    expect(qui).toHaveTextContent('Oumy Samb');
    // La mesure change (« Montant des impayés ») : Oumy Samb n'en est pas destinataire possible.
    vi.mocked(recipientCandidatesAction).mockClear();
    const u = userEvent.setup();
    await u.click(screen.getByLabelText(A.metric));
    await u.click(await screen.findByRole('option', { name: fr.dashboard.kpis.metrics.overdue_amount }));
    await waitFor(() => expect(recipientCandidatesAction).toHaveBeenCalledWith('overdue_amount'));
    await waitFor(() => expect(qui).toHaveTextContent(T.tousLesAdministrateurs));
    fireEvent.click(screen.getByRole('button', { name: T.enregistrer }));
    await waitFor(() =>
      expect(updateThresholdAlertAction).toHaveBeenCalledWith(9, expect.objectContaining({ metric: 'overdue_amount', recipient_ids: null })),
    );
  });

  it('AC7 — « Déclenchements récents » dit le canal et les personnes prévenues ; modifier l’alerte ne les vide pas', async () => {
    vi.mocked(updateThresholdAlertAction).mockResolvedValue({ ok: true, data: { ...VACANCE, threshold: 75, triggers: undefined } });
    render(withIntl(<AlertList initialAlerts={[VACANCE]} />));
    const recents = () => screen.getByRole('region', { name: T.recents });
    expect(within(recents()).getByText('E-mail · 2 personnes prévenues')).toBeInTheDocument();
    fireEvent.click(within(ligneDe(9)).getByRole('button', { name: /Modifier ou supprimer/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: T.modifier }));
    await champ();
    fireEvent.click(screen.getByRole('button', { name: T.enregistrer }));
    await waitFor(() => expect(updateThresholdAlertAction).toHaveBeenCalled());
    await waitFor(() => expect(ligneDe(9)).toHaveTextContent(/75\s%/u));
    expect(within(recents()).getByText('E-mail · 2 personnes prévenues')).toBeInTheDocument();
  });
});
