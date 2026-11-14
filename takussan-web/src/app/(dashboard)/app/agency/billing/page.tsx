import { getMeAction } from '@/app/actions/auth';
import { garderPageAdmin } from '@/lib/access/pages-admin-server';
import { AgencyBillingClient } from '@/components/billing/AgencyBillingClient';
import { AgencyPayoutsClient } from '@/components/billing/AgencyPayoutsClient';
import { BlocDeLOffre } from '@/components/billing/BlocDeLOffre';
import { fetchAbonnement, fetchQuotaDeLAgence, type QuotaDeLAgence } from '@/lib/queries/offre';
import type { AgencySubscription } from '@/types/super-admin';
import { PageHeader } from '@/components/console';
import { isSuperAdmin } from '@/lib/roles';
import { resolveAgencyOrNull } from '@/lib/access/server-guards';
import { getToken } from '@/lib/session';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.pages.billing');
  return { title: t('title') };
}

export const dynamic = 'force-dynamic';

/**
 * TCK-594 (AC18, ADR-0039 §7) — l'hôte individuel lit ce que la plateforme lui reverse : la page
 * n'est plus une route pro (retirée de `PRO_ROUTES`), et seul le bloc d'abonnement reste réservé
 * aux agences `standard`. L'API garde la lecture des reversements par `agency.update_billing`.
 */
export default async function Page() {
  // TCK-633 — `agency.update_billing` exigée, comme l'API (`AgencyPolicy::viewPlatformPayouts`).
  await garderPageAdmin('/app/agency/billing');
  const t = await getTranslations('admin.pages.billing');
  const user = await getMeAction();

  let showSubscription = isSuperAdmin(user.roles);
  // TCK-2671 (AC3, AC5) — l'agence professionnelle lit en tête ce qu'elle paie et ce qu'elle
  // consomme : le prix de l'API, les jauges de `GET /api/me/quota`.
  let offre: { abonnement: AgencySubscription; quota: QuotaDeLAgence | null } | null = null;
  if (typeof user.agency_id === 'number') {
    const token = await getToken();
    const agency = token ? await resolveAgencyOrNull(token, user.agency_id, 'app/agency/billing (abonnement)') : null;
    if (agency?.kind === 'standard' && token) {
      showSubscription = true;
      const [abonnement, quota] = await Promise.all([fetchAbonnement(token).catch(() => null), fetchQuotaDeLAgence(token).catch(() => null)]);
      offre = abonnement ? { abonnement, quota } : null;
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      {offre ? <BlocDeLOffre abonnement={offre.abonnement} quota={offre.quota} /> : null}
      {showSubscription ? <AgencyBillingClient /> : null}
      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-foreground">{t('payoutsTitle')}</h2>
        <p className="text-sm text-muted-foreground">{t('payoutsBodyFull')}</p>
        <AgencyPayoutsClient />
      </section>
    </div>
  );
}
