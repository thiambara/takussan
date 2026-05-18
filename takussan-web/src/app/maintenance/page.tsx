'use client';

import { useQuery } from '@tanstack/react-query';
import type { MaintenanceStatusResponse } from '@/types/super-admin';

async function fetchStatus(): Promise<MaintenanceStatusResponse> {
  const res = await fetch('/api/maintenance/status');
  return res.json() as Promise<MaintenanceStatusResponse>;
}

export default function MaintenancePage() {
  const query = useQuery({ queryKey: ['maintenance-status'], queryFn: fetchStatus, refetchInterval: 60_000 });
  const window = query.data?.data.window;
  const message = window?.messages.fr ?? 'Takussan est temporairement en maintenance.';

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <section className="max-w-xl rounded-xl bg-white p-8 text-center ring-1 ring-border">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-primary">Maintenance</p>
        <h1 className="mt-3 font-display text-3xl font-bold text-foreground">Service temporairement indisponible</h1>
        <p className="mt-4 text-muted-foreground">{message}</p>
        {window ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Retour prévu le {new Date(window.ends_at).toLocaleString('fr-SN')}.
          </p>
        ) : null}
      </section>
    </main>
  );
}
