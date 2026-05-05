import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';

export const metadata: Metadata = { title: 'Maintenance' };
import { MaintenanceList } from '@/components/maintenance';

export default async function Page() {
  await getMeAction();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-app-ink">Maintenance</h1>
        <p className="mt-1 text-sm text-app-ink-muted">
          Demandes et suivi d&apos;interventions
        </p>
      </div>
      <MaintenanceList />
    </div>
  );
}
