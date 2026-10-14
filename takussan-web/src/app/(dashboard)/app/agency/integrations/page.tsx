import { garderPageAdmin } from '@/lib/access/pages-admin-server';
import {
  fetchIntegrationWebhookEndpointAction,
  fetchIntegrationsAction,
  fetchPaymentProviderSchemasAction,
} from '@/app/actions/admin-settings';
import { hasWebhookEndpoint } from '@/lib/schemas/setting';
import { IntegrationsManager } from '@/components/admin-settings/IntegrationsManager';
import { PageHeader } from '@/components/console';
import { ErrorState } from '@/components/feedback';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.pages.integrations');
  return { title: t('title') };
}

/**
 * Admin — integrations page (TCK-068). Cards per provider with configure /
 * test / toggle actions.
 *
 * TCK-370 — la garde reste `isAdmin`, comme l'API : `routes/api/integrations.php` ne pose
 * qu'`auth:sanctum` et `IntegrationController` laisse entrer un `agency_admin` sur SON agence.
 *
 * TCK-649 (ADR-0064 §1) — la page vit sous `/app/agency/integrations` et n'a plus de barre
 * d'onglets : TCK-648 en avait retiré « Général », et un onglet seul n'est pas une navigation.
 *
 * TCK-293 — l'adresse de notification de chaque intégration de paiement est lue ici, en parallèle :
 * la carte l'affiche sans aller-retour. Une lecture en échec n'empêche rien, la carte la relit.
 */

export const dynamic = 'force-dynamic';

export default async function Page() {
  await garderPageAdmin('/app/agency/integrations');
  const t = await getTranslations('admin.pages.integrations');

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
      <PageHeader title={t('title')} description={t('subtitle')} />

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
