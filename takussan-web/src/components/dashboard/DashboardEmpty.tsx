import Link from 'next/link';
import { Compass, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { EmptyState } from '@/components/feedback';
import { buttonVariants } from '@/components/ui/button';
import { isAdmin, isSuperAdmin } from '@/lib/roles';
import type { UserRole } from '@/types/user';

type Props = {
  roles: UserRole[];
};

/**
 * L'accueil sans activité. Il passe par l'`EmptyState` partagé (design-guidelines, « un seul
 * composant les rend tous ») : la version locale rendait sa phrase en 12 px, sous le plancher de
 * 14 px du corps, et dans une carte qu'aucun autre état vide du produit ne dessine.
 */
export function DashboardEmpty({ roles }: Props) {
  const t = useTranslations('dashboard.empty');
  const isAdminLike = isAdmin(roles) || isSuperAdmin(roles);
  const Icon = isAdminLike ? ShieldCheck : Compass;

  return (
    <EmptyState
      icon={<Icon className="size-8" aria-hidden />}
      title={isAdminLike ? t('adminTitle') : t('userTitle')}
      description={<span className="text-pretty">{isAdminLike ? t('adminBody') : t('userBody')}</span>}
      action={
        <Link
          href={isAdminLike ? '/admin' : '/properties'}
          className={buttonVariants({ variant: 'outline' })}
        >
          {isAdminLike ? t('adminCta') : t('userCta')}
        </Link>
      }
    />
  );
}
