import { getMeAction } from '@/app/actions/auth';
import { isAdmin } from '@/lib/roles';
import { redirect } from 'next/navigation';
import { fetchThresholdAlerts } from '@/lib/queries/alerts';
import { AlertList } from './AlertList';
import { getTranslations } from 'next-intl/server';

/**
 * TCK-032 P3 — threshold alerts admin page.
 *
 * TCK-284 — **pas de restriction `kind`**, pour la même raison que
 * `overview/kpis/page.tsx` : les alertes de seuil ne figurent dans aucune des
 * deux listes de restrictions des agences `individual` (`docs/features.md`
 * §1.12, `docs/models-spec.md`), et `ThresholdAlertController` ne les a
 * jamais restreintes côté API.
 */
export default async function AlertsPage() {
  const t = await getTranslations('dashboard.pages.alerts');
  const user = await getMeAction();
  if (!isAdmin(user.roles)) redirect('/app/overview');

  const alerts = await fetchThresholdAlerts();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitleFull')}</p>
      </div>
      <AlertList initialAlerts={alerts?.data ?? []} />
    </div>
  );
}
