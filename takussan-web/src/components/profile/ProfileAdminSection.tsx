import Link from 'next/link';
import type { User, UserRole } from '@/types/user';
import { getPrimaryRole } from '@/lib/roles';
import { buttonVariants } from '@/components/ui/button';

interface ProfileAdminSectionProps {
  user: User;
}

const ROLE_LABELS: Record<UserRole, string> = {
  customer: 'Locataire / Acheteur',
  agent: 'Agent immobilier',
  owner: 'Propriétaire bailleur',
  agency_admin: 'Admin agence',
  super_admin: 'Super administrateur',
  service_provider: 'Prestataire',
};

export function ProfileAdminSection({ user }: ProfileAdminSectionProps) {
  const primaryRole = getPrimaryRole(user.roles);

  return (
    <section className="space-y-4 rounded-2xl bg-[#eae1da] p-6">
      <div>
        <h2 className="text-lg font-bold text-[#1f1b17]">Administration</h2>
        <p className="text-sm text-[#43474e]">Outils de gestion réservés aux administrateurs.</p>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-semibold text-[#43474e]">Rôle admin</p>
        <p className="text-sm font-semibold text-[#1f1b17]">
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
