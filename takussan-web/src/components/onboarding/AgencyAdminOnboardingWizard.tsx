'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { TotpEnrollment } from '@/components/auth/TotpEnrollment';
import { cn } from '@/lib/utils';

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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 sm:gap-8">
      {/* Deux étapes, dites en pastilles. La flèche vivait ENTRE deux `<li>`, enfant direct de
          l'`<ol>` — HTML invalide, et une icône annoncée au milieu de la liste. */}
      <ol className="flex items-center justify-center gap-2 text-xs font-medium text-muted-foreground">
        <li
          aria-current={step === 'welcome' ? 'step' : undefined}
          className={cn(
            'flex items-center gap-2 rounded-full px-3 py-1.5 transition-colors duration-200 ease-out',
            step === 'welcome' ? 'bg-primary text-primary-foreground' : 'bg-muted',
          )}
        >
          <Sparkles className="size-3.5" aria-hidden="true" />
          {t('steps.welcome')}
        </li>
        <li aria-hidden="true" className="flex">
          <ArrowRight className="size-3.5" />
        </li>
        <li
          aria-current={step === 'two-factor' ? 'step' : undefined}
          className={cn(
            'flex items-center gap-2 rounded-full px-3 py-1.5 transition-colors duration-200 ease-out',
            step === 'two-factor' ? 'bg-primary text-primary-foreground' : 'bg-muted',
          )}
        >
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          {t('steps.twoFactor')}
        </li>
      </ol>

      {step === 'welcome' ? (
        <section className="flex flex-col items-center gap-6 rounded-2xl border border-border bg-card px-5 py-8 text-center sm:p-10">
          <span className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="size-7" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-2xl font-bold tracking-tight text-balance text-foreground sm:text-3xl">
              {t('welcome.title', { firstName })}
            </h1>
            <p className="mx-auto max-w-[52ch] text-sm leading-relaxed text-pretty text-muted-foreground">
              {t('welcome.body', { agencyName })}
            </p>
          </div>
          <Button size="lg" className="h-11 w-full px-6 sm:w-auto" onClick={() => setStep('two-factor')}>
            {t('welcome.cta')}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </section>
      ) : null}

      {step === 'two-factor' ? (
        <section
          aria-labelledby="agency-admin-onboarding-2fa"
          className="rounded-2xl border border-border bg-card p-5 sm:p-8"
        >
          {/* L'étape n'avait AUCUN titre de niveau 1 : la page passait de rien à un `h3`. */}
          <h1 id="agency-admin-onboarding-2fa" className="sr-only">
            {t('steps.twoFactor')}
          </h1>
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
