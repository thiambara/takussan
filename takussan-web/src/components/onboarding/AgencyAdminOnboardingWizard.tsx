'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { TotpEnrollment } from '@/components/auth/TotpEnrollment';

/**
 * TCK-270 — Lightweight onboarding wizard surfaced to a freshly-activated
 * agency_admin (typically right after they accept the super-admin invitation
 * and reset their password).
 *
 * Two steps only — keep it short, the user just signed in:
 *   1. Welcome     — friendly hello, single CTA "Continuer"
 *   2. 2FA         — recommended (skippable): wraps <TotpEnrollment>
 *
 * After step 2 (whether enrolled or skipped) the user is redirected to /app,
 * which is where the BrandingBanner takes over to nudge the next action.
 *
 * No persisted state: dropping out of the page just brings the user back to
 * /app on next login. The 2FA step itself is durable — recovery codes are
 * issued by the backend on confirm and never re-displayed.
 */
export interface AgencyAdminOnboardingWizardProps {
  readonly firstName: string;
  readonly agencyName: string;
}

type Step = 'welcome' | 'two-factor';

export function AgencyAdminOnboardingWizard({
  firstName,
  agencyName,
}: AgencyAdminOnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');
  const t = useTranslations('agency.onboarding');

  function finish() {
    router.replace('/app');
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-12">
      <ol className="flex items-center justify-center gap-3 text-xs font-medium text-muted-foreground">
        <li
          className={`flex items-center gap-2 rounded-full px-3 py-1 ${
            step === 'welcome' ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}
        >
          <Sparkles className="size-3" aria-hidden="true" />
          {t('steps.welcome')}
        </li>
        <ArrowRight className="size-3" aria-hidden="true" />
        <li
          className={`flex items-center gap-2 rounded-full px-3 py-1 ${
            step === 'two-factor' ? 'bg-primary text-primary-foreground' : 'bg-muted'
          }`}
        >
          <ShieldCheck className="size-3" aria-hidden="true" />
          {t('steps.twoFactor')}
        </li>
      </ol>

      {step === 'welcome' ? (
        <section className="space-y-6 rounded-2xl border border-border bg-white p-8 text-center shadow-sm">
          <Sparkles className="mx-auto size-10 text-primary" aria-hidden="true" />
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-bold text-foreground">
              {t('welcome.title', { firstName })}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('welcome.body', { agencyName })}
            </p>
          </div>
          <div>
            <Button onClick={() => setStep('two-factor')}>
              {t('welcome.cta')}
            </Button>
          </div>
        </section>
      ) : null}

      {step === 'two-factor' ? (
        <section className="space-y-6 rounded-2xl border border-border bg-white p-8 shadow-sm">
          <TotpEnrollment
            mode="recommended"
            onComplete={finish}
            onSkip={finish}
          />
        </section>
      ) : null}
    </div>
  );
}
