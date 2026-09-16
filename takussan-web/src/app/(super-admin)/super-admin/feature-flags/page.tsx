'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { FeatureFlagTable } from '@/components/admin/super/feature-flags';
import { fetchAdminFeatureFlags } from '@/lib/queries/super-admin';
import type { AdminFeatureFlagsResponse } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { PageHeader } from '@/components/console';
import { ErrorState } from '@/components/feedback';
import { Skeleton } from '@/components/ui/skeleton';

export default function SuperAdminFeatureFlagsPage() {
  const t = useTranslations('superAdmin.pages.featureFlags');
  const tShared = useTranslations('superAdmin.pages.shared');
  const tCommon = useTranslations('common');
  const messageErreur = useMessageErreurApi();
  const query = useQuery<AdminFeatureFlagsResponse, ApiError>({
    queryKey: ['super-admin', 'feature-flags'],
    queryFn: fetchAdminFeatureFlags,
    staleTime: 30_000,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
      />

      {query.isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : query.isError ? (
        <ErrorState
          message={`${tShared('loadError')} ${messageErreur(query.error)}`}
          onRetry={() => void query.refetch()}
          retryLabel={tCommon('actions.retry')}
        />
      ) : (
        <FeatureFlagTable flags={query.data?.data ?? []} />
      )}
    </div>
  );
}
