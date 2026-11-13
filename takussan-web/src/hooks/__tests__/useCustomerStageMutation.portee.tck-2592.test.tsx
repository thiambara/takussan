import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useCustomerStageMutation } from '../useCustomerStageMutation';
import { PIPELINE_QUERY_KEY } from '../pipelineKeys';
import type { PagePipeline } from '@/lib/queries/pipeline';
import type { PipelineCustomerCard } from '@/types/pipeline';

const patchMock = vi.fn();

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'test-token' }) }));
vi.mock('@/lib/queries/pipeline', () => ({ patchCustomerPipelineStage: (...args: unknown[]) => patchMock(...args) }));

const carte = (id: number, stage: PipelineCustomerCard['pipeline_stage']): PipelineCustomerCard => ({
  id,
  first_name: `U${id}`,
  last_name: 'L',
  pipeline_stage: stage,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
  added_by_id: 1,
});

/**
 * TCK-2592 — la colonne a une copie par portée et filtres, la liste des relances aussi : la mise à
 * jour optimiste les déplace toutes, le refus les restaure toutes.
 */
function monter() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  queryClient.setQueryData(PIPELINE_QUERY_KEY.column('negotiating', 'referent=me&status=active'), [carte(42, 'negotiating')]);
  queryClient.setQueryData(PIPELINE_QUERY_KEY.column('qualified', 'referent=me&status=active'), []);
  queryClient.setQueryData(PIPELINE_QUERY_KEY.column('negotiating', 'status=active'), [carte(42, 'negotiating'), carte(7, 'negotiating')]);
  queryClient.setQueryData<PagePipeline>(PIPELINE_QUERY_KEY.list('referent=me&status=active', 'a-relancer'), { lignes: [carte(42, 'negotiating'), carte(7, 'negotiating')], total: 2 });
  const hook = renderHook(() => useCustomerStageMutation(), { wrapper });
  return { queryClient, hook };
}

describe('useCustomerStageMutation — portée et listes (TCK-2592)', () => {
  beforeEach(() => {
    patchMock.mockReset();
  });
  // Une réponse tenue en suspens le temps de lire l'état optimiste, puis rendue (sans quoi la
  // mutation reste en vol après le test).
  let rendre: (v: unknown) => void = () => undefined;
  const enSuspens = () => new Promise((r) => { rendre = r; });
  afterEach(() => rendre({ id: 42 }));

  it('déplace la carte dans chaque copie de la colonne, vers la cible des mêmes filtres', async () => {
    patchMock.mockImplementation(enSuspens);
    const { queryClient, hook } = monter();
    act(() => hook.result.current.mutate({ customerId: 42, from: 'negotiating', to: 'qualified' }));
    await waitFor(() => {
      expect(queryClient.getQueryData<PipelineCustomerCard[]>(PIPELINE_QUERY_KEY.column('negotiating', 'referent=me&status=active'))).toEqual([]);
      expect(queryClient.getQueryData<PipelineCustomerCard[]>(PIPELINE_QUERY_KEY.column('qualified', 'referent=me&status=active'))?.map((c) => c.id)).toEqual([42]);
      expect(queryClient.getQueryData<PipelineCustomerCard[]>(PIPELINE_QUERY_KEY.column('negotiating', 'status=active'))?.map((c) => c.id)).toEqual([7]);
    });
    // La cible jamais lue de l'autre portée n'est pas créée.
    expect(queryClient.getQueryData(PIPELINE_QUERY_KEY.column('qualified', 'status=active'))).toBeUndefined();
    const liste = queryClient.getQueryData<PagePipeline>(PIPELINE_QUERY_KEY.list('referent=me&status=active', 'a-relancer'));
    expect(liste?.lignes.find((c) => c.id === 42)?.pipeline_stage).toBe('qualified');
  });

  it('une sortie retire la ligne de la liste et en décompte le total', async () => {
    patchMock.mockImplementation(enSuspens);
    const { queryClient, hook } = monter();
    act(() => hook.result.current.mutate({ customerId: 42, from: 'negotiating', to: 'lost', reason: 'Prix' }));
    await waitFor(() => {
      const liste = queryClient.getQueryData<PagePipeline>(PIPELINE_QUERY_KEY.list('referent=me&status=active', 'a-relancer'));
      expect(liste).toEqual({ lignes: [carte(7, 'negotiating')], total: 1 });
    });
  });

  it('un refus restaure toutes les copies et la liste', async () => {
    patchMock.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
    const { queryClient, hook } = monter();
    act(() => hook.result.current.mutate({ customerId: 42, from: 'negotiating', to: 'lost', reason: 'Prix' }));
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(queryClient.getQueryData<PipelineCustomerCard[]>(PIPELINE_QUERY_KEY.column('negotiating', 'referent=me&status=active'))?.map((c) => c.id)).toEqual([42]);
    expect(queryClient.getQueryData<PipelineCustomerCard[]>(PIPELINE_QUERY_KEY.column('negotiating', 'status=active'))?.map((c) => c.id)).toEqual([42, 7]);
    expect(queryClient.getQueryData<PagePipeline>(PIPELINE_QUERY_KEY.list('referent=me&status=active', 'a-relancer'))?.total).toBe(2);
  });
});
