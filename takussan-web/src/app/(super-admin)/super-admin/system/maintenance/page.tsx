'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { MaintenanceScheduler } from '@/components/admin/super/maintenance';
import { fetchMaintenance } from '@/lib/queries/super-admin';
import type { MaintenanceStatusResponse } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

export default function SuperAdminMaintenancePage() {
  const t = useTranslations('superAdmin.pages.maintenance');
  const tShared = useTranslations('superAdmin.pages.shared');
  const messageErreur = useMessageErreurApi();
  const query = useQuery<MaintenanceStatusResponse, ApiError>({
    queryKey: ['super-admin', 'maintenance'],
    queryFn: fetchMaintenance,
    staleTime: 30_000,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      {query.isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      ) : query.isError ? (
        <div className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive ring-1 ring-destructive/20">
          {tShared('loadError')} {messageErreur(query.error)}
        </div>
      ) : (
        <MaintenanceScheduler status={query.data!.data} />
      )}
    </div>
  );
}
