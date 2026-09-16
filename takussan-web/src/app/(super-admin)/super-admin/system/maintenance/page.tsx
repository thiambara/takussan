'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { MaintenanceScheduler } from '@/components/admin/super/maintenance';
import { fetchMaintenance } from '@/lib/queries/super-admin';
import type { MaintenanceStatusResponse } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { PageHeader } from '@/components/console';
import { ErrorState } from '@/components/feedback';
import { Skeleton } from '@/components/ui/skeleton';

export default function SuperAdminMaintenancePage() {
  const t = useTranslations('superAdmin.pages.maintenance');
  const tShared = useTranslations('superAdmin.pages.shared');
  const tCommon = useTranslations('common');
  const messageErreur = useMessageErreurApi();
  const query = useQuery<MaintenanceStatusResponse, ApiError>({
    queryKey: ['super-admin', 'maintenance'],
    queryFn: fetchMaintenance,
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
        <MaintenanceScheduler status={query.data!.data} />
      )}
    </div>
  );
}
