'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchMyPlatformPayouts } from '@/lib/queries/super-admin';
import { PayoutTable } from './PayoutTable';

export function AgencyPayoutsClient() {
  const query = useQuery({
    queryKey: ['me', 'payouts'],
    queryFn: fetchMyPlatformPayouts,
  });

  return (
    <PayoutTable
      payouts={query.data?.data ?? []}
      isLoading={query.isLoading}
      emptyHint="Aucun reversement plateforme reçu pour le moment."
    />
  );
}
