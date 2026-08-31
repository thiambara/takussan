import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { User, UserRole } from '@/types/user';
import { getPrimaryRole } from '@/lib/roles';
import { buttonVariants } from '@/components/ui/button';

interface ProfileAdminSectionProps {
  user: User;
}

/** La donnée porte la CLÉ de `profile.roles.*` ; le libellé est résolu au rendu. */
const ROLE_KEYS: Record<UserRole, string> = {
  customer: 'customer',
  tenant: 'tenant',
  agent: 'agent',
  owner: 'owner',
  broker: 'broker',
  agency_admin: 'agency_admin',
  super_admin: 'super_admin',
  service_provider: 'service_provider',
};

export async function ProfileAdminSection({ user }: ProfileAdminSectionProps) {
  const t = await getTranslations('profile.admin');
  const tRoles = await getTranslations('profile.roles');
  const primaryRole = getPrimaryRole(user.roles);

  return (
    <section className="space-y-4 rounded-2xl bg-border p-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-semibold text-muted-foreground">{t('roleLabel')}</p>
        <p className="text-sm font-semibold text-foreground">
          {primaryRole ? tRoles(ROLE_KEYS[primaryRole]) : '—'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/agency"
          className={buttonVariants({ variant: 'outline', className: 'rounded-md' })}
        >
          {t('manageAgency')}
        </Link>
        <Link
          href="/admin/audit"
          className={buttonVariants({ variant: 'outline', className: 'rounded-md' })}
        >
          {t('auditLog')}
        </Link>
        <Link href="/admin" className={buttonVariants({ className: 'rounded-md' })}>
          {t('adminSpace')}
        </Link>
      </div>
    </section>
  );
}
