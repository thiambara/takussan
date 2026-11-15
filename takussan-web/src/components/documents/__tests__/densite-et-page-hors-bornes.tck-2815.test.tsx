/**
 * TCK-2815 — la bibliothèque de documents du personnel : la densité choisie (`?per_page=`) part à
 * l'API (30 en dur disparaît), et une page au-delà de la dernière ne passe plus pour une
 * bibliothèque vide.
 *
 * Le patron de TCK-2805 : le vrai `useDocuments`, un vrai `QueryClient`, un `fetch` simulé qui lit la
 * requête partie et répond comme l'API (`meta.per_page` et `meta.current_page` sont ceux demandés,
 * `meta.last_page` vient du total), l'adresse de `@/test/navigation-url`, et le vrai
 * `PropertyPagination`.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { navigationDeTest } from '@/test/navigation-url';
import { createQueryClient } from '@/lib/query-client';
import fr from '@/messages/fr.json';

import { DocumentsLibrary } from '../DocumentsLibrary';

vi.mock('next/navigation', async () => (await import('@/test/navigation-url')).moduleNavigation);
// Un membre du personnel : un bailleur verrait le mode d'emploi (`OwnerDocumentsPrimer`), pas l'état vide.
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'jeton', user: { id: 77, agency_id: 1, roles: ['agency_admin'] }, isLoading: false }),
}));
vi.mock('@/hooks/usePersonnelActif', () => ({ usePersonnelActif: () => true, useAgenceDuPersonnelActif: () => 1 }));

const t = fr.console.pagination.pageAuDela;
const VIDE = fr.documents.library.empty_title;

const RESEAU = { total: 45, requetes: [] as URL[] };

const ligne = (id: number) => ({
  id,
  documentable_id: 1,
  documentable_type: 'property',
  uploaded_by: 1,
  name: `piece-${id}`,
  type: 'lease_contract',
  description: null,
  is_verified: false,
  verified_by: null,
  verified_at: null,
  expiry_date: null,
  is_internal: false,
  file_url: null,
  file_name: `piece-${id}.pdf`,
  file_size: 1000,
  mime_type: 'application/pdf',
  created_at: '2026-10-01T10:00:00+00:00',
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
      const data = Array.from({ length: Math.max(0, Math.min(parPage, RESEAU.total - debut)) }, (_, i) => ligne(debut + i + 1));
      const meta = {
        total: RESEAU.total,
        per_page: parPage,
        current_page: page,
        last_page: Math.max(1, Math.ceil(RESEAU.total / parPage)),
        counts: RESEAU.total > 0 ? { lease_contract: RESEAU.total } : {},
      };
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

const derniere = () => RESEAU.requetes.filter((u) => u.pathname.endsWith('/api/documents')).at(-1);

function rendre() {
  return render(withIntl(<QueryClientProvider client={createQueryClient()}><DocumentsLibrary /></QueryClientProvider>));
}

describe('TCK-2815 — bibliothèque de documents du personnel', () => {
  it('AC1 — ?per_page=50 : la requête porte per_page=50 et le sélecteur affiche 50', async () => {
    navigationDeTest.reinitialiser('per_page=50');
    rendre();
    const selecteur = await screen.findByRole('combobox', { name: fr.search.toolbar.perPageAria });
    expect(derniere()!.searchParams.get('per_page')).toBe('50');
    expect(selecteur).toHaveTextContent('50 / page');
  });

  it.each(['37', '30', 'abc', '5000'])('AC1 — ?per_page=%s : la requête porte per_page=20, le sélecteur affiche 20', async (valeur) => {
    navigationDeTest.reinitialiser(`per_page=${valeur}`);
    rendre();
    const selecteur = await screen.findByRole('combobox', { name: fr.search.toolbar.perPageAria });
    expect(derniere()!.searchParams.get('per_page')).toBe('20');
    expect(selecteur).toHaveTextContent('20 / page');
  });

  it('la pagination se rend sur une seule page de plus de 10 documents : choisir 50 y est possible, et part', async () => {
    const user = userEvent.setup();
    RESEAU.total = 15;
    navigationDeTest.reinitialiser('search=bail');
    rendre();
    const selecteur = await screen.findByRole('combobox', { name: fr.search.toolbar.perPageAria });
    await user.click(selecteur);
    await user.click(await screen.findByRole('option', { name: '50 / page' }));
    expect(new URLSearchParams(navigationDeTest.requete()).get('search')).toBe('bail');
    await waitFor(() => expect(derniere()!.searchParams.get('per_page')).toBe('50'));
    await waitFor(() => expect(screen.getByRole('combobox', { name: fr.search.toolbar.perPageAria })).toHaveTextContent('50 / page'));
  });

  it('AC2 — ?page=9, data: [], total 12 : l’état « au-delà de la dernière page », pas l’état vide', async () => {
    const user = userEvent.setup();
    RESEAU.total = 12;
    navigationDeTest.reinitialiser('search=bail&page=9');
    rendre();
    expect(await screen.findByText(t.title)).toBeInTheDocument();
    expect(screen.queryByText(VIDE)).toBeNull();
    expect(screen.queryByText(fr.documents.library.empty_description)).toBeNull();
    // Pas de « Page 9 sur 1 » sous l'état : il porte ses propres chemins.
    expect(screen.queryByRole('combobox', { name: fr.search.toolbar.perPageAria })).toBeNull();

    await user.click(screen.getByRole('button', { name: t.premiere }));
    const adresse = new URLSearchParams(navigationDeTest.requete());
    expect(adresse.get('page')).toBeNull();
    expect(adresse.get('search')).toBe('bail');
  });

  it('AC3 — data: [], total 0 : l’état vide d’aujourd’hui, sans « au-delà »', async () => {
    RESEAU.total = 0;
    navigationDeTest.reinitialiser('');
    rendre();
    expect(await screen.findByText(VIDE)).toBeInTheDocument();
    expect(screen.queryByText(t.title)).toBeNull();
  });
});
