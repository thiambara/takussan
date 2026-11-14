'use client';

import { useAuth } from '@/context/AuthContext';
import { AccountDeletionSection } from './AccountDeletionSection';

/**
 * TCK-2635 — la suppression du compte, sur sa page du profil. Elle lit le compte au CONTEXTE, comme
 * quand elle vivait dans la section « Sécurité » : la double authentification activée ou coupée à la
 * page voisine (TCK-2160, `refreshUser()`) y est vue sans recharger, la navigation douce ne remontant
 * pas le contexte.
 */
export function SuppressionDuCompte() {
  const { user } = useAuth();
  return (
    <AccountDeletionSection
      twoFactorEnabled={Boolean(user?.two_factor_enabled)}
      // TCK-272 — défaut `true` : tant que `user` n'est pas chargé on
      // montre le parcours mot de passe, jamais la voie de secours.
      hasUsablePassword={user?.has_usable_password ?? true}
    />
  );
}
