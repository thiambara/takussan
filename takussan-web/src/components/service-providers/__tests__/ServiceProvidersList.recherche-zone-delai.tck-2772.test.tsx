/**
 * TCK-2772 — le carnet se cherche (nom, téléphone, quartier) et se filtre par zone PAR LE SERVEUR
 * (`filter[search]`, `filter[zone]`), la liste des zones venant de `meta.zones` ; le délai de
 * réponse médian servi par l'API s'affiche dans sa colonne et sur la carte.
 *
 * Le faux serveur rend, sous un filtre, une ligne qu'aucun filtre côté client n'aurait gardée : si
 * elle s'affiche, c'est que l'écran montre ce que le serveur a décidé, et rien d'autre.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { ServiceProviderProfileSummary } from '@/lib/queries/service-providers';

const reseau = vi.hoisted(() => ({ chemins: [] as string[] }));

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: vi.fn(async (chemin: string) => {
    reseau.chemins.push(chemin);
    const url = new URL(chemin, 'http://api.test');
    const filtre = url.searchParams.get('filter[search]') ?? url.searchParams.get('filter[zone]');
    // Le serveur décide : sous un filtre, il rend Moussa Faye seul, que ni son nom, ni son numéro,
    // ni ses zones ne rapprochent du terme.
    const lignes = filtre ? [LIGNES[1]] : LIGNES;
    return { data: lignes, meta: { total: lignes.length, current_page: 1, last_page: 1, per_page: 100, zones: ['Mermoz', 'Sacré-Cœur'] } };
  }),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, token: 'jeton', isLoading: false }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

function ligne(extra: Partial<ServiceProviderProfileSummary>): ServiceProviderProfileSummary {
  return {
    id: 1,
    user_id: 101,
    status: 'active',
    specialties: ['plumbing'],
    service_areas: ['Sacré-Cœur', 'Mermoz'],
    metadata: null,
    created_at: '2026-11-06T10:00:00Z',
    user: { id: 101, first_name: 'Astou', last_name: 'Sy', email: 'a@example.test' },
    phone: '+221775384106',
    average_rating: null,
    reviews_count: 0,
    completed_interventions_count: 12,
    response_delay_minutes: 20,
    ...extra,
  };
}

const LIGNES: ServiceProviderProfileSummary[] = [
  ligne({}),
  ligne({ id: 2, user_id: 102, specialties: ['painting'], service_areas: ['Dakar'], user: { id: 102, first_name: 'Moussa', last_name: 'Faye', email: 'm@example.test' }, phone: '+221709152860', response_delay_minutes: 125 }),
  ligne({ id: 3, user_id: 103, user: { id: 103, first_name: 'Pape', last_name: 'Sarr', email: 'p@example.test' }, phone: '+221765883017', response_delay_minutes: null }),
];

const donnees = { data: LIGNES, meta: { total: 3, current_page: 1, last_page: 1, per_page: 100, zones: ['Mermoz', 'Sacré-Cœur'] } } as never;

beforeEach(() => {
  reseau.chemins = [];
});

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    withIntl(
      <QueryClientProvider client={client}>
        <ServiceProvidersList agencyId={7} canInvite initialData={donnees} />
      </QueryClientProvider>,
    ),
  );
  return userEvent.setup();
}

const { ServiceProvidersList } = await import('../ServiceProvidersList');

const parametre = (nom: string) => reseau.chemins.map((c) => new URL(c, 'http://api.test').searchParams.get(nom)).filter(Boolean);
const table = () => screen.getByRole('table');

describe('Carnet — la recherche part au serveur', () => {
  it('le terme tapé relit le carnet avec `filter[search]`, et la ligne rendue par le serveur s’affiche', async () => {
    const u = rendre();
    await u.type(await screen.findByRole('searchbox', { name: 'Rechercher un prestataire' }), '77538');
    await waitFor(() => expect(parametre('filter[search]')).toContain('77538'));
    await waitFor(() => expect(within(table()).queryByText('Astou Sy')).toBeNull());
    expect(within(table()).getByText('Moussa Faye')).toBeInTheDocument();
  });

  it('un seul champ de recherche, avec la consigne « Nom, téléphone, quartier »', async () => {
    rendre();
    const champs = await screen.findAllByRole('searchbox');
    expect(champs).toHaveLength(1);
    expect(champs[0]).toHaveAttribute('placeholder', 'Nom, téléphone, quartier');
  });
});

describe('Carnet — la zone part au serveur', () => {
  it('la liste des zones vient de `meta.zones`, et choisir une zone relit avec `filter[zone]`', async () => {
    const u = rendre();
    await u.click(await screen.findByRole('combobox', { name: 'Zone' }));
    expect(await screen.findByRole('option', { name: 'Toutes les zones' })).toBeInTheDocument();
    // « Dakar » est la zone d'une ligne chargée, mais pas du carnet servi : elle n'est pas proposée.
    expect(screen.queryByRole('option', { name: 'Dakar' })).toBeNull();
    await u.click(await screen.findByRole('option', { name: 'Sacré-Cœur' }));
    await waitFor(() => expect(parametre('filter[zone]')).toContain('Sacré-Cœur'));
    await waitFor(() => expect(within(table()).queryByText('Astou Sy')).toBeNull());
    expect(within(table()).getByText('Moussa Faye')).toBeInTheDocument();
  });
});

describe('Carnet — le délai de réponse', () => {
  it('au bureau, la colonne « Délai de réponse » : ~20 min, ~2 h, et un tiret sans mesure', async () => {
    rendre();
    expect(await within(table()).findByRole('columnheader', { name: 'Délai de réponse' })).toBeInTheDocument();
    const rangee = (nom: string) => within(table()).getByText(nom).closest('tr') as HTMLElement;
    expect(rangee('Astou Sy')).toHaveTextContent('~20 min');
    expect(rangee('Moussa Faye')).toHaveTextContent('~2 h');
    expect(rangee('Pape Sarr')).not.toHaveTextContent(/~\d/);
  });

  it('au téléphone, « Répond en … » sur la carte, et rien sans mesure', async () => {
    rendre();
    const cartes = await waitFor(() => {
      const c = document.querySelectorAll<HTMLElement>('[data-slot="carte-prestataire"]');
      if (c.length === 0) throw new Error('pas de carte');
      return c;
    });
    expect(cartes[0]).toHaveTextContent('Répond en ~20 min');
    expect(cartes[1]).toHaveTextContent('Répond en ~2 h');
    expect(cartes[2]).not.toHaveTextContent('Répond en');
  });
});
