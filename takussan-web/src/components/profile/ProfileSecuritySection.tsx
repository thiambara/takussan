'use client';

import { useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { TwoFactorSection } from './security/TwoFactorSection';
import { PhoneVerificationSection } from './security/PhoneVerificationSection';
import { ActiveSessionsSection } from './security/ActiveSessionsSection';
import { AccountDeletionSection } from './security/AccountDeletionSection';

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

  return (
    <section className="space-y-4 rounded-2xl bg-card p-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('description')}
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-white p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">{t('emailTitle')}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {emailVerified ? t('emailVerified') : t('emailNotVerified')}
            </p>
          </div>
          <span
            className={
              'rounded-full px-2 py-1 text-xs font-semibold ' +
              (emailVerified
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-card text-primary')
            }
          >
            {emailVerified ? t('verified') : t('notVerified')}
          </span>
        </div>
      </div>

      <TwoFactorSection enabled={Boolean(user?.two_factor_enabled)} />

      <PhoneVerificationSection
        phone={user?.phone ?? null}
        phoneVerified={Boolean(user?.phone_verified_at)}
      />

      <ActiveSessionsSection />

      <AccountDeletionSection
        twoFactorEnabled={Boolean(user?.two_factor_enabled)}
        // TCK-272 — défaut `true` : tant que `user` n'est pas chargé on
        // montre le parcours mot de passe, jamais la voie de secours.
        hasUsablePassword={user?.has_usable_password ?? true}
      />
    </section>
  );
}
