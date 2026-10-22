import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import { withIntl } from '@/test/intl';

/**
 * TCK-776 (P15.09) — le premier bail : quels biens le sélecteur propose, et ce qu'il dit quand il
 * n'y en a aucun.
 *
 * Avant ce ticket, seuls les biens `available` étaient demandés à l'API : un bien neuf (`draft`)
 * ou en modération (`pending_review`) n'apparaissait pas, alors que l'API n'exige aucun statut
 * pour ouvrir un bail. Et une liste vide ne disait rien, sans lien pour créer le bien ou le
 * locataire.
 *
 * TCK-1371 — les biens sont lus par `useQuery` (toutes les pages), plus par `useApiQuery`.
 */
const { ETAT, AUTH, ROUTEUR, MUTATION, useApiQueryMock, useQueryMock } = vi.hoisted(() => ({
  ETAT: {
    biens: { data: [] as unknown[] },
    clients: { data: [] as unknown[] },
  },
  AUTH: { user: { id: 4, full_name: 'Moussa Fall' } },
  ROUTEUR: { push: () => {}, back: () => {} },
  MUTATION: { mutateAsync: async () => ({ data: { id: 1 } }) },
  useApiQueryMock: vi.fn(),
  useQueryMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ROUTEUR }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => AUTH }));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: (...a: unknown[]) => useQueryMock(...a),
}));
vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: (...a: unknown[]) => useApiQueryMock(...a),
  useApiMutation: () => MUTATION,
}));

import { CreateLeaseForm } from '../CreateLeaseForm';
import { useLeasePropertyOptions } from '@/lib/queries/leases';

beforeEach(() => {
  useApiQueryMock.mockReset();
  useApiQueryMock.mockImplementation(() => ({ data: ETAT.clients, isLoading: false }));
  useQueryMock.mockReset();
  useQueryMock.mockImplementation(() => ({ data: ETAT.biens, isLoading: false }));
  ETAT.biens = { data: [] };
  ETAT.clients = { data: [] };
});

describe('useLeasePropertyOptions — les biens qui peuvent recevoir un bail', () => {
  it('demande tous les statuts sauf vendu, archivé et loué', async () => {
    renderHook(() => useLeasePropertyOptions(), {
      wrapper: ({ children }: { children: ReactNode }) => withIntl(<>{children}</>),
    });
    const { queryFn } = useQueryMock.mock.calls[0][0] as {
      queryFn: (c: { signal: AbortSignal }) => Promise<unknown>;
    };
    const urls: URL[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(new URL(String(url), 'http://api.test'));
        return new Response(
          JSON.stringify({ data: [], meta: { current_page: 1, last_page: 1, per_page: 100, total: 0 } }),
          { status: 200 },
        );
      }),
    );
    await queryFn({ signal: new AbortController().signal });
    vi.unstubAllGlobals();

    expect(urls[0].pathname).toBe('/api/properties');
    const statuts = (urls[0].searchParams.get('filter[status]') ?? '').split(',').sort();
    expect(statuts).toEqual(
      [
        'available',
        'draft',
        'pending',
        'pending_review',
        'published',
        'rejected',
        'unavailable',
        'under_maintenance',
      ].sort(),
    );
    expect(statuts).not.toContain('sold');
    expect(statuts).not.toContain('archived');
    expect(statuts).not.toContain('rented');
  });
});

describe('CreateLeaseForm — état vide du sélecteur', () => {
  it('sans bien ni locataire : le dit, et mène à « Créer un bien » et « Ajouter un locataire »', () => {
    render(withIntl(<CreateLeaseForm />));

    expect(screen.getByText(/Aucun bien ne peut encore recevoir de bail/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Créer un bien' })).toHaveAttribute('href', '/app/properties/new');
    expect(screen.getByRole('link', { name: 'Ajouter un locataire' })).toHaveAttribute('href', '/app/customers/new');
  });

  it('avec un bien et un locataire : aucun état vide', () => {
    ETAT.biens = { data: [{ id: 11, title: 'Villa Almadies', reference_number: 'REF-011' }] };
    ETAT.clients = { data: [{ id: 21, first_name: 'Awa', last_name: 'Diop' }] };
    render(withIntl(<CreateLeaseForm />));

    expect(screen.queryByText(/Aucun bien ne peut encore recevoir de bail/)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Créer un bien' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Ajouter un locataire' })).toBeNull();
  });
});
