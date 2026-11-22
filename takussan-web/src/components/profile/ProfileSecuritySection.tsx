'use client';

import { useTranslations } from 'next-intl';
import { Check, Mail } from 'lucide-react';
import { StatusBadge } from '@/components/console/StatusBadge';
import { useAuth } from '@/context/AuthContext';
import { ListeDeSecurite, RangeeDeSecurite } from './security/RangeeDeSecurite';
import { TwoFactorSection } from './security/TwoFactorSection';
import { PhoneVerificationSection } from './security/PhoneVerificationSection';
import { ActiveSessionsSection } from './security/ActiveSessionsSection';

/**
 * TCK-069 — Sécurité du profil :
 *  - Email vérifié (lecture seule)
 *  - Authentification à deux facteurs (TOTP + recovery codes)
 *  - Vérification du téléphone par OTP SMS
 *  - Sessions actives (liste + révocation)
 *
 * TCK-080 — Suppression de compte (RGPD) avec délai de grâce.
 */
export function ProfileSecuritySection() {
  const t = useTranslations('profile.security');
  const { user } = useAuth();
  const emailVerified = Boolean(user?.email_verified_at);
  // TCK-632 — un compte ouvert par téléphone n'a pas d'adresse : « consultez votre boîte » y
  // renvoyait vers une boîte qui n'existe pas. L'ajout se fait dans les coordonnées, plus haut.
  const sansAdresse = !user?.email;

  // TCK-2635 — maquette `SectionSecurite` : à nu sous le titre « Sécurité », une carte de trois rangées
  // (double authentification, téléphone, courriel), puis « Appareils connectés ».
  return (
    <section aria-label={t('title')} className="grid gap-5">
      <ListeDeSecurite>
        <TwoFactorSection enabled={Boolean(user?.two_factor_enabled)} />
        <PhoneVerificationSection phone={user?.phone ?? null} phoneVerified={Boolean(user?.phone_verified_at)} />
        <RangeeDeSecurite
          icone={sansAdresse || !emailVerified ? Mail : Check}
          titre={t('emailTitle')}
          statut={
            sansAdresse ? undefined : (
              <StatusBadge tone={emailVerified ? 'success' : 'attention'} label={emailVerified ? t('verified') : t('notVerified')} />
            )
          }
          detail={sansAdresse ? t('emailAbsent') : emailVerified ? user?.email : t('emailNotVerified')}
        />
      </ListeDeSecurite>

      <ActiveSessionsSection />
      {/* TCK-2635 — la suppression du compte a sa page (`/app/profile/delete-account`,
          `SuppressionDuCompte`), en dernier du sommaire, jamais au milieu de la sécurité. */}
    </section>
  );
}
