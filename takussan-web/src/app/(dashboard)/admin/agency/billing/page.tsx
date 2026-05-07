import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { AgencyBillingClient } from '@/components/billing/AgencyBillingClient';
import { isAdmin } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const user = await getMeAction();
  if (!isAdmin(user.roles)) redirect('/admin');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">Abonnement</h1>
        <p className="mt-1 text-sm text-muted-foreground">Plan courant, commission plateforme et limites opérationnelles.</p>
      </header>
      <AgencyBillingClient />
    </div>
  );
}
