import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { User, UserRole } from '@/types/user';
import { getPrimaryRole } from '@/lib/roles';
import { buttonVariants } from '@/components/ui/button';
import { entreeAdmin, liensDuProfil } from '@/lib/access/pages-admin';
import { accesAdmin } from '@/lib/access/pages-admin-server';

interface ProfileAdminSectionProps {
  user: User;
}

/** La donnée porte la CLÉ de `profile.roles.*` ; le libellé est résolu au rendu. */
const ROLE_KEYS: Record<UserRole, string> = {
  customer: 'customer',
  tenant: 'tenant',
  agent: 'agent',
  owner: 'owner',
  agency_admin: 'agency_admin',
  super_admin: 'super_admin',
  service_provider: 'service_provider',
};

/**
 * TCK-633 (lot B, AC1) — la carte ne propose QUE des pages que le profil peut ouvrir (`PAGES_ADMIN`),
 * et rien du tout s'il n'y en a aucune. Chez un admin d'agence `individual`, elle parle de « son
 * espace » et de son rôle de titulaire : « Admin agence » ne veut rien dire pour un particulier qui
 * publie ses propres biens.
 */
export async function ProfileAdminSection({ user }: ProfileAdminSectionProps) {
  const acces = await accesAdmin(user);
  const entree = entreeAdmin(acces);
  if (entree === null) return null;

  const t = await getTranslations('profile.admin');
  const tRoles = await getTranslations('profile.roles');
  const tNav = await getTranslations('nav.admin');
  const primaryRole = getPrimaryRole(user.roles);
  const solo = acces.espaceIndividuel;
  // Le lien principal mène déjà à la première page : on ne le répète pas en lien secondaire.
  const liens = liensDuProfil(acces).filter((lien) => lien.chemin !== entree.href);

  return (
    <section className="space-y-4 rounded-2xl bg-border p-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">{solo ? t('titleIndividual') : t('title')}</h2>
        <p className="text-sm text-muted-foreground">{solo ? t('subtitleIndividual') : t('subtitle')}</p>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-semibold text-muted-foreground">
          {solo ? t('roleLabelIndividual') : t('roleLabel')}
        </p>
        <p className="text-sm font-semibold text-foreground">
          {solo ? t('roleIndividual') : primaryRole ? tRoles(ROLE_KEYS[primaryRole]) : '—'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {liens.map((lien) => (
          <Link
            key={lien.chemin}
            href={lien.chemin}
            className={buttonVariants({ variant: 'outline', className: 'rounded-md' })}
          >
            {t(lien.cle)}
          </Link>
        ))}
        <Link href={entree.href} className={buttonVariants({ className: 'rounded-md' })}>
          {solo ? tNav('openMySpace') : t('adminSpace')}
        </Link>
      </div>
    </section>
  );
}
