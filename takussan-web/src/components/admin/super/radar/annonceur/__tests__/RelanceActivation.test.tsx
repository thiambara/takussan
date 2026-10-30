import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { fetchRadarActivationReminder, markRadarActivationReminderSent, radarKeys } from '@/lib/queries/radar';
import { withIntl } from '@/test/intl';
import type { RadarActivationReminder } from '@/types/radar';
import { RelanceActivation } from '../RelanceActivation';
import { relance, SANS_RELANCE, TEXTE_ACTIVATION } from './mocks';

vi.mock('@/lib/queries/radar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/radar')>()),
  fetchRadarActivationReminder: vi.fn(),
  markRadarActivationReminderSent: vi.fn(),
}));

function monter(apercu: RadarActivationReminder, { mienne = true, desactive = false } = {}) {
  vi.mocked(fetchRadarActivationReminder).mockResolvedValue({ data: apercu });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const rendu = render(withIntl(
    <QueryClientProvider client={queryClient}>
      <RelanceActivation advertiserId={7} mienne={mienne} desactive={desactive} />
    </QueryClientProvider>,
  ));
  return { ...rendu, queryClient, utilisateur: userEvent.setup() };
}

beforeEach(() => {
  vi.mocked(fetchRadarActivationReminder).mockReset();
  vi.mocked(markRadarActivationReminderSent).mockReset();
});

/**
 * TCK-2394 (ADR-0077, lot 4) — le panneau de la relance d'activation, sur la fiche annonceur : il ne se montre que si le
 * Radar a créé un compte, cite les chiffres que l'API compte, dit ce qui bloque, et marque la relance envoyée.
 */
describe('RelanceActivation (TCK-2394)', () => {
  it('aucun compte créé par le Radar : le panneau ne prend pas de place', async () => {
    const { container, queryClient } = monter(SANS_RELANCE);
    // L'aperçu est LU (pas seulement demandé) : le vide constaté ensuite est celui de la réponse, pas celui de l'attente.
    await waitFor(() => expect(queryClient.getQueryState(radarKeys.activation(7, 'fr'))?.status).toBe('success'));
    expect(fetchRadarActivationReminder).toHaveBeenCalledWith(7, 'fr');
    expect(container).toBeEmptyDOMElement();
  });

  it('rend les chiffres de la période, bien par bien, les crédits offerts, le texte et le lien WhatsApp', async () => {
    monter(relance());

    const panneau = await screen.findByTestId('radar-annonceur-activation');
    const chiffres = within(panneau).getByTestId('radar-activation-chiffres');
    expect(within(chiffres).getByText('42')).toBeInTheDocument();
    expect(within(chiffres).getByText('Crédits offerts à l’activation')).toBeInTheDocument();
    expect(within(chiffres).getByText('500')).toBeInTheDocument();
    const lignes = within(chiffres).getAllByRole('row');
    expect(lignes).toHaveLength(3);
    expect(within(lignes[1]).getByRole('link', { name: 'Appartement 12' })).toHaveAttribute('href', 'https://takussan.test/fr/properties/appartement-12');
    expect(within(lignes[1]).getByText('30')).toBeInTheDocument();
    // Un bien sans titre se nomme par son numéro.
    expect(within(lignes[2]).getByRole('link', { name: 'Bien n° 502' })).toBeInTheDocument();

    expect(within(panneau).getByText('Aucune relance envoyée.')).toBeInTheDocument();
    expect(within(panneau).getByTestId('radar-activation-texte').textContent).toBe(TEXTE_ACTIVATION);
    expect(within(panneau).getByRole('link', { name: /Ouvrir WhatsApp/ })).toHaveAttribute('href', relance().wa_me);
    expect(within(panneau).getByRole('button', { name: 'Marquer envoyée' })).toBeEnabled();
  });

  it('des crédits déjà accordés : la ligne des crédits ne s\'affiche pas', async () => {
    const base = relance();
    monter(relance({ figures: { ...base.figures!, welcome_credits: 0 } }));

    const panneau = await screen.findByTestId('radar-annonceur-activation');
    expect(within(panneau).queryByText('Crédits offerts à l’activation')).not.toBeInTheDocument();
  });

  it('trop tôt : le blocage est nommé avec la date de la prochaine relance, sans texte ni geste', async () => {
    monter(relance({
      blocking: ['radar.activation.too_soon'],
      text: null,
      wa_me: null,
      reminders: { count: 1, last_at: '2026-10-25T10:00:00+00:00' },
      available_at: '2026-11-01T10:00:00+00:00',
    }));

    const blocage = await screen.findByTestId('radar-activation-blocage');
    expect(within(blocage).getByText('La dernière relance est trop récente : attendez la fin de la période.')).toBeInTheDocument();
    expect(within(blocage).getByText(/Prochaine relance possible le/)).toBeInTheDocument();
    expect(screen.getByTestId('radar-activation-relances').textContent).toMatch(/^1 relance envoyée, la dernière le /);
    expect(screen.queryByTestId('radar-activation-texte')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Marquer envoyée' })).not.toBeInTheDocument();
  });

  it('chaque blocage de l\'API a son libellé : compte déjà activé, accord retiré, sous mandat', async () => {
    monter(relance({
      blocking: ['radar.activation.already_active', 'radar.activation.revoked', 'radar.activation.under_mandate'],
      text: null,
      wa_me: null,
    }));

    const blocage = await screen.findByTestId('radar-activation-blocage');
    expect(within(blocage).getByText('Le compte de l’annonceur est déjà activé : il n’y a rien à relancer.')).toBeInTheDocument();
    expect(within(blocage).getByText(/accord de l’annonceur a été retiré/)).toBeInTheDocument();
    expect(within(blocage).getByText(/publié sous mandat/)).toBeInTheDocument();
    expect(within(blocage).queryByText(/Prochaine relance/)).not.toBeInTheDocument();
  });

  it('sans prise en charge à soi : « Marquer envoyée » est fermé, et la raison est dite', async () => {
    monter(relance(), { mienne: false });

    const bouton = await screen.findByRole('button', { name: 'Marquer envoyée' });
    expect(bouton).toBeDisabled();
    expect(screen.getByText('Prenez l’annonceur en charge pour marquer la relance envoyée.')).toBeInTheDocument();
  });

  it('marquer envoyée envoie la langue choisie, puis rend l\'aperçu relu', async () => {
    const apres = relance({
      blocking: ['radar.activation.too_soon'],
      text: null,
      wa_me: null,
      reminders: { count: 1, last_at: '2026-10-28T10:00:00+00:00' },
      available_at: '2026-11-04T10:00:00+00:00',
    });
    vi.mocked(markRadarActivationReminderSent).mockResolvedValue({ data: apres });
    const { utilisateur } = monter(relance());

    await utilisateur.click(await screen.findByRole('radio', { name: 'Anglais' }));
    await waitFor(() => expect(fetchRadarActivationReminder).toHaveBeenCalledWith(7, 'en'));
    vi.mocked(fetchRadarActivationReminder).mockResolvedValue({ data: apres });
    await utilisateur.click(screen.getByRole('button', { name: 'Marquer envoyée' }));

    await waitFor(() => expect(markRadarActivationReminderSent).toHaveBeenCalledWith(7, 'en'));
    expect(await screen.findByText('Relance enregistrée.')).toBeInTheDocument();
    expect(await screen.findByTestId('radar-activation-blocage')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Marquer envoyée' })).not.toBeInTheDocument();
  });

  it('un refus de l\'API (STOP arrivé depuis l\'aperçu) se nomme, et l\'aperçu se relit', async () => {
    vi.mocked(markRadarActivationReminderSent).mockRejectedValue(new ApiError(422, { code: 'radar.advertiser.do_not_contact' }));
    const { utilisateur } = monter(relance());

    await utilisateur.click(await screen.findByRole('button', { name: 'Marquer envoyée' }));

    expect(await screen.findByTestId('radar-activation-erreur')).toHaveTextContent(/ne plus être contacté/);
    await waitFor(() => expect(fetchRadarActivationReminder).toHaveBeenCalledTimes(2));
  });
});
