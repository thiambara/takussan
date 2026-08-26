import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { AgencyBillingClient } from '@/components/billing/AgencyBillingClient';
import { AgencyPayoutsClient } from '@/components/billing/AgencyPayoutsClient';
import { PageHeader } from '@/components/console';
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
      <PageHeader title={t('title')} description={t('subtitle')} />
      <AgencyBillingClient />
      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-foreground">{t('payoutsTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('payoutsBodyFull')}</p>
        <AgencyPayoutsClient />
      </section>
    </div>
  );
}
