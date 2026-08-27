'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import {
  SettingsSection,
  categoryOrder,
  CATEGORY_TITLE_NAMESPACE,
} from '@/components/admin/super/platform-settings';
import { fetchPlatformSettings } from '@/lib/queries/super-admin';
import type { PlatformSettingsResponse } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { PageHeader } from '@/components/console';
import { WarningBanner } from '@/components/ui/warning-banner';

export default function SuperAdminSettingsPage() {
  const t = useTranslations('superAdmin.pages.settings');
  const tShared = useTranslations('superAdmin.pages.shared');
  const tCategory = useTranslations(CATEGORY_TITLE_NAMESPACE);
  const messageErreur = useMessageErreurApi();
  const query = useQuery<PlatformSettingsResponse, ApiError>({
    queryKey: ['super-admin', 'platform-settings'],
    queryFn: fetchPlatformSettings,
    staleTime: 30_000,
  });
  const grouped = query.data?.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
      />

      <WarningBanner icon={<AlertTriangle className="size-4" aria-hidden="true" />}>
        <p>{t('sensitiveNotice')}</p>
      </WarningBanner>

      {query.isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      ) : query.isError ? (
        <div className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive ring-1 ring-destructive/20">
          {tShared('loadError')} {messageErreur(query.error)}
        </div>
      ) : grouped ? (
        <div className="space-y-4">
          {categoryOrder.map((category) => {
            const settings = grouped[category] ?? [];
            return settings.length > 0 ? (
              <SettingsSection
                key={category}
                title={tCategory(category)}
                settings={settings}
              />
            ) : null;
          })}
        </div>
      ) : null}
    </div>
  );
}
