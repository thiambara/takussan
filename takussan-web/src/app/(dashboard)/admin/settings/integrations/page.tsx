import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';
import { fetchIntegrationsAction } from '@/app/actions/admin-settings';
import { isAdmin } from '@/lib/roles';
import { IntegrationsManager } from '@/components/admin-settings/IntegrationsManager';

/**
 * Admin — integrations page (TCK-068). Cards per provider with configure /
 * test / toggle actions.
 */

export const dynamic = 'force-dynamic';

export default async function Page() {
  const user = await getMeAction();
  if (!isAdmin(user.roles)) {
    redirect('/admin');
  }

  const result = await fetchIntegrationsAction();
  const integrations = result.ok && result.data ? result.data.data : [];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-app-ink">Intégrations</h1>
          <p className="mt-1 text-sm text-app-ink-muted">
            Providers externes (paiement, SMS, e-mail) et leurs clés d&apos;API.
          </p>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Sections des paramètres">
          <Link
            href="/admin/settings"
            className="rounded-full border border-input px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            Général
          </Link>
          <Link
            href="/admin/settings/tags"
            className="rounded-full border border-input px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            Tags &amp; amenités
          </Link>
          <Link
            href="/admin/settings/integrations"
            className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            Intégrations
          </Link>
        </nav>
      </header>

      {!result.ok ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
          Impossible de charger les intégrations : {result.message}
        </div>
      ) : (
        <IntegrationsManager initialIntegrations={integrations} />
      )}
    </div>
  );
}
