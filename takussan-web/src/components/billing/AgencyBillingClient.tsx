'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchMeSubscription } from '@/lib/queries/billing';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { SubscriptionSummary } from './SubscriptionSummary';

export function AgencyBillingClient() {
  const query = useQuery({ queryKey: ['me', 'subscription'], queryFn: fetchMeSubscription });

  if (query.isLoading) return <Skeleton className="h-60 rounded-xl" />;

  if (query.isError) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">Impossible de charger l&apos;abonnement.</CardContent>
      </Card>
    );
  }

  return <SubscriptionSummary subscription={query.data?.data ?? null} />;
}
