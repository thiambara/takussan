'use client';

import { useMemo } from 'react';
import { useApiQuery } from '@/hooks/useApiQuery';
import type { PaginatedResponse } from '@/types/api';
import type { GatewayProvider } from '@/hooks/useInitiatePayment';

interface IntegrationListItem {
  readonly id: number;
  readonly provider: string;
  readonly agency_id: number | null;
  readonly is_active: boolean;
}

const KNOWN_PROVIDERS: readonly GatewayProvider[] = ['wave', 'orange_money', 'lemon_squeezy'];

/**
 * Resolve the set of payment-gateway providers configured for the current
 * agency. Used by `PayOnlineButton` to know which tiles to enable in the
 * modal. The query fetches a sparse-fields slice (`spatie/laravel-query-builder`)
 * to avoid pulling credentials.
 */
export function usePaymentProviders(agencyId: number | null | undefined) {
  const enabled = Boolean(agencyId);
  const query = useApiQuery<PaginatedResponse<IntegrationListItem>>(
    ['payments', 'gateway-providers', agencyId] as const,
    '/api/integrations',
    {
      enabled,
      params: {
        fields: { integrations: ['id', 'provider', 'agency_id', 'is_active'] },
        filter: agencyId ? { agency_id: agencyId, is_active: 'true' } : {},
        per_page: 100,
      },
    },
  );

  const providers = useMemo<readonly GatewayProvider[]>(() => {
    if (!query.data) return [];
    const set = new Set<GatewayProvider>();
    for (const row of query.data.data) {
      if (!row.is_active) continue;
      const provider = row.provider as GatewayProvider;
      if (KNOWN_PROVIDERS.includes(provider)) set.add(provider);
    }
    return Array.from(set);
  }, [query.data]);

  return { providers, isLoading: query.isLoading };
}
