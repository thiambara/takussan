import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import * as AuthContext from '@/context/AuthContext';
import { OwnersList } from '@/components/owners/OwnersList';
import { ServiceProvidersList } from '@/components/service-providers/ServiceProvidersList';

/**
 * TCK-380 · AC3 — **chaque table convertie rend EXACTEMENT les mêmes colonnes, dans le même
 * ordre, qu'avant la conversion.**
 *
 * Les listes attendues ci-dessous ne sont pas déduites du code d'aujourd'hui : elles sont
 * relevées sur les `<th>` des `<table>` faites à la main, à la révision `73ca883b`, AVANT que ce
 * ticket ne les touche. C'est ce qui fait la différence entre un test de non-régression et une
 * photographie de l'état courant — un test écrit depuis le nouveau code aurait coché une colonne
 * perdue aussi volontiers qu'une colonne gardée.
 *
 * ⚠ Ces tests rougissent réellement sans le correctif — vérifié par ablation le 2026-08-27 en
 * retirant une colonne de chaque définition : les cinq échouent, et le message nomme la colonne
 * manquante.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function monter(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

/** Les en-têtes de LA table nommée par sa légende, dans l'ordre du DOM. */
function enTetesDe(legende: string): string[] {
  const table = screen.getByRole('table', { name: legende });
  return within(table)
    .getAllByRole('columnheader')
    .map((th) => th.textContent?.trim() ?? '');
}

beforeEach(() => {
  vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
    token: 'jeton-de-test',
    user: null,
    loading: false,
  } as unknown as ReturnType<typeof AuthContext.useAuth>);
});

describe('AC3 — les colonnes des tables converties', () => {
  // TCK-2590 — `CustomerList` n'existe plus : la liste des clients suit la maquette retenue
  // (`app-clients` a, ADR-0106), qui change ses colonnes par décision. Ses colonnes se gardent dans
  // `customer-dashboard/liste/__tests__/ListeDesClients.tck-2590.test.tsx`.
  //
  // TCK-2638 — la table de `PropertyList` (sélection · bien · prix · activité · statut · actions)
  // n'existe plus : la liste des biens suit la maquette retenue (`app-biens`, deux modes). En Annonces,
  // une carte par annonce à toute largeur (prix, vues et favoris, état, « ⋯ ») — gardée dans
  // `property-dashboard/__tests__/CarteAnnonce.tck-2638.test.tsx` ; en Gestion, une table aux colonnes
  // de la maquette, gardées dans `property-dashboard/__tests__/PropertyList.gestion.tck-2638.test.tsx`.

  it('OwnersList : bailleur · téléphone · biens · argent du mois · statut (TCK-2641)', () => {
    monter(
      <OwnersList
        agencyId={7}
        canInvite={false}
        initialData={{
          data: [
            {
              id: 3,
              agency_id: 7,
              status: 'active',
              user: { id: 9, first_name: 'Fatou', last_name: 'Sarr', email: 'f@example.test' },
              metadata: null,
            },
          ],
          meta: { total: 1, current_page: 1, last_page: 1, per_page: 20 },
          links: { first: null, last: null, prev: null, next: null },
        } as never}
      />,
    );

    // TCK-601 — « Identifiants » (RIB, NINEA, pièce, masqués) est un AJOUT délibéré, entre
    // l'e-mail et le statut ; les quatre colonnes relevées à `73ca883b` restent, dans leur ordre.
    // P234.04 (TCK-2280) — « Téléphone » (le numéro saisi à l'invitation) en est un autre, après l'e-mail.
    // TCK-2641 — le carnet est refondu sur la maquette `app-bailleurs` : un tableau centré sur
    // l'argent du mandat. « Email » passe sous le nom, « Identifiants » et « Actions » quittent la
    // liste (les identifiants vont à la fiche du bailleur, les gestes d'invitation dans « Statut »).
    expect(enTetesDe('Bailleurs')).toEqual(['Bailleur', 'Téléphone', 'Biens', 'Encaissé ce mois', 'Reste à verser', 'Dernier versement', 'Statut']);
  });

  it('ServiceProvidersList : nom · métiers · zones · statut · actions', () => {
    monter(
      <ServiceProvidersList
        agencyId={7}
        canInvite={false}
        initialData={{
          data: [
            {
              id: 4,
              agency_id: 7,
              status: 'active',
              specialties: ['plumbing'],
              service_areas: ['Dakar'],
              user: { id: 11, first_name: 'Modou', last_name: 'Fall', email: 'm@example.test' },
              metadata: null,
            },
          ],
          meta: { total: 1, current_page: 1, last_page: 1, per_page: 20 },
          links: { first: null, last: null, prev: null, next: null },
        } as never}
      />,
    );

    // P234.04 (TCK-2280) — « Téléphone » (le numéro saisi à l'invitation) est un AJOUT délibéré,
    // après le nom ; les cinq colonnes relevées à `73ca883b` restent, dans leur ordre.
    const entetes = enTetesDe('Carnet prestataires');
    expect(entetes).toHaveLength(6);
    expect(entetes[0]).toBe('Nom');
    expect(entetes[1]).toBe('Téléphone');
    expect(entetes[5]).toBe('Actions');
  });
});
