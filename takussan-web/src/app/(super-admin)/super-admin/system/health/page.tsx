'use client';

import { HealthDashboard } from '@/components/admin/super/system-health';

export default function SuperAdminHealthPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">Healthcheck</h1>
        <p className="mt-1 text-sm text-muted-foreground">Dépendances, queues et échecs jobs avec rafraîchissement automatique.</p>
      </header>
      <HealthDashboard />
    </div>
  );
}
