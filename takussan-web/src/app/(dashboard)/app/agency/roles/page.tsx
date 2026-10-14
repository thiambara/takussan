import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Building2 } from 'lucide-react';

import { getMeAction } from '@/app/actions/auth';
import { garderPageAdmin } from '@/lib/access/pages-admin-server';
import { AgencyRolesConsole } from '@/components/admin/roles/AgencyRolesConsole';
import { RoleDelegationsSection } from '@/components/admin/roles/RoleDelegationsSection';
import { EmptyState } from '@/components/feedback';
import { PageHeader } from '@/components/console';
import { buttonVariants } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.roles.page');
  return { title: t('title') };
}

/**
 * TCK-279 (AC11) — console des rôles d'agence.
 *
 * Une garde de NAVIGATION — « cet écran est-il pour toi ? » : `garderPageAdmin('/app/agency/roles')`
 * (TCK-633) juge le rôle admin ET la typologie `standard` que la fiche du ticket exige, depuis la
 * ligne de `PAGES_ADMIN` ; `scripts/check-pro-routes.mjs` refuse toute page `/app/agency/*` qui ne
 * l'appelle pas. Les gestes de l'écran, eux, sont gardés par capacité côté client, et par les
 * policies côté serveur.
 *
 * L'écran ne rend rien lui-même : la matrice, la liste et l'éditeur sont
 * client (TanStack Query + mutations), la page ne fait que résoudre le
 * contexte d'agence.
 */
export default async function AdminRolesPage() {
  await garderPageAdmin('/app/agency/roles');
  const user = await getMeAction();

  const t = await getTranslations('admin.roles');

  if (!user.agency_id) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('page.title')} description={t('page.subtitle')} />
        <EmptyState
          icon={<Building2 className="size-8" aria-hidden="true" />}
          title={t('page.no_agency_title')}
          description={t('page.no_agency_description')}
          action={
            <Link href="/app/agency" className={buttonVariants()}>
              {t('page.no_agency_cta')}
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('page.title')} description={t('page.subtitle')} />
      <AgencyRolesConsole agencyId={user.agency_id} />
      {/*
        TCK-369 — la délégation temporaire vit SOUS la console des rôles, et
        n'ouvre PAS de route propre. C'est délibéré, et ça a une conséquence
        sur les gardes : `PAGES_ADMIN` et `check-pro-routes.mjs` raisonnent par
        `href`, et `/app/agency/roles` y est déjà déclaré, déjà gardé en SSR par
        `garderPageAdmin` ci-dessus. Une section n'a rien à y
        ajouter — une page `/app/agency/roles/delegations`, si, et c'est
        précisément le coût qu'on évite.

        Le foyer n'est pas un choix de rangement : une délégation est une
        dérogation dans le temps à ce que la console définit. On lit d'abord
        ce qu'un rôle permet, ensuite qui l'emprunte et jusqu'à quand.
      */}
      <Separator />
      <RoleDelegationsSection agencyId={user.agency_id} />
    </div>
  );
}
