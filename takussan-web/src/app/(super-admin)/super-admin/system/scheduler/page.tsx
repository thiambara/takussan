'use client';

import { ScheduledTaskTable } from '@/components/admin/super/scheduler';

export default function SuperAdminSchedulerPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">Scheduler</h1>
        <p className="mt-1 text-sm text-muted-foreground">Tâches planifiées et dernières exécutions connues.</p>
      </header>
      <ScheduledTaskTable />
    </div>
  );
}
