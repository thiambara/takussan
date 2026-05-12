import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';
import { fetchSettingsAction } from '@/app/actions/admin-settings';
import { isSuperAdmin } from '@/lib/roles';
import { SettingsManager } from '@/components/admin-settings/SettingsManager';

/**
 * Admin — global settings (TCK-068).
 *
 * Top-level page surfaces the key-value settings table and links to the
 * sibling integrations page. Access is restricted to admins; only
 * `super_admin` can edit `scope=global` settings.
 */

export const dynamic = 'force-dynamic';

export default async function Page() {
  const user = await getMeAction();
  // `/api/admin/settings` is gated by the `super-admin` route middleware
  // (`routes/api/admin.php`), so only super-admins can load the page. Any
  // other admin (agency_admin) is bounced rather than shown a broken card.
  if (!isSuperAdmin(user.roles)) {
    redirect('/admin');
  }

  const result = await fetchSettingsAction({ perPage: 100 });
  const settings = result.ok && result.data ? result.data.data : [];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Paramètres</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Paramètres globaux clé/valeur, feature flags et options de plateforme.
          </p>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Sections des paramètres">
          <Link
            href="/admin/settings"
            className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            Général
          </Link>
          <Link
            href="/admin/settings/integrations"
            className="rounded-full border border-input px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            Intégrations
          </Link>
        </nav>
      </header>

      {!result.ok ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
          Impossible de charger les paramètres : {result.message}
        </div>
      ) : (
        <SettingsManager
          initialSettings={settings}
          canManageGlobal={isSuperAdmin(user.roles)}
        />
      )}
    </div>
  );
}
