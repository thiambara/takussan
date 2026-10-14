import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { SlidersHorizontal } from 'lucide-react';

import { getMeOperateurAction } from '@/app/actions/auth';
import { fetchSettingsAction } from '@/app/actions/admin-settings';
import { SettingsManager } from '@/components/admin-settings/SettingsManager';
import { PageHeader } from '@/components/console';
import { ErrorState } from '@/components/feedback';
import { buttonVariants } from '@/components/ui/button';
import { isSuperAdmin } from '@/lib/roles';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('superAdmin.pages.globalSettings');
  return { title: t('title') };
}

export const dynamic = 'force-dynamic';

/**
 * TCK-648 (ADR-0064 §1) — l'éditeur brut de la table clé-valeur `settings`, qui vivait dans la
 * console d'agence (TCK-068) : une page de la plateforme n'a rien à faire dans l'espace d'une agence.
 *
 * ⚠ VOISIN des « Paramètres plateforme » (`/super-admin/settings`), pas leur doublon. Les deux lisent
 * la MÊME table, par deux API : `/api/admin/settings` en est la vue catalogue (clés typées, validées,
 * journalisées — `EditablePlatformSettings`), `/api/settings` la vue brute, portées `global` et
 * `agency` comprises. La route brute refuse d'écrire une clé du catalogue (`managedByCatalogue`) :
 * d'où le lien d'en-tête vers la page qui, elle, sait les régler.
 *
 * ⚠ La garde `super_admin` est ICI, pas seulement au layout. Depuis TCK-600, le layout de la console
 * ouvre à tout opérateur (`viewer`, `support`) ; `SettingController` ne sert la table entière qu'à
 * `isSuperAdmin()`, dont `roles` porte la même définition (`HasProfiles::profileTypes`). Sans cette
 * garde, un `viewer` tombait sur une carte d'erreur 403 au lieu de ne pas voir la page — l'entrée de
 * menu, elle, lui est déjà cachée (`navigationPour`).
 */
export default async function Page() {
  // La console juge l'OPÉRATEUR, jamais la cible d'une impersonation (TCK-600, ADR-0055 §6).
  const user = await getMeOperateurAction();
  if (!isSuperAdmin(user.roles)) {
    redirect('/super-admin');
  }

  const t = await getTranslations('superAdmin.pages.globalSettings');
  const result = await fetchSettingsAction({ perPage: 100 });
  const settings = result.ok && result.data ? result.data.data : [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('subtitle')}
        actions={
          <Link href="/super-admin/settings" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            {t('platformLink')}
          </Link>
        }
      />

      {!result.ok ? (
        /* Pas d'`onRetry` : server component, aucun gestionnaire d'événement possible ici. */
        <ErrorState message={t('loadError', { message: result.message })} />
      ) : (
        <SettingsManager initialSettings={settings} canManageGlobal />
      )}
    </div>
  );
}
