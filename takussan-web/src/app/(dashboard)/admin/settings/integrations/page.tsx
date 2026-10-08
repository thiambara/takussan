import { redirect } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';
import {
  fetchIntegrationWebhookEndpointAction,
  fetchIntegrationsAction,
  fetchPaymentProviderSchemasAction,
} from '@/app/actions/admin-settings';
import { hasWebhookEndpoint } from '@/lib/schemas/setting';
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
 *
 * TCK-293 — l'adresse de notification de chaque intégration de paiement est lue ici, en parallèle :
 * la carte l'affiche sans aller-retour. Une lecture en échec n'empêche rien, la carte la relit.
 */

export const dynamic = 'force-dynamic';

export default async function Page() {
  const t = await getTranslations('admin.pages.integrations');
  const user = await getMeAction();
  if (!isAdmin(user.roles)) {
    redirect('/admin');
  }

  const [result, schemas] = await Promise.all([fetchIntegrationsAction(), fetchPaymentProviderSchemasAction()]);
  // TCK-602 — sans les schémas, le formulaire retombe sur ses champs génériques ; l'API refuse en
  // 422, champ par champ, une intégration de paiement incomplète.
  const paymentProviders = schemas.ok && schemas.data ? schemas.data : [];
  const integrations = result.ok && result.data ? result.data.data : [];
  const webhookUrls = Object.fromEntries(
    (
      await Promise.all(
        integrations
          .filter((integration) => hasWebhookEndpoint(integration.provider))
          .map(async (integration) => {
            const endpoint = await fetchIntegrationWebhookEndpointAction(integration.id);
            return endpoint.ok && endpoint.data ? [[integration.id, endpoint.data.url] as const] : [];
          }),
      )
    ).flat(),
  );

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
        <IntegrationsManager
          initialIntegrations={integrations}
          initialWebhookUrls={webhookUrls}
          paymentProviders={paymentProviders}
        />
      )}
    </div>
  );
}
