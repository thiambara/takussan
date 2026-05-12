import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { AgencyBillingClient } from '@/components/billing/AgencyBillingClient';
import { AgencyPayoutsClient } from '@/components/billing/AgencyPayoutsClient';
import { isAdmin } from '@/lib/roles';
import { ensureStandardAgencyOrRedirect } from '@/lib/access/server-guards';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const user = await getMeAction();
  if (!isAdmin(user.roles)) redirect('/admin');
  await ensureStandardAgencyOrRedirect(user);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">Abonnement</h1>
        <p className="mt-1 text-sm text-muted-foreground">Plan courant, commission plateforme et limites opérationnelles.</p>
      </header>
      <AgencyBillingClient />
      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-foreground">Reversements plateforme</h2>
        <p className="text-sm text-muted-foreground">
          Suivi des virements émis par la plateforme après retenue de la commission.
        </p>
        <AgencyPayoutsClient />
      </section>
    </div>
  );
}
