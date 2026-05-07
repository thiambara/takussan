'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertRuleDialog, AlertRuleTable } from '@/components/admin/super/alerts';
import { Button } from '@/components/ui/button';
import { fetchAlertRules } from '@/lib/queries/super-admin';
import type { AlertRulesResponse } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';

export default function SuperAdminAlertsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const query = useQuery<AlertRulesResponse, ApiError>({
    queryKey: ['super-admin', 'alert-rules'],
    queryFn: fetchAlertRules,
    staleTime: 30_000,
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-stone-900">Alertes sensibles</h1>
          <p className="mt-1 text-sm text-stone-600">
            Envoyez des alertes asynchrones pour les actions critiques de la plateforme.
          </p>
        </div>
        <Button type="button" onClick={() => setDialogOpen(true)}>Nouvelle règle</Button>
      </header>

      {query.isLoading ? (
        <div className="h-48 animate-pulse rounded-xl bg-stone-200" />
      ) : query.isError ? (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-900 ring-1 ring-red-200">
          Erreur de chargement. {query.error.displayMessage}
        </div>
      ) : (
        <AlertRuleTable rules={query.data?.data ?? []} catalogue={query.data?.catalogue ?? {}} />
      )}
      <AlertRuleDialog
        rule={null}
        catalogue={query.data?.catalogue ?? {}}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
