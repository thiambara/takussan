/**
 * TCK-2815 — le carnet des bailleurs : la densité choisie (`?per_page=`) part à l'API, et une page
 * au-delà de la dernière ne passe plus pour un carnet vide.
 *
 * Le chemin de la page serveur, rejoué tel quel : `lireLeCarnet(adresse)` → `parametresDuCarnet` →
 * `fetchOwners`, contre un `fetch` simulé qui lit la requête partie et répond comme l'API
 * (`meta.per_page` et `meta.current_page` sont ceux demandés). Sa réponse est l'`initialData` de
 * `OwnersList`, rendue avec le vrai `PropertyPagination` : le sélecteur dit ce qui a été servi.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { navigationDeTest } from '@/test/navigation-url';
import { createQueryClient } from '@/lib/query-client';
import { lireLeCarnet, parametresDuCarnet, type EtatDuCarnet } from '@/lib/owners/carnet';
import { fetchOwners, type PageDuCarnet } from '@/lib/queries/owners';
import fr from '@/messages/fr.json';

import { OwnersList } from '../OwnersList';

vi.mock('next/navigation', async () => (await import('@/test/navigation-url')).moduleNavigation);
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, token: 'jeton', isLoading: false }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

const t = fr.console.pagination.pageAuDela;
const VIDES = [fr.owners.page.empty_title, fr.owners.page.empty_description, fr.owners.carnet.videFiltre.titre, fr.owners.carnet.videFiltre.description];

const RESEAU = { total: 45, requetes: [] as URL[] };

const bailleur = (id: number) => ({
  id,
  agency_id: 7,
  user_id: 100 + id,
  status: 'active',
  created_at: null,
  rib_masked: null,
  tax_id_masked: null,
  id_document_number_masked: null,
  metadata: { owner_type: 'individual', first_name: 'Bailleur', last_name: `N${id}` },
  user: { id: 100 + id, first_name: 'Bailleur', last_name: `N${id}`, email: `b${id}@example.test` },
  contact_phone: null,
  properties_count: 1,
  occupied_properties_count: 1,
  remaining_to_pay: 0,
  collected_this_month: 0,
  last_payout_at: null,
});

beforeEach(() => {
  RESEAU.total = 45;
  RESEAU.requetes.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entree: RequestInfo | URL) => {
      const url = new URL(String(entree), 'http://api.test');
      RESEAU.requetes.push(url);
      const parPage = Math.min(Math.max(Number(url.searchParams.get('per_page') ?? 20) || 20, 1), 100);
      const page = Math.max(Number(url.searchParams.get('page') ?? 1) || 1, 1);
      const debut = (page - 1) * parPage;
      const data = Array.from({ length: Math.max(0, Math.min(parPage, RESEAU.total - debut)) }, (_, i) => bailleur(debut + i + 1));
      const meta = { total: RESEAU.total, per_page: parPage, current_page: page, last_page: Math.max(1, Math.ceil(RESEAU.total / parPage)) };
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => ({ data, meta }),
      } as unknown as Response;
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const derniere = () => RESEAU.requetes.filter((u) => u.pathname.endsWith('/api/owners')).at(-1);

/** Ce que fait `app/owners/(liste)/page.tsx` : lire l'adresse, puis lire la page de l'API. */
async function lireCommeLaPage(requete: string): Promise<{ etat: EtatDuCarnet; page: PageDuCarnet }> {
  navigationDeTest.reinitialiser(requete);
  const etat = lireLeCarnet(Object.fromEntries(new URLSearchParams(requete)));
  return { etat, page: await fetchOwners('jeton', parametresDuCarnet(7, etat, true)) };
}

const liste = (etat: EtatDuCarnet, page: PageDuCarnet) => <OwnersList agencyId={7} canInvite={false} initialData={page} etat={etat} lectureArgent />;

function rendre(etat: EtatDuCarnet, page: PageDuCarnet, client: QueryClient = createQueryClient()) {
  const vue = render(withIntl(<QueryClientProvider client={client}>{liste(etat, page)}</QueryClientProvider>));
  return { ...vue, client };
}

const selecteurs = () => screen.getAllByRole('combobox', { name: fr.search.toolbar.perPageAria });

describe('TCK-2815 — carnet des bailleurs', () => {
  it('AC1 — ?per_page=50 : la requête porte per_page=50 et le sélecteur affiche 50', async () => {
    const { etat, page } = await lireCommeLaPage('per_page=50');
    expect(derniere()!.searchParams.get('per_page')).toBe('50');
    rendre(etat, page);
    for (const s of selecteurs()) expect(s).toHaveTextContent('50 / page');
  });

  it.each(['37', 'abc', '5000'])('AC1 — ?per_page=%s : la requête porte per_page=20', async (valeur) => {
    const { etat, page } = await lireCommeLaPage(`per_page=${valeur}`);
    expect(derniere()!.searchParams.get('per_page')).toBe('20');
    rendre(etat, page);
    for (const s of selecteurs()) expect(s).toHaveTextContent('20 / page');
  });

  it('la densité est dans la clé du cache : passer de 20 à 50 ne ressert pas les 20 lignes déjà lues', async () => {
    const avant = await lireCommeLaPage('');
    const { client, rerender } = rendre(avant.etat, avant.page);
    for (const s of selecteurs()) expect(s).toHaveTextContent('20 / page');

    const apres = await lireCommeLaPage('per_page=50');
    rerender(withIntl(<QueryClientProvider client={client}>{liste(apres.etat, apres.page)}</QueryClientProvider>));
    for (const s of selecteurs()) expect(s).toHaveTextContent('50 / page');
  });

  it.each(['page=9', 'q=ndiaye&page=9'])('AC2 — ?%s, data: [], total 12 : l’état « au-delà de la dernière page », aucun texte d’état vide', async (requete) => {
    const user = userEvent.setup();
    RESEAU.total = 12;
    const { etat, page } = await lireCommeLaPage(requete);
    expect(page.data).toHaveLength(0);
    rendre(etat, page);
    expect(screen.getByText(t.title)).toBeInTheDocument();
    for (const texte of VIDES) expect(screen.queryByText(texte)).toBeNull();

    await user.click(screen.getByRole('button', { name: t.premiere }));
    const adresse = new URLSearchParams(navigationDeTest.requete());
    expect(adresse.get('page')).toBeNull();
    expect(adresse.get('q')).toBe(new URLSearchParams(requete).get('q'));
  });

  it('AC3 — data: [], total 0 : l’état vide d’aujourd’hui, sans « au-delà »', async () => {
    RESEAU.total = 0;
    const { etat, page } = await lireCommeLaPage('');
    rendre(etat, page);
    expect(screen.getByText(fr.owners.page.empty_title)).toBeInTheDocument();
    expect(screen.queryByText(t.title)).toBeNull();
  });
});
