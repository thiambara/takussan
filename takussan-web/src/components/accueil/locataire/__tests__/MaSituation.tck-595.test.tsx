/**
 * TCK-595 — l'accueil client, porté par l'accueil depuis TCK-2625 (« Ma situation »,
 * `/app/overview/tenant`, est absorbée par `/app` : ces blocs y sont montés tels quels).
 *
 * AC16 : la prochaine visite et les interventions ouvertes (`maintenance.open`) sont affichées. Sans
 * aucun dossier client, l'écran invite à chercher dans la ville de l'utilisateur — par la recherche
 * publique existante — au lieu d'un état vide générique.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { rechercherBiensPublics } from '@/lib/queries/public-search';
import { withIntl } from '@/test/intl';

import { InvitationARechercher, lireInvitationARechercher } from '../../client/InvitationARechercher';
import { CeQuiMAttend } from '../MaSituation';

vi.mock('@/lib/queries/public-search', () => ({ rechercherBiensPublics: vi.fn() }));

beforeEach(() => {
  vi.mocked(rechercherBiensPublics).mockReset();
  vi.mocked(rechercherBiensPublics).mockResolvedValue({
    data: [{ id: 5, slug: 'studio-plateau', title: 'Studio Plateau', price: 150000, currency: 'XOF' }],
    meta: { current_page: 1, last_page: 1, per_page: 4, total: 1 },
  } as never);
});

describe('accueil client — ce qui m’attend (AC16)', () => {
  it('affiche la prochaine visite et les interventions ouvertes', () => {
    render(
      withIntl(
        <CeQuiMAttend
          visites={[{ id: 41, scheduled_at: '2026-07-17T10:00:00Z', status: 'scheduled', property: { id: 1, title: 'Villa Almadies' } }] as never}
          interventionsOuvertes={2}
          reservationsEnAttente={0}
          locale="fr"
        />,
      ),
    );

    expect(screen.getByRole('link', { name: /Prochaine visite.*Villa Almadies/ })).toHaveAttribute('href', '/app/visits/41');
    // TCK-1727 (P167.01) : les statuts de `open()` côté API, tout sauf terminée, clôturée, annulée.
    expect(screen.getByRole('link', { name: /Demandes d'intervention en cours\s*2/ })).toHaveAttribute(
      'href',
      '/app/maintenance?status=open,acknowledged,quote_requested,quote_submitted,awaiting_owner,approved,rejected,assigned,in_progress',
    );
  });

  it('sans dossier : une invitation à chercher dans sa ville, nourrie par la recherche publique', async () => {
    const invitation = await lireInvitationARechercher({ city: 'Dakar', search_intent: 'rent' } as never, 'fr');
    render(withIntl(<InvitationARechercher invitation={invitation} locale="fr" />));

    const requete = new URLSearchParams(vi.mocked(rechercherBiensPublics).mock.calls[0]![0]);
    expect(requete.get('city')).toBe('Dakar');
    expect(requete.get('contract_type')).toBe('rent');
    expect(screen.getByRole('heading', { name: 'Biens à Dakar pour louer' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Studio Plateau/ })).toHaveAttribute('href', '/fr/properties/studio-plateau');
    expect(screen.getByRole('link', { name: 'Voir les annonces' })).toHaveAttribute('href', '/fr/properties?contract_type=rent&city=Dakar');
  });

  it('sans ville connue : la recherche sans filtre de ville, aucun appel réseau', async () => {
    const invitation = await lireInvitationARechercher({ search_intent: 'buy' } as never, 'fr');
    render(withIntl(<InvitationARechercher invitation={invitation} locale="fr" />));

    expect(rechercherBiensPublics).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Voir les annonces' })).toHaveAttribute('href', '/fr/properties?contract_type=sale');
  });
});
