'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { fetchMeSubscription } from '@/lib/queries/billing';
import { ErrorState } from '@/components/feedback';
import { Skeleton } from '@/components/ui/skeleton';
import { SubscriptionSummary } from './SubscriptionSummary';

export function AgencyBillingClient() {
  const t = useTranslations('billing.subscription');
  const tCommon = useTranslations('common');
  const query = useQuery({ queryKey: ['me', 'subscription'], queryFn: fetchMeSubscription });

  if (query.isLoading) return <Skeleton className="h-60 rounded-xl" />;

  if (query.isError) {
    return (
      <ErrorState
        message={t('loadFailed')}
        onRetry={() => void query.refetch()}
        retryLabel={tCommon('actions.retry')}
      />
    );
  }

  return <SubscriptionSummary subscription={query.data?.data ?? null} />;
}
