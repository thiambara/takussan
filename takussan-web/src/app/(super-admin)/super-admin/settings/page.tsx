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
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      {/* Warning banner: amber Tailwind kept as documented exception (TCK-245) — no `--warning` DS token available. */}
      <div className="flex gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-200">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>{t('sensitiveNotice')}</p>
      </div>

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
