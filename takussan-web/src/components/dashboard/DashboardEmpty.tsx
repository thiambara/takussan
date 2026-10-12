'use client';

import Link from 'next/link';
import { Compass, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { EmptyState } from '@/components/feedback';
import { buttonVariants } from '@/components/ui/button';
import { entreeAdmin } from '@/lib/access/pages-admin';
import { useAccesAdminOuRepli } from '@/lib/access/acces-admin-contexte';
import type { UserRole } from '@/types/user';

type Props = {
  roles: UserRole[];
};

/**
 * L'accueil sans activité. Il passe par l'`EmptyState` partagé (design-guidelines, « un seul
 * composant les rend tous ») : la version locale rendait sa phrase en 12 px, sous le plancher de
 * 14 px du corps, et dans une carte qu'aucun autre état vide du produit ne dessine.
 *
 * TCK-633 (lot B) — la variante « admin » ne se montre que s'il existe une page `/admin/*` que le
 * profil peut ouvrir, et mène à la première : « Ouvrir mon espace » chez un solo.
 */
export function DashboardEmpty({ roles }: Props) {
  const t = useTranslations('dashboard.empty');
  const tAdmin = useTranslations('nav.admin');
  const entree = entreeAdmin(useAccesAdminOuRepli({ roles }));
  const Icon = entree ? ShieldCheck : Compass;
  const cta = entree
    ? entree.cle === 'mySpace'
      ? tAdmin('openMySpace')
      : t('adminCta')
    : t('userCta');

  return (
    <EmptyState
      icon={<Icon className="size-8" aria-hidden />}
      title={entree ? t('adminTitle') : t('userTitle')}
      description={<span className="text-pretty">{entree ? t('adminBody') : t('userBody')}</span>}
      action={
        <Link href={entree ? entree.href : '/properties'} className={buttonVariants({ variant: 'outline' })}>
          {cta}
        </Link>
      }
    />
  );
}
