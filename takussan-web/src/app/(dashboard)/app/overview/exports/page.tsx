import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';

export const metadata: Metadata = { title: 'Exports' };
import { isAdmin, isAgent, isOwner } from '@/lib/roles';
import { redirect } from 'next/navigation';
import { ExportForm } from './ExportForm';

/**
 * TCK-032 P2 — download centre. Agency staff + owners see all entities; owners
 * are restricted to their scope on the backend.
 */
export default async function ExportsPage() {
  const user = await getMeAction();
  if (!isAdmin(user.roles) && !isAgent(user.roles) && !isOwner(user.roles)) {
    redirect('/app/overview');
  }

  const canExportCustomers = isAdmin(user.roles) || isAgent(user.roles);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Exports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Téléchargez vos données au format CSV, Excel ou PDF.
        </p>
      </div>
      <ExportForm canExportCustomers={canExportCustomers} />
    </div>
  );
}
