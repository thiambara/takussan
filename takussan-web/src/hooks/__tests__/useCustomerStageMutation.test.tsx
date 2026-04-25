import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useCustomerStageMutation } from '../useCustomerStageMutation';
import { PIPELINE_QUERY_KEY } from '../pipelineKeys';
import type { PipelineCustomerCard } from '@/types/pipeline';

const patchMock = vi.fn();

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

vi.mock('@/lib/queries/pipeline', () => ({
  patchCustomerPipelineStage: (...args: unknown[]) => patchMock(...args),
}));

function makeCard(id: number): PipelineCustomerCard {
  return {
    id,
    first_name: `User${id}`,
    last_name: 'Last',
    pipeline_stage: 'lead',
    created_at: '2026-04-22T00:00:00Z',
    updated_at: '2026-04-22T00:00:00Z',
    added_by_id: 1,
  };
}

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  // Pre-populate caches
  queryClient.setQueryData(PIPELINE_QUERY_KEY.column('lead'), [makeCard(42)]);
  queryClient.setQueryData(PIPELINE_QUERY_KEY.column('prospect'), []);

  const hook = renderHook(() => useCustomerStageMutation(), { wrapper });
  return { queryClient, hook };
}

describe('useCustomerStageMutation', () => {
  beforeEach(() => {
    patchMock.mockReset();
  });

  it('optimistically moves the card and confirms on success', async () => {
    patchMock.mockResolvedValue({ id: 42, pipeline_stage: 'prospect' });
    const { queryClient, hook } = setup();

    act(() => {
      hook.result.current.mutate({ customerId: 42, from: 'lead', to: 'prospect' });
    });

    // Optimistic state immediately reflects the move.
    await waitFor(() => {
      const fromCol = queryClient.getQueryData<PipelineCustomerCard[]>(
        PIPELINE_QUERY_KEY.column('lead'),
      );
      const toCol = queryClient.getQueryData<PipelineCustomerCard[]>(
        PIPELINE_QUERY_KEY.column('prospect'),
      );
      expect(fromCol?.find((c) => c.id === 42)).toBeUndefined();
      expect(toCol?.[0].id).toBe(42);
      expect(toCol?.[0].pipeline_stage).toBe('prospect');
    });

    await waitFor(() => expect(patchMock).toHaveBeenCalledTimes(1));
  });

  it('rolls back to the snapshot on API error', async () => {
    patchMock.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
    const { queryClient, hook } = setup();

    act(() => {
      hook.result.current.mutate({ customerId: 42, from: 'lead', to: 'prospect' });
    });

    await waitFor(() => {
      // After rollback, the original cache shape must come back.
      const fromCol = queryClient.getQueryData<PipelineCustomerCard[]>(
        PIPELINE_QUERY_KEY.column('lead'),
      );
      const toCol = queryClient.getQueryData<PipelineCustomerCard[]>(
        PIPELINE_QUERY_KEY.column('prospect'),
      );
      expect(fromCol?.length).toBe(1);
      expect(fromCol?.[0].id).toBe(42);
      expect(toCol?.length).toBe(0);
    });
  });

  it('forwards reason to the API call when provided', async () => {
    patchMock.mockResolvedValue({ id: 42, pipeline_stage: 'converted' });
    const { hook } = setup();

    act(() => {
      hook.result.current.mutate({
        customerId: 42,
        from: 'lead',
        to: 'converted',
        reason: 'Bail signé',
      });
    });

    await waitFor(() => expect(patchMock).toHaveBeenCalled());
    expect(patchMock).toHaveBeenCalledWith(
      'test-token',
      42,
      'converted',
      'Bail signé',
    );
  });
});
