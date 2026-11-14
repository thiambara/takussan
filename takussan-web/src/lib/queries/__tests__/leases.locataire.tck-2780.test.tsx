/**
 * TCK-2780 — `GET /api/leases/{id}` ne rend le locataire que sous `include=tenant`, et seulement les clés
 * de `fields[customers]`. La fiche du bail le demande avec ce qu'elle en lit ; l'onglet « Location » du
 * bien, qui n'en lit rien, ne le demande pas.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

const mockApiRequest = vi.fn();

vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, apiRequest: (...args: unknown[]) => mockApiRequest(...args) };
});

const { useLease } = await import('@/lib/queries/leases');

function enveloppe({ children }: { readonly children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return withIntl(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}

async function requeteDe(appel: () => unknown): Promise<{ chemin: string; params: URLSearchParams }> {
  renderHook(appel, { wrapper: enveloppe });
  await waitFor(() => expect(mockApiRequest).toHaveBeenCalled());
  const [chemin, params = ''] = decodeURIComponent(mockApiRequest.mock.calls[0][0] as string).split('?');
  return { chemin, params: new URLSearchParams(params) };
}

beforeEach(() => {
  mockApiRequest.mockReset();
  mockApiRequest.mockResolvedValue({ data: { id: 80 } });
});

describe('TCK-2780 — le locataire du bail, à la demande', () => {
  it('la fiche du bail demande le locataire, avec les seules clés qu’elle lit', async () => {
    const { chemin, params } = await requeteDe(() => useLease(80, { avecLocataire: true }));
    expect(chemin).toBe('/api/leases/80');
    expect(params.get('include')?.split(',')).toEqual(['property', 'landlord', 'agent', 'tenant']);
    expect(params.get('fields[customers]')?.split(',')).toEqual(['id', 'user_id', 'first_name', 'last_name', 'phone', 'email']);
    // Rien d'autre que le locataire n'est borné : `show` rend le bail entier.
    expect([...params.keys()].filter((k) => k.startsWith('fields['))).toEqual(['fields[customers]']);
  });

  it('sans l’option (l’onglet « Location » du bien), ni `tenant` ni `fields`', async () => {
    const { chemin, params } = await requeteDe(() => useLease(80));
    expect(chemin).toBe('/api/leases/80');
    expect(params.get('include')?.split(',')).toEqual(['property', 'landlord', 'agent']);
    expect([...params.keys()].some((k) => k.startsWith('fields['))).toBe(false);
  });
});
