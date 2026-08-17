import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';
import { fetchSettingsAction } from '@/app/actions/admin-settings';
import { isSuperAdmin } from '@/lib/roles';
import { SettingsManager } from '@/components/admin-settings/SettingsManager';
import { getTranslations } from 'next-intl/server';

/**
 * Admin — global settings (TCK-068).
 *
 * Top-level page surfaces the key-value settings table and links to the
 * sibling integrations page. Access is restricted to admins; only
 * `super_admin` can edit `scope=global` settings.
 */

export const dynamic = 'force-dynamic';

export default async function Page() {
  const t = await getTranslations('admin.pages.settings');
  const tSettings = await getTranslations('admin.pages.settings');
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
          <h1 className="font-display text-2xl font-bold text-foreground">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label={t('navAria')}>
          <Link
            href="/admin/settings"
            className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            {tSettings('tabGeneral')}
          </Link>
          <Link
            href="/admin/settings/integrations"
            className="rounded-full border border-input px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            {tSettings('tabIntegrations')}
          </Link>
        </nav>
      </header>

      {!result.ok ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
          {t('loadError', { message: result.message })}
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
