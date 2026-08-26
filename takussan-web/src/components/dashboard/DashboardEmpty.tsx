import Link from 'next/link';
import { Compass, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { buttonVariants } from '@/components/ui/button';
import { isAdmin, isSuperAdmin } from '@/lib/roles';
import type { UserRole } from '@/types/user';

type Props = {
  roles: UserRole[];
};

export function DashboardEmpty({ roles }: Props) {
  const t = useTranslations('dashboard.empty');
  const isAdminLike = isAdmin(roles) || isSuperAdmin(roles);

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-card p-12 text-center">
      {isAdminLike ? (
        <ShieldCheck className="size-10 text-primary" />
      ) : (
        <Compass className="size-10 text-primary" />
      )}
      <p className="text-sm font-semibold text-foreground">
        {isAdminLike ? t('adminTitle') : t('userTitle')}
      </p>
      <p className="text-xs text-muted-foreground">
        {isAdminLike ? t('adminBody') : t('userBody')}
      </p>
      <Link
        href={isAdminLike ? '/admin' : '/properties'}
        className={buttonVariants({ variant: 'outline' })}
      >
        {isAdminLike ? t('adminCta') : t('userCta')}
      </Link>
    </div>
  );
}
