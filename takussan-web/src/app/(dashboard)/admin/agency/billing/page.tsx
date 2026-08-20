import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { AgencyBillingClient } from '@/components/billing/AgencyBillingClient';
import { AgencyPayoutsClient } from '@/components/billing/AgencyPayoutsClient';
import { isAdmin } from '@/lib/roles';
import { ensureStandardAgencyOrRedirect } from '@/lib/access/server-guards';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const t = await getTranslations('admin.pages.billing');
  const user = await getMeAction();
  if (!isAdmin(user.roles)) redirect('/admin');
  await ensureStandardAgencyOrRedirect(user);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>
      <AgencyBillingClient />
      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-foreground">{t('payoutsTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('payoutsBodyFull')}</p>
        <AgencyPayoutsClient />
      </section>
    </div>
  );
}
