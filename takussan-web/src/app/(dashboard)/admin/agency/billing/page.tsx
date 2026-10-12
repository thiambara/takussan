import { getMeAction } from '@/app/actions/auth';
import { garderPageAdmin } from '@/lib/access/pages-admin-server';
import { AgencyBillingClient } from '@/components/billing/AgencyBillingClient';
import { AgencyPayoutsClient } from '@/components/billing/AgencyPayoutsClient';
import { PageHeader } from '@/components/console';
import { isSuperAdmin } from '@/lib/roles';
import { resolveAgencyOrNull } from '@/lib/access/server-guards';
import { getToken } from '@/lib/session';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

/**
 * TCK-594 (AC18, ADR-0039 §7) — l'hôte individuel lit ce que la plateforme lui reverse : la page
 * n'est plus une route pro (retirée de `PRO_ROUTES`), et seul le bloc d'abonnement reste réservé
 * aux agences `standard`. L'API garde la lecture des reversements par `agency.update_billing`.
 */
export default async function Page() {
  // TCK-633 — `agency.update_billing` exigée, comme l'API (`AgencyPolicy::viewPlatformPayouts`).
  await garderPageAdmin('/admin/agency/billing');
  const t = await getTranslations('admin.pages.billing');
  const user = await getMeAction();

  let showSubscription = isSuperAdmin(user.roles);
  if (!showSubscription && typeof user.agency_id === 'number') {
    const token = await getToken();
    const agency = token
      ? await resolveAgencyOrNull(token, user.agency_id, 'admin/agency/billing (abonnement)')
      : null;
    showSubscription = agency?.kind === 'standard';
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      {showSubscription ? <AgencyBillingClient /> : null}
      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-foreground">{t('payoutsTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('payoutsBodyFull')}</p>
        <AgencyPayoutsClient />
      </section>
    </div>
  );
}
