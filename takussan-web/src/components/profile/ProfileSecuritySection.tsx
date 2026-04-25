'use client';

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
  const { user } = useAuth();
  const emailVerified = Boolean(user?.email_verified_at);

  return (
    <section className="space-y-4 rounded-2xl bg-app-surface-1 p-6">
      <div>
        <h2 className="text-lg font-bold text-app-ink">Sécurité</h2>
        <p className="text-sm text-app-ink-muted">
          Gérez l&apos;accès à votre compte et les appareils connectés.
        </p>
      </div>

      <div className="rounded-2xl border border-app-surface-3 bg-white p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-app-ink">Email</h3>
            <p className="mt-1 text-sm text-app-ink-muted">
              {emailVerified
                ? 'Votre email est vérifié.'
                : "Votre email n'est pas encore vérifié. Consultez votre boîte de réception."}
            </p>
          </div>
          <span
            className={
              'rounded-full px-2 py-1 text-xs font-semibold ' +
              (emailVerified
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-app-surface-1 text-app-accent')
            }
          >
            {emailVerified ? 'Vérifié' : 'Non vérifié'}
          </span>
        </div>
      </div>

      <TwoFactorSection enabled={Boolean(user?.two_factor_enabled)} />

      <PhoneVerificationSection
        phone={user?.phone ?? null}
        phoneVerified={Boolean(user?.phone_verified_at)}
      />

      <ActiveSessionsSection />

      <AccountDeletionSection twoFactorEnabled={Boolean(user?.two_factor_enabled)} />
    </section>
  );
}
