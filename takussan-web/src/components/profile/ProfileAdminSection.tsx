import Link from 'next/link';
import type { User, UserRole } from '@/types/user';
import { getPrimaryRole } from '@/lib/roles';
import { buttonVariants } from '@/components/ui/button';

interface ProfileAdminSectionProps {
  user: User;
}

const ROLE_LABELS: Record<UserRole, string> = {
  customer: 'Locataire / Acheteur',
  tenant: 'Locataire',
  agent: 'Agent immobilier',
  owner: 'Propriétaire bailleur',
  agency_admin: 'Admin agence',
  super_admin: 'Super administrateur',
  service_provider: 'Prestataire',
};

export function ProfileAdminSection({ user }: ProfileAdminSectionProps) {
  const primaryRole = getPrimaryRole(user.roles);

  return (
    <section className="space-y-4 rounded-2xl bg-app-surface-3 p-6">
      <div>
        <h2 className="text-lg font-bold text-app-ink">Administration</h2>
        <p className="text-sm text-app-ink-muted">Outils de gestion réservés aux administrateurs.</p>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-semibold text-app-ink-muted">Rôle admin</p>
        <p className="text-sm font-semibold text-app-ink">
          {primaryRole ? ROLE_LABELS[primaryRole] : '—'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/agency"
          className={buttonVariants({ variant: 'outline', className: 'rounded-md' })}
        >
          Gérer l&apos;agence
        </Link>
        <Link
          href="/admin/audit"
          className={buttonVariants({ variant: 'outline', className: 'rounded-md' })}
        >
          Journal d&apos;audit
        </Link>
        <Link href="/admin" className={buttonVariants({ className: 'rounded-md' })}>
          Espace administration
        </Link>
      </div>
    </section>
  );
}
