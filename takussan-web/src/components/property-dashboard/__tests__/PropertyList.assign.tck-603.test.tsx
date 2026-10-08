/**
 * TCK-603 (ADR-0036, ADR-0059) — la liste du tableau de bord :
 *
 *  - « Changer l'agent responsable » part en UN lot (`bulkAssignPropertiesAction`), pas en
 *    `Promise.all` d'appels unitaires ; le bilan chiffre ce qui a changé, ce qui était déjà suivi par
 *    l'agent, et motive les refus ; seuls les refus restent sélectionnés ; la liste se rafraîchit ;
 *  - chaque bien nomme son PROPRIÉTAIRE et son AGENT RESPONSABLE, deux personnes distinctes. La ligne
 *    affichait `owner` sous « Agent : » — c'est ce mélange qui faisait lire « Réattribuer » comme un
 *    changement d'agent.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PropertyList } from '@/components/property-dashboard/PropertyList';
import { ProprietaireEtResponsable } from '@/components/property-dashboard/ProprietaireEtResponsable';
import { DASHBOARD_PROPERTY_FIELDS } from '@/lib/queries/properties-server';
import { withIntl } from '@/test/intl';
import type { PaginatedResponse } from '@/types/api';
import type { PropertyListItem, PropertyOwnerLite } from '@/types/property';

const { refresh, bulkAssign } = vi.hoisted(() => ({ refresh: vi.fn(), bulkAssign: vi.fn() }));

vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: true, isLoading: false }) }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/app/actions/dashboard-properties', () => ({
  deletePropertyAction: vi.fn(),
  duplicatePropertyAction: vi.fn(),
  updatePropertyStatusAction: vi.fn(),
  updatePropertyVisibilityAction: vi.fn(),
  bulkArchivePropertiesAction: vi.fn(),
  bulkUnpublishPropertiesAction: vi.fn(),
  bulkAssignPropertiesAction: bulkAssign,
}));

const personne = (id: number, name: string): PropertyOwnerLite =>
  ({ id, name, avatar_url: null, is_agent: false, member_since: null }) as PropertyOwnerLite;
const BAILLEUR = personne(20, 'Fatou Bailleur');
const AWA = personne(8, 'Awa Diop');

const bien = (id: number, extra: Partial<PropertyListItem> = {}): PropertyListItem => ({
  id,
  reference_number: `TK-${id}`,
  title: `Bien ${id}`,
  slug: `bien-${id}`,
  price: 100000,
  currency: 'XOF',
  type: 'apartment',
  contract_type: 'rent',
  rent_period: 'monthly',
  status: 'available',
  visibility: 'public',
  views_count: 0,
  favorites_count: 0,
  location: { quarter: null, city: 'Dakar', region: null, country: 'SN', latitude: null, longitude: null },
  bedrooms: 2,
  bathrooms: 1,
  area: 60,
  furnished: false,
  featured: false,
  main_photo_url: null,
  published_at: null,
  created_at: '2026-09-01T00:00:00Z',
  ...extra,
} as PropertyListItem);

const pageDe = (data: PropertyListItem[]): PaginatedResponse<PropertyListItem> => ({
  data,
  meta: { total: data.length, current_page: 1, last_page: 1, per_page: 20 },
  links: { first: null, last: null, prev: null, next: null },
} as PaginatedResponse<PropertyListItem>);

describe('PropertyList — changer l’agent responsable (TCK-603)', () => {
  it('part en un lot, chiffre le bilan, ne garde que les refus sélectionnés et rafraîchit', async () => {
    bulkAssign.mockResolvedValueOnce({
      ok: true,
      data: {
        updated: 2,
        updated_ids: [1, 2],
        unchanged: 1,
        unchanged_ids: [3],
        failed: [{ id: 4, reason: 'invalid_target' }],
      },
    });
    const user = userEvent.setup();
    render(withIntl(
      <PropertyList page={pageDe([1, 2, 3, 4].map((id) => bien(id)))} currentUserId={1} agentOptions={[AWA]} />,
    ));

    await user.click(screen.getByRole('checkbox', { name: 'Sélectionner tous les biens' }));
    const barre = screen.getByRole('region', { name: 'Actions groupées' });
    const geste = within(barre).getByRole('button', { name: "Changer l'agent responsable" });
    expect(geste).toBeDisabled();
    await user.click(within(barre).getByRole('combobox', { name: 'Agent responsable…' }));
    await user.click(await screen.findByRole('option', { name: 'Awa Diop' }));
    await user.click(geste);

    await waitFor(() => expect(bulkAssign).toHaveBeenCalledTimes(1));
    expect(bulkAssign).toHaveBeenCalledWith([1, 2, 3, 4], 8);
    const bilan = await within(barre).findByRole('status');
    expect(bilan).toHaveTextContent(
      "2 biens ont changé d'agent responsable, 1 déjà suivi par cet agent — 1 refusé :",
    );
    expect(bilan).toHaveTextContent('Bien 4 : cet agent ne peut pas en être responsable');
    expect(refresh).toHaveBeenCalledTimes(1);

    const coche = (n: number) =>
      screen.getAllByRole('checkbox', { name: `Sélectionner Bien ${n}` }).every((c) => (c as HTMLInputElement).checked);
    expect([1, 2, 3, 4].filter(coche)).toEqual([4]);
  });

  it('nomme le propriétaire et l’agent responsable, et dit quand il n’y en a pas', () => {
    render(withIntl(
      <PropertyList
        currentUserId={1}
        page={pageDe([
          bien(1, { owner: BAILLEUR, primary_contact: AWA, primary_contact_source: 'designated' }),
          // Le repli sur le titulaire (TCK-502) : pas d'agent responsable.
          bien(2, { owner: BAILLEUR, primary_contact: BAILLEUR, primary_contact_source: 'owner' }),
          // verif-603 M2 — l'agent qui a saisi le bien EN EST l'agent responsable : mêmes identifiants.
          bien(3, { owner: AWA, primary_contact: AWA, primary_contact_source: 'designated' }),
          // Sans source, l'écran ne devine pas.
          bien(4, { owner: BAILLEUR, primary_contact: AWA }),
        ])}
      />,
    ));

    const attendus: Record<string, string> = {
      'Bien 1': 'Propriétaire : Fatou Bailleur · Agent responsable : Awa Diop',
      'Bien 2': 'Propriétaire : Fatou Bailleur · Agent responsable : aucun',
      'Bien 3': 'Propriétaire : Awa Diop · Agent responsable : Awa Diop',
    };
    // Les deux surfaces de la liste : la ligne de la table et la carte mobile.
    const lignes = screen.getAllByRole('row');
    const cartes = screen.getAllByRole('listitem');
    for (const surface of [lignes, cartes]) {
      const de = (titre: string) => surface.find((r) => within(r).queryByText(titre) !== null)!;
      for (const [titre, texte] of Object.entries(attendus)) expect(de(titre)).toHaveTextContent(texte);
      expect(de('Bien 4')).toHaveTextContent('Propriétaire : Fatou Bailleur');
      expect(de('Bien 4')).not.toHaveTextContent('Agent responsable');
    }
    // L'ancien libellé confondait les deux.
    expect(screen.queryByText('Agent :')).toBeNull();
  });

  /** verif-603 M2 — vu par l'agent lui-même : son nom de titulaire se tait, pas sa responsabilité. */
  it('l’agent titulaire et responsable se voit responsable', () => {
    render(withIntl(
      <ProprietaireEtResponsable
        currentUserId={AWA.id}
        property={{ owner: AWA, primary_contact: AWA, primary_contact_source: 'invitation_order' }}
      />,
    ));
    expect(screen.getByText(/Agent responsable/).parentElement).toHaveTextContent('Agent responsable : Awa Diop');
    expect(screen.queryByText(/Propriétaire/)).toBeNull();
  });

  /** La fiche pose la même ligne dans la `description` de `PageHeader`, déjà un `<p>` : elle s'y rend en `<span>`. */
  it('se pose dans un paragraphe sans y imbriquer un paragraphe (en-tête de la fiche)', () => {
    const { container } = render(withIntl(
      <p data-testid="hote">
        <ProprietaireEtResponsable
          as="span"
          currentUserId={1}
          property={{ owner: BAILLEUR, primary_contact: AWA, primary_contact_source: 'designated' }}
        />
      </p>,
    ));
    expect(screen.getByTestId('hote')).toHaveTextContent('Propriétaire : Fatou Bailleur · Agent responsable : Awa Diop');
    expect(container.querySelector('p p')).toBeNull();
  });

  /**
   * `PropertyResource` ne sert `primary_contact` sur l'index que si `agency_id` ET `user_id` sont
   * chargés (éprouvé côté API, `PropertyReassignmentKeepsOwnerTest`) : sans l'un d'eux la clé est
   * absente, et la moitié « agent responsable » disparaît de la ligne sans aucune erreur.
   */
  it('la liste demande les deux colonnes dont dépend l’agent responsable', () => {
    expect(DASHBOARD_PROPERTY_FIELDS).toEqual(expect.arrayContaining(['agency_id', 'user_id']));
  });
});
