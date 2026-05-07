'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import {
  SettingsSection,
  categoryOrder,
  categoryTitle,
} from '@/components/admin/super/platform-settings';
import { fetchPlatformSettings } from '@/lib/queries/super-admin';
import type { PlatformSettingsResponse } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';

export default function SuperAdminSettingsPage() {
  const query = useQuery<PlatformSettingsResponse, ApiError>({
    queryKey: ['super-admin', 'platform-settings'],
    queryFn: fetchPlatformSettings,
    staleTime: 30_000,
  });
  const grouped = query.data?.data;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-stone-900">Paramètres plateforme</h1>
        <p className="mt-1 text-sm text-stone-600">
          Réglez les devises, formats, frais et limites globales sans redéploiement.
        </p>
      </header>

      <div className="flex gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-200">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>
          Les paramètres marqués comme sensibles peuvent nécessiter un redémarrage de queue ou un vidage de cache applicatif.
        </p>
      </div>

      {query.isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-stone-200" />
      ) : query.isError ? (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-900 ring-1 ring-red-200">
          Erreur de chargement. {query.error.displayMessage}
        </div>
      ) : grouped ? (
        <div className="space-y-4">
          {categoryOrder.map((category) => {
            const settings = grouped[category] ?? [];
            return settings.length > 0 ? (
              <SettingsSection
                key={category}
                title={categoryTitle[category]}
                settings={settings}
              />
            ) : null;
          })}
        </div>
      ) : null}
    </div>
  );
}
