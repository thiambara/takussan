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
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-app-surface-1 p-12 text-center">
      {isAdminLike ? (
        <ShieldCheck className="size-10 text-app-accent" />
      ) : (
        <Compass className="size-10 text-app-accent" />
      )}
      <p className="text-sm font-semibold text-app-ink">
        {isAdminLike ? t('adminTitle') : t('userTitle')}
      </p>
      <p className="text-xs text-app-ink-muted">
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
