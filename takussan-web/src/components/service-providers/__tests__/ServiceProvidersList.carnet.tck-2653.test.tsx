/**
 * TCK-2653 — le carnet des prestataires (maquette « Agence — carnet des prestataires ») : chaque
 * prestataire joignable a son numéro, « Appeler » (`tel:`) et WhatsApp (`wa.me`), sa note quand il en
 * a une et ses interventions (AC5) ; les invitations en cours sont marquées ; le métier se filtre
 * PAR LE SERVEUR (`filter[specialty]`).
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
    const metier = url.searchParams.get('filter[specialty]');
    // Le serveur filtre : ce faux serveur ne rend que les lignes du métier demandé.
    const lignes = metier ? LIGNES.filter((l) => (l.specialties ?? []).includes(metier)) : LIGNES;
    return { data: lignes, meta: { total: lignes.length, current_page: 1, last_page: 1, per_page: 100 } };
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
    service_areas: ['Sacré-Cœur'],
    metadata: null,
    created_at: '2026-11-06T10:00:00Z',
    user: { id: 101, first_name: 'Astou', last_name: 'Sy', email: 'a@example.test' },
    phone: '+221775384106',
    average_rating: '4.6667',
    reviews_count: 12,
    completed_interventions_count: 12,
    ...extra,
  };
}

const LIGNES: ServiceProviderProfileSummary[] = [
  ligne({}),
  ligne({ id: 2, user_id: 102, specialties: ['painting'], user: { id: 102, first_name: 'Moussa', last_name: 'Faye', email: 'm@example.test' }, phone: '+221709152860', average_rating: null, reviews_count: 0, completed_interventions_count: 0 }),
  ligne({
    id: 3,
    user_id: null,
    status: 'draft',
    specialties: null,
    metadata: { first_name: 'Froid', last_name: 'Service', phone: '+221774026618', trades: ['climate_control'] },
    user: null,
    phone: null,
    average_rating: null,
    completed_interventions_count: 0,
    pending_invitation_id: 9,
  }),
];

const donnees = { data: LIGNES, meta: { total: 3, current_page: 1, last_page: 1, per_page: 100 } } as never;

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

const rangee = async (nom: string) => (await within(await screen.findByRole('table')).findByText(nom)).closest('tr') as HTMLElement;

describe('Carnet — AC5 : numéro, appel, WhatsApp, note', () => {
  it('le numéro servi par l’API, `tel:` et `wa.me`, la note et les interventions', async () => {
    rendre();
    const astou = await rangee('Astou Sy');
    expect(astou).toHaveTextContent('+221 77 538 41 06');
    expect(within(astou).getByRole('link', { name: 'Appeler Astou Sy' })).toHaveAttribute('href', 'tel:+221775384106');
    const wa = new URL(within(astou).getByRole('link', { name: 'Écrire à Astou Sy sur WhatsApp' }).getAttribute('href')!);
    expect(wa.host).toBe('wa.me');
    expect(wa.pathname).toBe('/221775384106');
    expect(astou).toHaveTextContent('4,7');
    expect(astou).toHaveTextContent('12');
  });

  it('sans avis : « Pas encore noté »', async () => {
    rendre();
    expect(await rangee('Moussa Faye')).toHaveTextContent('Pas encore noté');
  });

  it('une invitation en cours est marquée, avec Renvoyer et Révoquer, sans appel', async () => {
    rendre();
    const froid = await rangee('Froid Service');
    expect(froid).toHaveTextContent('Invitation envoyée');
    expect(froid).toHaveTextContent(/Invité le .* pas encore de compte/);
    expect(within(froid).getByRole('button', { name: /Renvoyer/ })).toBeInTheDocument();
    expect(within(froid).queryByRole('link', { name: /Appeler/ })).toBeNull();
  });

  it('le sous-titre compte les actifs et les invitations', async () => {
    rendre();
    expect(await screen.findByText('2 actifs · 1 invitation en attente')).toBeInTheDocument();
  });

  it('au téléphone, une carte par prestataire, gestes compris', async () => {
    rendre();
    const cartes = await waitFor(() => {
      const c = document.querySelectorAll<HTMLElement>('[data-slot="carte-prestataire"]');
      if (c.length === 0) throw new Error('pas de carte');
      return c;
    });
    expect(cartes).toHaveLength(3);
    expect(within(cartes[0]).getByRole('link', { name: 'Appeler Astou Sy' })).toBeInTheDocument();
  });
});

describe('Carnet — le métier se filtre par le serveur', () => {
  it('une pastille de métier relit le carnet avec `filter[specialty]`', async () => {
    const u = rendre();
    const pastilles = await screen.findByRole('group', { name: 'Métier' });
    await u.click(within(pastilles).getByRole('button', { name: 'Peinture' }));
    await waitFor(() => expect(reseau.chemins.some((c) => new URL(c, 'http://api.test').searchParams.get('filter[specialty]') === 'painting')).toBe(true));
    const table = screen.getByRole('table');
    await waitFor(() => expect(within(table).queryByText('Astou Sy')).toBeNull());
    expect(within(table).getByText('Moussa Faye')).toBeInTheDocument();
  });
});
