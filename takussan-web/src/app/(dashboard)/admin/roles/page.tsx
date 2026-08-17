import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Building2 } from 'lucide-react';

import { getMeAction } from '@/app/actions/auth';
import { isAdmin } from '@/lib/roles';
import { AgencyRolesConsole } from '@/components/admin/roles/AgencyRolesConsole';
import { EmptyState } from '@/components/feedback';
import { PageHeader } from '@/components/layout/PageHeader';
import { buttonVariants } from '@/components/ui/button';
import { ensureStandardAgencyOrRedirect } from '@/lib/access/server-guards';

/**
 * TCK-279 (AC11) — console des rôles d'agence.
 *
 * Deux gardes, et elles ne disent pas la même chose :
 *
 *  · `isAdmin` est une garde de NAVIGATION — « cet écran est-il pour toi ? ».
 *    Elle porte sur l'appartenance, pas sur un verbe, et reste donc en
 *    `isAdmin` (cf. le docblock de `useCan`). Les gestes de l'écran, eux,
 *    sont gardés par capacité côté client, et par les policies côté serveur.
 *  · `ensureStandardAgencyOrRedirect` applique la typologie `standard` que
 *    la fiche du ticket exige. Cette route est déclarée dans `PRO_ROUTES`,
 *    et `scripts/check-pro-routes.mjs` refuse toute entrée non gardée en
 *    SSR — c'est ce helper qui satisfait la garde.
 *
 * L'écran ne rend rien lui-même : la matrice, la liste et l'éditeur sont
 * client (TanStack Query + mutations), la page ne fait que résoudre le
 * contexte d'agence.
 */
export default async function AdminRolesPage() {
  const user = await getMeAction();
  if (!isAdmin(user.roles)) redirect('/admin');
  await ensureStandardAgencyOrRedirect(user);

  const t = await getTranslations('admin.roles');

  if (!user.agency_id) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('page.title')} subtitle={t('page.subtitle')} />
        <EmptyState
          icon={<Building2 className="size-8" aria-hidden="true" />}
          title={t('page.no_agency_title')}
          description={t('page.no_agency_description')}
          action={
            <Link href="/admin/agency" className={buttonVariants()}>
              {t('page.no_agency_cta')}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('page.title')} subtitle={t('page.subtitle')} />
      <AgencyRolesConsole agencyId={user.agency_id} />
    </div>
  );
}
