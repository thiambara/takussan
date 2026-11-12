import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';

/**
 * TCK-627 — une limite d'annonces atteinte se dit à l'ENTRÉE de l'assistant, et non par un 422
 * après six étapes. Une proposition (bailleur hors personnel) ne consomme pas de quota : on ne le
 * lit même pas.
 */

const mockGetMe = vi.fn();
const mockQuota = vi.fn();

// P152.03 — l'admin du rôle système porte `properties.create`.
vi.mock('@/lib/access/pages-admin-server', () => ({ capacitesDuProfilActif: async () => ['properties.create'] }));
// TCK-2638 — le traducteur RÉEL de next-intl (et non le double qui rend le gabarit brut) : les messages
// du quota sont de l'ICU (`plural`), et l'écran se juge sur la phrase que lit l'utilisateur.
vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl');
  const fr = (await import('@/messages/fr.json')).default as Record<string, unknown>;
  return {
    getTranslations: async (namespace?: string) =>
      createTranslator({ locale: 'fr', messages: fr, namespace: namespace as never, timeZone: 'Africa/Dakar' }),
    getLocale: async () => 'fr',
    getMessages: async () => fr,
  };
});
vi.mock('@/app/actions/auth', () => ({ getMeAction: () => mockGetMe() }));
vi.mock('@/app/actions/admin-tags', () => ({ fetchTagsAction: async () => ({ ok: true, data: { data: [] } }) }));
vi.mock('@/app/actions/dashboard-properties', () => ({ fetchListingQuotaAction: () => mockQuota() }));
vi.mock('@/components/property-form/PropertyWizard', () => ({
  PropertyWizard: ({ quotaNote }: { quotaNote?: string }) => (
    <div data-testid="assistant">{quotaNote}</div>
  ),
}));

import Page from '../page';

describe('/app/properties/new — le quota avant l’assistant (TCK-627)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMe.mockResolvedValue({ id: 1, roles: ['agency_admin'] });
  });

  it('limite atteinte : un message et la sortie, pas l’assistant', async () => {
    mockQuota.mockResolvedValue({ limit: 5, used: 5, can_create: false });

    render(withIntl(await Page()));

    expect(screen.getByTestId('quota-atteint')).toHaveTextContent('Limite d’annonces atteinte');
    expect(screen.getByRole('link', { name: 'Voir les offres' })).toHaveAttribute('href', '/app/agency/billing');
    expect(screen.queryByTestId('assistant')).not.toBeInTheDocument();
  });

  it('sous la limite : l’assistant, qui reçoit l’usage du quota (TCK-631 : plus de titre de page)', async () => {
    mockQuota.mockResolvedValue({ limit: 5, used: 2, can_create: true });

    render(withIntl(await Page()));

    expect(screen.getByTestId('assistant')).toHaveTextContent(/annonces actives/);
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByTestId('quota-atteint')).not.toBeInTheDocument();
  });

  /**
   * TCK-2638 (lot C, P1 de l'audit) — l'écran du quota dit le chiffre de `GET /api/me/quota` et ce
   * qu'il compte (les statuts de `QuotaResolver::ACTIVE_LISTING_STATUSES`, ADR-0097 § 6), parle à
   * l'agence et non à « vous », et ne propose de changer d'offre qu'à qui le peut.
   */
  describe('TCK-2638 — l’écran du quota s’adresse au rôle', () => {
    it('l’admin : le chiffre de l’agence, sa définition, et « Voir les offres »', async () => {
      mockQuota.mockResolvedValue({ limit: 100, used: 120, can_create: false });

      render(withIntl(await Page()));

      const ecran = screen.getByTestId('quota-atteint');
      expect(ecran).toHaveTextContent('Votre agence a 120 annonces actives sur 100 permises par son offre.');
      expect(ecran).toHaveTextContent(/disponible, validée ou en attente de validation/);
      expect(ecran).toHaveTextContent(/changez d’offre/);
      expect(screen.getByRole('link', { name: 'Voir les offres' })).toHaveAttribute('href', '/app/agency/billing');
      expect(ecran).not.toHaveTextContent(/Vous avez/);
    });

    it('l’agent : ni « changez d’offre » ni lien vers les offres — l’administrateur tient l’abonnement', async () => {
      mockGetMe.mockResolvedValue({ id: 2, roles: ['agent'] });
      mockQuota.mockResolvedValue({ limit: 100, used: 120, can_create: false });

      render(withIntl(await Page()));

      const ecran = screen.getByTestId('quota-atteint');
      expect(ecran).toHaveTextContent('Votre agence a 120 annonces actives sur 100 permises par son offre.');
      expect(ecran).toHaveTextContent(/disponible, validée ou en attente de validation/);
      expect(ecran).toHaveTextContent(/Seul un administrateur de votre agence peut changer d’offre/);
      expect(ecran).not.toHaveTextContent(/changez d’offre/);
      expect(screen.queryByRole('link', { name: 'Voir les offres' })).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Gérer mes annonces' })).toHaveAttribute('href', '/app/properties');
    });

    it('au téléphone, l’écran a sa flèche de retour vers la liste (l’en-tête n’avait que le logo)', async () => {
      mockQuota.mockResolvedValue({ limit: 5, used: 5, can_create: false });

      render(withIntl(await Page()));

      const retours = screen.getAllByRole('link', { name: 'Retour' });
      expect(retours).toHaveLength(1);
      expect(retours[0]).toHaveAttribute('href', '/app/properties');
    });

    it('sous la limite, la note de l’assistant dit ce qu’elle compte, sans « votre offre »', async () => {
      mockGetMe.mockResolvedValue({ id: 2, roles: ['agent'] });
      mockQuota.mockResolvedValue({ limit: 5, used: 1, can_create: true });

      render(withIntl(await Page()));

      const note = screen.getByTestId('assistant');
      expect(note).toHaveTextContent('1 annonce active sur 5 permises par l’offre de votre agence');
      expect(note).toHaveTextContent(/disponibles, validées ou en attente de validation/);
    });
  });

  it('une proposition ne lit pas le quota', async () => {
    mockGetMe.mockResolvedValue({ id: 1, roles: ['owner'] });

    render(withIntl(await Page()));

    expect(mockQuota).not.toHaveBeenCalled();
    expect(screen.getByTestId('assistant')).toBeInTheDocument();
  });
});
