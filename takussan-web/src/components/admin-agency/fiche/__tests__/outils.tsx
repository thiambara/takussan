import type { ReactNode } from 'react';
import { expect } from 'vitest';
import { render, waitFor, within } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import type { SectionDeLaFiche } from '@/lib/agence/fiche';
import { withIntl } from '@/test/intl';
import type { Agency } from '@/types/agency';

import { FicheDeLAgence } from '../FicheDeLAgence';
import { ACTIONS } from './doublures';

/**
 * TCK-2670 — le rendu de la fiche dans les tests : la VRAIE fiche, ses vrais hooks de requête sur un
 * `QueryClient` de test ; seules les lectures et les actions sont doublées (`./doublures`).
 */

export type Utilisateur = ReturnType<typeof userEvent.setup>;

export const AGENCE: Agency = {
  id: 7,
  name: 'Dakar Immo',
  slug: 'dakar-immo',
  kind: 'standard',
  license_number: null,
  description: null,
  email: null,
  phone: null,
  website: null,
  commission_rate: 5,
  currency: 'XOF',
  is_verified: true,
  status: 'active',
  logo_url: null,
  settings: null,
  primary_admin_id: null,
};

export const INDIVIDUELLE: Agency = { ...AGENCE, kind: 'individual', name: 'Awa Ndiaye' };

interface Options {
  readonly section?: SectionDeLaFiche | null;
  readonly vitrine?: boolean;
  readonly filigranes?: boolean;
  /** La garde du second facteur (`useGardeDoubleFacteur`) : sans elle, la garde par défaut. */
  readonly garde?: (code: string) => Promise<boolean>;
}

export function arbreDeLaFiche(agence: Agency, { vitrine = false, filigranes = false, garde }: Options = {}, client?: QueryClient): ReactNode {
  const fiche = <FicheDeLAgence agency={agence} vitrine={vitrine} filigranes={filigranes} origineSite="https://www.takussan.com" />;
  return (
    <QueryClientProvider client={client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {withIntl(garde ? <ContexteGardeDoubleFacteur.Provider value={garde}>{fiche}</ContexteGardeDoubleFacteur.Provider> : fiche)}
    </QueryClientProvider>
  );
}

/** Rend la fiche, ouverte sur `section` (`?section=…`), ou sur son sommaire. */
export function rendreLaFiche(agence: Agency = AGENCE, options: Options = {}) {
  const { section = null } = options;
  window.history.replaceState(null, '', section ? `/app/agency?section=${section}` : '/app/agency');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rendu = render(arbreDeLaFiche(agence, options, client));
  return {
    ...rendu,
    client,
    /** Re-rendre avec une agence RELUE (la page après `router.refresh()`). */
    relire: (lue: Agency) => rendu.rerender(arbreDeLaFiche(lue, options, client)),
  };
}

/** La barre du bureau (dès `md`) : une seule, pour toutes les sections. */
export const barreDuBureau = () => document.querySelector<HTMLElement>('[data-slot="barre-de-la-fiche"]');

/** « Enregistrer » de la barre du bureau, puis le corps du `PATCH` (le n-ième envoi). */
export async function enregistrer(user: Utilisateur, n = 1) {
  const barre = barreDuBureau();
  expect(barre, 'aucune barre : rien n’est modifié').not.toBeNull();
  await user.click(within(barre!).getByRole('button', { name: 'Enregistrer' }));
  await waitFor(() => expect(ACTIONS.updateAgencyAction).toHaveBeenCalledTimes(n));
  return ACTIONS.updateAgencyAction.mock.calls[n - 1][1] as Record<string, unknown>;
}

/** Les champs portent leur `id` stable (`field-<champ>`) : la jauge y mène. */
export const champ = (nom: string) => {
  const el = document.getElementById(`field-${nom}`);
  if (!el) throw new Error(`aucun champ field-${nom}`);
  return el as HTMLInputElement;
};
