import { redirect } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';
import { fetchIntegrationsAction } from '@/app/actions/admin-settings';
import { isAdmin, isSuperAdmin } from '@/lib/roles';
import { IntegrationsManager } from '@/components/admin-settings/IntegrationsManager';
import { SettingsTabs } from '@/components/admin-settings/SettingsTabs';
import { PageHeader } from '@/components/console';
import { ErrorState } from '@/components/feedback';
import { getTranslations } from 'next-intl/server';

/**
 * Admin — integrations page (TCK-068). Cards per provider with configure /
 * test / toggle actions.
 *
 * TCK-370 — la garde reste `isAdmin`, comme l'API : `routes/api/integrations.php` ne pose
 * qu'`auth:sanctum` et `IntegrationController` laisse entrer un `agency_admin` sur SON agence.
 * Ce qui change, c'est que l'onglet « Général » n'est plus proposé à qui `/admin/settings`
 * rejetterait.
 */

export const dynamic = 'force-dynamic';

export default async function Page() {
  const t = await getTranslations('admin.pages.integrations');
  const user = await getMeAction();
  if (!isAdmin(user.roles)) {
    redirect('/admin');
  }

  const result = await fetchIntegrationsAction();
  const integrations = result.ok && result.data ? result.data.data : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={<SettingsTabs active="integrations" canSeeGeneral={isSuperAdmin(user.roles)} />}
      />

      {!result.ok ? (
        /* Pas d'`onRetry` : server component, aucun gestionnaire d'événement possible ici. */
        <ErrorState message={t('loadError', { message: result.message })} />
      ) : (
        <IntegrationsManager initialIntegrations={integrations} />
      )}
    </div>
  );
}
