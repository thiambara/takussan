/**
 * TCK-2648 — les deux appels de la signature sur place (ADR-0098) : `POST …/sign/onsite-code`, puis
 * `POST …/sign` avec `role=tenant`, le tracé ET le code. Sans code (depuis le compte de la partie), le
 * corps reste celui d'avant : `role` et `signature`, rien d'autre.
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

const { useEnvoyerCodeSurPlace, useInventoryTemplate, useSignInventory } = await import('@/lib/queries/inventory');

function enveloppe({ children }: { readonly children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return withIntl(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}

function corps(appel: unknown[]): unknown {
  const options = appel[1] as { body?: unknown };
  return typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
}

beforeEach(() => {
  mockApiRequest.mockReset();
  mockApiRequest.mockResolvedValue({ data: { channel: 'sms', destination: '+221 77 ••• 18 90' } });
});

describe('TCK-2648 — les appels de la signature sur place', () => {
  it('le code part par `POST /api/inventories/{id}/sign/onsite-code`', async () => {
    const { result } = renderHook(() => useEnvoyerCodeSurPlace(19), { wrapper: enveloppe });
    const reponse = await result.current.mutateAsync();
    expect(mockApiRequest.mock.calls[0][0]).toBe('/api/inventories/19/sign/onsite-code');
    expect(mockApiRequest.mock.calls[0][1]).toMatchObject({ method: 'POST' });
    expect(reponse.data.destination).toBe('+221 77 ••• 18 90');
  });

  it('sur place, `sign` porte le code ; depuis le compte, le corps est inchangé', async () => {
    const { result } = renderHook(() => useSignInventory(19), { wrapper: enveloppe });
    await result.current.mutateAsync({ role: 'tenant', signature: 'data:image/png;base64,T', code: '123456' });
    await result.current.mutateAsync({ role: 'tenant', signature: 'data:image/png;base64,T' });

    expect(mockApiRequest.mock.calls[0][0]).toBe('/api/inventories/19/sign');
    expect(corps(mockApiRequest.mock.calls[0])).toEqual({ role: 'tenant', signature: 'data:image/png;base64,T', code: '123456' });
    expect(corps(mockApiRequest.mock.calls[1])).toEqual({ role: 'tenant', signature: 'data:image/png;base64,T' });
  });
});

describe('TCK-2647 — le modèle de pièces passe par cheminApi', () => {
  it('`GET /api/inventory-templates?…` porte la requête, encodée', async () => {
    renderHook(() => useInventoryTemplate({ property_type: 'apartment', bedrooms: '2' }), { wrapper: enveloppe });
    await waitFor(() => expect(mockApiRequest).toHaveBeenCalled());
    expect(mockApiRequest.mock.calls[0][0]).toBe('/api/inventory-templates?property_type=apartment&bedrooms=2');
  });

  it('sans requête, aucun appel', () => {
    renderHook(() => useInventoryTemplate(null), { wrapper: enveloppe });
    expect(mockApiRequest).not.toHaveBeenCalled();
  });
});
