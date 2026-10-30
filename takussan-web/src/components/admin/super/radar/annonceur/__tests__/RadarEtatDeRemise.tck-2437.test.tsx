import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fetchRadarAdvertiser, sendRadarOutreach } from '@/lib/queries/radar';
import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import { avecGestes } from '@/test/habilitations';
import { withIntl } from '@/test/intl';
import type { RadarAdvertiserDetail, RadarOutreach, RadarOutreachProviderStatus } from '@/types/radar';
import { RadarAdvertiserCard } from '../RadarAdvertiserCard';
import { remiseDuMessage } from '../reponses';
import { annonceur, message, messageEnvoye } from './mocks';

vi.mock('@/lib/queries/radar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/radar')>()),
  fetchRadarAdvertiser: vi.fn(),
  sendRadarOutreach: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

/** La fiche que l'« API » rend : un test la change pour que la relecture porte le nouvel état. */
let serveur: RadarAdvertiserDetail;

async function rendre(detail: RadarAdvertiserDetail) {
  serveur = detail;
  vi.mocked(fetchRadarAdvertiser).mockImplementation(async () => ({ data: serveur }));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={queryClient}>
      {avecGestes(<RadarAdvertiserCard id={detail.id} />)}
    </QueryClientProvider>,
  ));
  await screen.findByTestId('radar-annonceur');
}

/** Un message envoyé par l'API, ouvert (carte du suivi), dans l'état d'accusé donné. */
const ouvertParLApi = (provider_status: RadarOutreachProviderStatus, partiel: Partial<RadarOutreach> = {}) =>
  messageEnvoye({ id: 6, channel: 'whatsapp_cloud', provider_status, ...partiel });

/** Un message envoyé par l'API et clos : il ne vit plus que dans l'historique. */
const closParLApi = (id: number, provider_status: RadarOutreachProviderStatus) => message({
  id, status: 'closed', outcome: 'refused', sent_at: '2026-10-21T10:00:00+00:00', channel: 'whatsapp_cloud', provider_status,
});

const suivi = () => screen.getByTestId('radar-suivi-message');
const lignes = () => within(screen.getByTestId('radar-annonceur-historique')).getAllByTestId('radar-annonceur-historique-ligne');

describe('L’état de remise d’un message envoyé par l’API (TCK-2437)', () => {
  it('AC1 — un message `failed` dit « Non remis », en ton destructif, jamais « Remis », sur le suivi et dans l’historique', async () => {
    await rendre(annonceur({ outreaches: [ouvertParLApi('failed'), closParLApi(3, 'failed')] }));

    for (const zone of [suivi(), lignes()[1]]) {
      const remise = within(zone).getByTestId('radar-message-remise');
      expect(remise).toHaveTextContent(/^Non remis$/);
      expect(remise).toHaveAttribute('data-tone', 'danger');
      expect(within(zone).queryByText(/^(Remis|Lu|Envoyé)$/)).not.toBeInTheDocument();
    }
    // La carte du suivi dit ce que l'échec veut dire, sans geste : l'opérateur juge.
    expect(within(suivi()).getByText('WhatsApp n’a pas remis ce message. Il reste compté comme envoyé : à vous de juger de la suite.')).toBeInTheDocument();
  });

  it.each(['accepted', 'sent'] as const)('AC2 — un message `%s` (pas encore d’accusé de remise) dit « Envoyé », jamais « Remis »', async (statut) => {
    await rendre(annonceur({ outreaches: [ouvertParLApi(statut), closParLApi(3, statut)] }));

    for (const zone of [suivi(), lignes()[1]]) {
      const remise = within(zone).getByTestId('radar-message-remise');
      expect(remise).toHaveTextContent(/^Envoyé$/);
      expect(remise).toHaveAttribute('data-tone', 'neutral');
      expect(within(zone).queryByText(/^(Remis|Lu|Non remis)$/)).not.toBeInTheDocument();
    }
    expect(within(suivi()).queryByText(/n’a pas remis ce message/)).not.toBeInTheDocument();
  });

  it.each([['delivered', 'Remis'], ['read', 'Lu']] as const)('AC3 — un message `%s` dit « %s »', async (statut, libelle) => {
    await rendre(annonceur({ outreaches: [ouvertParLApi(statut), closParLApi(3, statut)] }));

    for (const zone of [suivi(), lignes()[1]]) {
      const remise = within(zone).getByTestId('radar-message-remise');
      expect(remise).toHaveTextContent(new RegExp(`^${libelle}$`));
      expect(remise).toHaveAttribute('data-tone', 'success');
    }
  });

  it('AC3 — un message `ambiguous` garde « envoi non confirmé » et n’affiche aucun état de remise', async () => {
    await rendre(annonceur({ outreaches: [ouvertParLApi('ambiguous'), closParLApi(3, 'ambiguous')] }));

    for (const zone of [suivi(), lignes()[1]]) {
      expect(within(zone).getByTestId('radar-message-canal')).toHaveTextContent('API WhatsApp, envoi non confirmé');
      expect(within(zone).queryByTestId('radar-message-remise')).not.toBeInTheDocument();
    }
  });

  it('AC4 — un message envoyé à la main n’affiche aucun état de remise, quel que soit `provider_status`', async () => {
    await rendre(annonceur({
      outreaches: [
        messageEnvoye({ id: 6, channel: 'whatsapp_manual', provider_status: 'delivered' }),
        message({ id: 3, status: 'closed', outcome: 'refused', sent_at: '2026-10-21T10:00:00+00:00', channel: 'whatsapp_manual', provider_status: null }),
      ],
    }));

    expect(screen.queryAllByTestId('radar-message-remise')).toHaveLength(0);
    expect(within(suivi()).getByTestId('radar-message-canal')).toHaveTextContent('WhatsApp, à la main');
  });
});

describe('remiseDuMessage (TCK-2437)', () => {
  const cloud = (provider_status: string | null) => message({ channel: 'whatsapp_cloud', provider_status: provider_status as RadarOutreachProviderStatus | null });

  it('suit les accusés de Meta, et ne lit jamais une remise là où il n’y en a pas', () => {
    expect(remiseDuMessage(cloud('accepted'))).toBe('sent');
    expect(remiseDuMessage(cloud('sent'))).toBe('sent');
    expect(remiseDuMessage(cloud('delivered'))).toBe('delivered');
    expect(remiseDuMessage(cloud('read'))).toBe('read');
    expect(remiseDuMessage(cloud('failed'))).toBe('failed');
    expect(remiseDuMessage(cloud('ambiguous'))).toBeNull();
  });

  it('une valeur que le front ne connaît pas, ou absente, n’affiche rien plutôt qu’une remise', () => {
    expect(remiseDuMessage(cloud(null))).toBeNull();
    expect(remiseDuMessage(cloud('deleted'))).toBeNull();
    expect(remiseDuMessage(message({ channel: 'whatsapp_manual', provider_status: 'read' }))).toBeNull();
  });
});

describe('Le bandeau de l’envoi par l’API suit l’état du message relu (TCK-2437)', () => {
  it('un envoi ambigu puis un accusé `failed` à la relecture : le bandeau « ne le renvoyez pas » tombe, la carte dit « Non remis »', async () => {
    const envoye = messageEnvoye({ id: 5, channel: 'whatsapp_cloud', provider_status: 'ambiguous' });
    vi.mocked(sendRadarOutreach).mockImplementation(async () => {
      // L'envoi rend le message ambigu ; la relecture qui suit le rend non remis (accusé arrivé entre-temps).
      serveur = { ...serveur, outreaches: [{ ...envoye, provider_status: 'failed' }] };
      return { data: envoye };
    });
    await rendre(annonceur({ whatsapp_api_available: true, outreaches: [message()] }));
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole('button', { name: 'Envoyer par l’API WhatsApp' }));
    await utilisateur.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Oui, l’envoyer' }));

    await waitFor(() => expect(within(suivi()).getByTestId('radar-message-remise')).toHaveTextContent(/^Non remis$/));
    expect(screen.queryByTestId('radar-annonceur-envoi-api')).not.toBeInTheDocument();
    expect(screen.queryByText(/Ne le renvoyez pas à la main/)).not.toBeInTheDocument();
  });
});

describe('Les libellés de remise se distinguent dans chaque langue (TCK-2437, AC1, AC2)', () => {
  it.each([['fr', fr], ['en', en], ['wo', wo]] as const)('%s : « non remis » ≠ « remis » ≠ « envoyé », et « lu » ≠ « envoyé »', (_langue, dictionnaire) => {
    const libelles = dictionnaire.superAdmin.pages.radar.advertiser.history.delivery;

    expect(libelles.failed).not.toBe(libelles.delivered);
    expect(libelles.failed).not.toBe(libelles.sent);
    expect(libelles.failed).not.toBe(libelles.read);
    expect(libelles.delivered).not.toBe(libelles.sent);
    expect(libelles.read).not.toBe(libelles.sent);
  });
});
