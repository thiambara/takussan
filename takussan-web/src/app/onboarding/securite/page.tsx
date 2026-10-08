import { redirect } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';
import { EnrolementDoubleFacteurExige } from '@/components/auth/EnrolementDoubleFacteurExige';
import { ENROLEMENT_DOUBLE_FACTEUR, configurationDoubleFacteurExigee } from '@/lib/double-facteur';
import { isSuperAdmin } from '@/lib/roles';
import { getToken } from '@/lib/session';

/**
 * TCK-589 — l'enrôlement exigé avant toute console : second facteur réinitialisé par le support
 * (`force_2fa_reconfigure`), ou super-admin qui n'en a pas.
 *
 * La page ne décide rien seule : `configurationDoubleFacteurExigee` est le juge des layouts qui
 * envoient ici. Un compte qui n'a rien à configurer repart vers son espace.
 */
export const dynamic = 'force-dynamic';

export default async function EnrolementDoubleFacteurPage() {
  const token = await getToken();
  if (!token) {
    redirect(`/auth/login?redirect=${encodeURIComponent(ENROLEMENT_DOUBLE_FACTEUR)}`);
  }

  const user = await getMeAction();
  const superAdmin = isSuperAdmin(user.roles);
  const configuration = configurationDoubleFacteurExigee(user);
  if (configuration !== ENROLEMENT_DOUBLE_FACTEUR) {
    redirect(configuration ?? (superAdmin ? '/super-admin' : '/app'));
  }

  return (
    <EnrolementDoubleFacteurExige
      motif={user.force_2fa_reconfigure ? 'reconfigure' : 'superAdmin'}
      destination={superAdmin ? '/super-admin' : '/app'}
    />
  );
}
