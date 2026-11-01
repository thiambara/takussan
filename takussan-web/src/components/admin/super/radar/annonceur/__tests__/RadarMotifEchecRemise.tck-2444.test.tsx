import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fetchRadarAdvertiser } from '@/lib/queries/radar';
import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import { avecGestes } from '@/test/habilitations';
import { withIntl } from '@/test/intl';
import type { RadarAdvertiserDetail, RadarOutreach, RadarOutreachProviderStatus } from '@/types/radar';
import { RadarAdvertiserCard } from '../RadarAdvertiserCard';
import { CODES_D_ECHEC_LIBELLES, motifDeLEchec } from '../reponses';
import { annonceur, message, messageEnvoye } from './mocks';

vi.mock('@/lib/queries/radar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/radar')>()),
  fetchRadarAdvertiser: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

async function rendre(detail: RadarAdvertiserDetail) {
  vi.mocked(fetchRadarAdvertiser).mockImplementation(async () => ({ data: detail }));
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={queryClient}>
      {avecGestes(<RadarAdvertiserCard id={detail.id} />)}
    </QueryClientProvider>,
  ));
  await screen.findByTestId('radar-annonceur');
}

/** Un message envoyé par l'API, ouvert (carte du suivi), non remis avec le code donné. */
const ouvertNonRemis = (provider_error_code: number | null) =>
  messageEnvoye({ id: 6, channel: 'whatsapp_cloud', provider_status: 'failed', provider_error_code });

/** Un message envoyé par l'API et clos, non remis avec le code donné : il ne vit plus que dans l'historique. */
const closNonRemis = (id: number, provider_error_code: number | null) => message({
  id, status: 'closed', outcome: 'refused', sent_at: '2026-10-21T10:00:00+00:00', channel: 'whatsapp_cloud', provider_status: 'failed', provider_error_code,
});

const suivi = () => screen.getByTestId('radar-suivi-message');
const lignes = () => within(screen.getByTestId('radar-annonceur-historique')).getAllByTestId('radar-annonceur-historique-ligne');

describe('Le motif d’un message non remis (TCK-2444)', () => {
  it.each([
    [131026, 'Destinataire injoignable sur WhatsApp'],
    [131049, 'Limité par Meta'],
  ] as const)('AC1 — le code %i affiche « %s » près de « Non remis », sur le suivi et dans l’historique', async (code, motif) => {
    await rendre(annonceur({ outreaches: [ouvertNonRemis(code), closNonRemis(3, code)] }));

    for (const zone of [suivi(), lignes()[1]]) {
      expect(within(zone).getByTestId('radar-message-remise')).toHaveTextContent(/^Non remis$/);
      expect(within(zone).getByTestId('radar-message-motif-echec')).toHaveTextContent(new RegExp(`^${motif}$`));
    }
  });

  it.each([[null], [131000], [999999]] as const)('AC2 — un code absent ou inconnu (%s) affiche « Non remis » sans motif', async (code) => {
    await rendre(annonceur({ outreaches: [ouvertNonRemis(code), closNonRemis(3, code)] }));

    for (const zone of [suivi(), lignes()[1]]) {
      expect(within(zone).getByTestId('radar-message-remise')).toHaveTextContent(/^Non remis$/);
      expect(within(zone).queryByTestId('radar-message-motif-echec')).not.toBeInTheDocument();
    }
  });

  it('aucun geste n’est proposé à côté du motif', async () => {
    await rendre(annonceur({ outreaches: [ouvertNonRemis(131026)] }));

    const motif = within(suivi()).getByTestId('radar-message-motif-echec');
    expect(within(motif).queryByRole('button')).not.toBeInTheDocument();
    expect(within(motif).queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('motifDeLEchec (TCK-2444)', () => {
  const cloud = (provider_status: RadarOutreachProviderStatus | null, provider_error_code: number | null, partiel: Partial<RadarOutreach> = {}) =>
    message({ channel: 'whatsapp_cloud', provider_status, provider_error_code, ...partiel });

  it('rend la clé du code connu d’un échec, rien sinon', () => {
    expect(motifDeLEchec(cloud('failed', 131026))).toBe('code131026');
    expect(motifDeLEchec(cloud('failed', 131049))).toBe('code131049');
    expect(motifDeLEchec(cloud('failed', null))).toBeNull();
    expect(motifDeLEchec(cloud('failed', 131000))).toBeNull();
  });

  it('ne lit jamais un code hors échec, ni sur un message manuel', () => {
    expect(motifDeLEchec(cloud('delivered', 131026))).toBeNull();
    expect(motifDeLEchec(cloud('ambiguous', 131026))).toBeNull();
    expect(motifDeLEchec(cloud('failed', 131026, { channel: 'whatsapp_manual' }))).toBeNull();
  });

  it('un code hérité d’`Object.prototype` n’est pas un code connu', () => {
    expect(motifDeLEchec(cloud('failed', 'constructor' as unknown as number))).toBeNull();
  });
});

describe('Chaque code libellé a un motif distinct de « Non remis » dans chaque langue (TCK-2444)', () => {
  it.each([['fr', fr], ['en', en], ['wo', wo]] as const)('%s', (_langue, dictionnaire) => {
    const historique = dictionnaire.superAdmin.pages.radar.advertiser.history;
    const motifs = historique.deliveryFailure as Record<string, string>;

    expect(Object.keys(motifs).sort()).toEqual(CODES_D_ECHEC_LIBELLES.map((code) => `code${code}`).sort());
    for (const texte of Object.values(motifs)) {
      expect(texte.trim()).not.toBe('');
      expect(texte).not.toBe(historique.delivery.failed);
    }
    expect(new Set(Object.values(motifs)).size).toBe(Object.keys(motifs).length);
  });
});
