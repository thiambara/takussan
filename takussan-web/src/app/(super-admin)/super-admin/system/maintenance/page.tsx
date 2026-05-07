'use client';

import { useQuery } from '@tanstack/react-query';
import { MaintenanceScheduler } from '@/components/admin/super/maintenance';
import { fetchMaintenance } from '@/lib/queries/super-admin';
import type { MaintenanceStatusResponse } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';

export default function SuperAdminMaintenancePage() {
  const query = useQuery<MaintenanceStatusResponse, ApiError>({
    queryKey: ['super-admin', 'maintenance'],
    queryFn: fetchMaintenance,
    staleTime: 30_000,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-stone-900">Mode maintenance</h1>
        <p className="mt-1 text-sm text-stone-600">
          Programmez une fenêtre, prévenez les utilisateurs et gardez le contrôle depuis la console.
        </p>
      </header>

      {query.isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-stone-200" />
      ) : query.isError ? (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-900 ring-1 ring-red-200">
          Erreur de chargement. {query.error.displayMessage}
        </div>
      ) : (
        <MaintenanceScheduler status={query.data!.data} />
      )}
    </div>
  );
}
