'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import {
  WizardReprenable,
  type WizardStep,
} from '@/components/wizard/WizardReprenable';
import { KycUploader } from '@/components/kyc/KycUploader';
import {
  getOwnerPropertiesAction,
  ownerOnboardCompleteAction,
  ownerSubmitKycAction,
} from '@/app/actions/owner-onboarding';
import {
  phoneSendOtpAction,
  phoneVerifyOtpAction,
} from '@/app/actions/security';
import type { OwnerPropertyEntry } from '@/lib/owner-onboarding';

/**
 * TCK-257 — Owner post-acceptance onboarding wizard.
 *
 * Four steps (mirror of the SP wizard, TCK-261):
 *   1. Phone OTP (mandatory).
 *   2. KYC : upload CNI + RIB + NINEA. Each upload persists immediately.
 *      Bottom CTA submits the dossier (status = pending_review). Wizard is
 *      resumable — closing the tab keeps the uploaded docs.
 *   3. Product tour : 3 skippable slides ("Vos biens", "Vos paiements",
 *      "Vos messages").
 *   4. Recap : list of pre-attached properties. Final CTA → /app.
 *
 * KYC submission is **non-blocking** for activation per spec — the
 * `complete()` endpoint flips OwnerProfile.status = active regardless of
 * whether the dossier has been submitted yet.
 */
export type OwnerOnboardingWizardProps = {
  ownerProfileId: number;
};

type WizardData = {
  phone: { number: string; code: string; verified: boolean };
  kyc: {
    cni_uploaded: boolean;
    rib_uploaded: boolean;
    ninea_uploaded: boolean;
    submitted: boolean;
  };
  tour: { skipped: boolean; finished: boolean };
};

export function OwnerOnboardingWizard({ ownerProfileId }: OwnerOnboardingWizardProps) {
  const t = useTranslations('owners.onboarding');
  const router = useRouter();
  const toast = useToast();
  const { user, refreshUser } = useAuth();

  const initialData: WizardData = useMemo(
    () => ({
      phone: {
        number: user?.phone ?? '',
        code: '',
        verified: Boolean(user?.phone_verified_at),
      },
      kyc: {
        cni_uploaded: false,
        rib_uploaded: false,
        ninea_uploaded: false,
        submitted: false,
      },
      tour: { skipped: false, finished: false },
    }),
    [user],
  );

  const handleComplete = useCallback(
    async () => {
      const completeRes = await ownerOnboardCompleteAction(
        ownerProfileId,
        // OTP already verified inline by `phoneVerifyOtpAction` — backend
        // bypasses re-verification when `phone_verified_at` is set.
        undefined,
      );
      if (!completeRes.ok) {
        toast.add({
          title: t('errors.completeTitle'),
          description: completeRes.message,
          type: 'error',
        });
        return;
      }

      await refreshUser();
      toast.add({
        title: t('success.title'),
        description: t('success.body'),
        type: 'success',
      });

      router.push('/app');
    },
    [ownerProfileId, refreshUser, router, t, toast],
  );

  const steps: WizardStep<WizardData>[] = useMemo(
    () => [
      {
        id: 'phone',
        title: t('steps.phone.title'),
        subtitle: t('steps.phone.subtitle'),
        canAdvance: (d) => d.phone.verified,
        render: ({ data, setData }) => <PhoneStep data={data} setData={setData} />,
      },
      {
        id: 'kyc',
        title: t('steps.kyc.title'),
        subtitle: t('steps.kyc.subtitle'),
        // KYC is not blocking — the user may move on with a partial
        // dossier, the backend does not gate activation on it.
        render: ({ data, setData }) => (
          <KycStep
            data={data}
            setData={setData}
            ownerProfileId={ownerProfileId}
          />
        ),
      },
      {
        id: 'tour',
        title: t('steps.tour.title'),
        subtitle: t('steps.tour.subtitle'),
        render: ({ data, setData }) => <TourStep data={data} setData={setData} />,
      },
      {
        id: 'recap',
        title: t('steps.recap.title'),
        subtitle: t('steps.recap.subtitle'),
        render: () => <RecapStep ownerProfileId={ownerProfileId} />,
      },
    ],
    [ownerProfileId, t],
  );

  return (
    <WizardReprenable<WizardData>
      storageKey={`owner-onboarding-${ownerProfileId}`}
      initialData={initialData}
      steps={steps}
      onComplete={handleComplete}
    />
  );
}

// ── Steps ────────────────────────────────────────────────────────────────

type StepProps = { data: WizardData; setData: (next: WizardData) => void };

function PhoneStep({ data, setData }: StepProps) {
  const t = useTranslations('owners.onboarding.steps.phone');
  const toast = useToast();
  const [sendPending, startSend] = useTransition();
  const [verifyPending, startVerify] = useTransition();
  const [otpSent, setOtpSent] = useState(false);
  const [debugCode, setDebugCode] = useState<string | null>(null);

  const handleSend = () => {
    startSend(async () => {
      const res = await phoneSendOtpAction();
      if (!res.ok) {
        toast.add({
          title: t('errors.sendTitle'),
          description: res.message,
          type: 'error',
        });
        return;
      }
      setOtpSent(true);
      setDebugCode(res.data.debug_code ?? null);
      toast.add({
        title: t('sent.title'),
        description: res.data.debug_code
          ? t('sent.bodyDebug', { code: res.data.debug_code })
          : t('sent.body'),
        type: 'success',
      });
    });
  };

  const handleVerify = () => {
    if (data.phone.code.length !== 6) return;
    startVerify(async () => {
      const res = await phoneVerifyOtpAction(data.phone.code);
      if (!res.ok) {
        toast.add({
          title: t('errors.verifyTitle'),
          description: res.message,
          type: 'error',
        });
        return;
      }
      setData({ ...data, phone: { ...data.phone, verified: true } });
      toast.add({
        title: t('verified.title'),
        description: t('verified.body'),
        type: 'success',
      });
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-1">
          <Label htmlFor="owner-phone">{t('fields.phone')}</Label>
          <Input
            id="owner-phone"
            type="tel"
            inputMode="tel"
            placeholder="+221..."
            value={data.phone.number}
            disabled={data.phone.verified}
            onChange={(e) =>
              setData({
                ...data,
                phone: { ...data.phone, number: e.target.value, verified: false },
              })
            }
          />
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            onClick={handleSend}
            disabled={sendPending || data.phone.verified || data.phone.number.trim() === ''}
          >
            {sendPending ? t('sending') : t('sendCta')}
          </Button>
        </div>
      </div>

      {otpSent && !data.phone.verified ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-1">
            <Label htmlFor="owner-otp">{t('fields.code')}</Label>
            <Input
              id="owner-otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={data.phone.code}
              onChange={(e) =>
                setData({
                  ...data,
                  phone: {
                    ...data.phone,
                    code: e.target.value.replace(/\D/g, '').slice(0, 6),
                  },
                })
              }
            />
            {debugCode ? (
              <span className="text-xs text-muted-foreground">
                {t('devHint', { code: debugCode })}
              </span>
            ) : null}
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              onClick={handleVerify}
              disabled={verifyPending || data.phone.code.length !== 6}
            >
              {verifyPending ? t('verifying') : t('verifyCta')}
            </Button>
          </div>
        </div>
      ) : null}

      {data.phone.verified ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {t('verified.banner')}
        </p>
      ) : null}
    </div>
  );
}

function KycStep({
  data,
  setData,
  ownerProfileId,
}: StepProps & { ownerProfileId: number }) {
  const t = useTranslations('owners.onboarding.steps.kyc');
  const toast = useToast();
  const [submitPending, startSubmit] = useTransition();

  const updateKyc = (next: Partial<WizardData['kyc']>) =>
    setData({ ...data, kyc: { ...data.kyc, ...next } });

  const handleSubmit = () => {
    startSubmit(async () => {
      const res = await ownerSubmitKycAction(ownerProfileId);
      if (!res.ok) {
        toast.add({
          title: t('submittedTitle'),
          description: res.message,
          type: 'error',
        });
        return;
      }
      updateKyc({ submitted: true });
      toast.add({
        title: t('submittedTitle'),
        description: t('submittedBody'),
        type: 'success',
      });
    });
  };

  const allUploaded =
    data.kyc.cni_uploaded && data.kyc.rib_uploaded && data.kyc.ninea_uploaded;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {data.kyc.submitted ? t('submittedBadge') : t('draftBadge')}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <KycUploader
          profileId={ownerProfileId}
          kind="cni"
          endpoint="owner-profiles"
          i18nNamespace="owners.onboarding.kyc"
          onUploaded={() => updateKyc({ cni_uploaded: true })}
        />
        <KycUploader
          profileId={ownerProfileId}
          kind="rib"
          endpoint="owner-profiles"
          i18nNamespace="owners.onboarding.kyc"
          onUploaded={() => updateKyc({ rib_uploaded: true })}
        />
        <KycUploader
          profileId={ownerProfileId}
          kind="ninea"
          endpoint="owner-profiles"
          i18nNamespace="owners.onboarding.kyc"
          onUploaded={() => updateKyc({ ninea_uploaded: true })}
        />
      </div>

      <div>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={submitPending || !allUploaded || data.kyc.submitted}
        >
          {submitPending ? t('submitting') : t('submitCta')}
        </Button>
      </div>
    </div>
  );
}

function TourStep({ data, setData }: StepProps) {
  const t = useTranslations('owners.onboarding.steps.tour');
  const slides = useMemo(
    () => [
      { title: t('slides.properties.title'), body: t('slides.properties.body') },
      { title: t('slides.payments.title'), body: t('slides.payments.body') },
      { title: t('slides.messages.title'), body: t('slides.messages.body') },
    ],
    [t],
  );
  const [index, setIndex] = useState(0);
  const isLast = index >= slides.length - 1;
  const slide = slides[index];

  const handleNext = () => {
    if (isLast) {
      setData({ ...data, tour: { skipped: false, finished: true } });
    } else {
      setIndex((i) => Math.min(i + 1, slides.length - 1));
    }
  };

  const handleSkip = () => {
    setData({ ...data, tour: { skipped: true, finished: false } });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-muted/30 p-6">
        <p className="font-medium text-foreground">{slide.title}</p>
        <p className="mt-2 text-sm text-muted-foreground">{slide.body}</p>
      </div>

      <div
        role="tablist"
        aria-label={t('subtitle')}
        className="flex items-center justify-center gap-1.5 py-1"
      >
        {slides.map((_, i) => (
          <span
            key={i}
            data-active={i === index || undefined}
            className={
              i === index
                ? 'h-1.5 w-6 rounded-full bg-foreground transition-all'
                : 'h-1.5 w-1.5 rounded-full bg-foreground/25 transition-all'
            }
          />
        ))}
      </div>

      <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="link"
          onClick={handleSkip}
          className="text-muted-foreground"
        >
          {t('skip')}
        </Button>
        <Button type="button" onClick={handleNext}>
          {isLast ? t('finish') : t('next')}
        </Button>
      </div>
    </div>
  );
}

function RecapStep({ ownerProfileId }: { ownerProfileId: number }) {
  const t = useTranslations('owners.onboarding.steps.recap');
  const [properties, setProperties] = useState<OwnerPropertyEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await getOwnerPropertiesAction(ownerProfileId);
      if (cancelled) return;
      if (!res.ok) {
        setError(res.message);
        setProperties([]);
        return;
      }
      setProperties(res.data.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [ownerProfileId]);

  if (properties === null) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
        …
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (properties.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-background p-6 text-center">
        <p className="font-medium text-foreground">{t('emptyTitle')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('emptyBody')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-border rounded-xl border border-border">
        {properties.map((property) => (
          <li
            key={property.id}
            data-testid={`owner-property-${property.id}`}
            className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
          >
            <div className="flex flex-col">
              <span className="font-medium text-foreground">
                {property.title ?? `#${property.id}`}
              </span>
              {property.city ? (
                <span className="text-xs text-muted-foreground">{property.city}</span>
              ) : null}
            </div>
            <a
              href={`/app/properties/${property.id}`}
              className="text-xs font-medium text-primary hover:underline"
            >
              {t('viewAll')}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
