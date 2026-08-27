import { redirect } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';
import { ErrorState } from '@/components/feedback';
import { fetchSettingsAction } from '@/app/actions/admin-settings';
import { isSuperAdmin } from '@/lib/roles';
import { SettingsManager } from '@/components/admin-settings/SettingsManager';
import { SettingsTabs } from '@/components/admin-settings/SettingsTabs';
import { PageHeader } from '@/components/console';
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
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={<SettingsTabs active="general" canSeeGeneral />}
      />

      {!result.ok ? (
        /* Pas d'`onRetry` : server component, aucun gestionnaire d'événement possible ici. */
        <ErrorState message={t('loadError', { message: result.message })} />
      ) : (
        <SettingsManager
          initialSettings={settings}
          canManageGlobal={isSuperAdmin(user.roles)}
        />
      )}
    </div>
  );
}
