'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
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
  TradesMultiSelect,
  TRADE_OPTIONS,
} from '@/components/service-providers/TradesMultiSelect';
import {
  AvailabilityGrid,
  emptyAvailabilityState,
  slotsFromState,
  type AvailabilityState,
} from '@/components/service-providers/AvailabilityGrid';
import {
  spOnboardCompleteAction,
  spPatchAvailabilityAction,
  spPatchTradesAction,
} from '@/app/actions/service-provider-onboarding';
import {
  phoneSendOtpAction,
  phoneVerifyOtpAction,
} from '@/app/actions/security';

/**
 * TCK-261 — Service Provider post-acceptance onboarding wizard.
 *
 * Four steps:
 *   1. Phone OTP (mandatory).
 *   2. Trades + zones + rates + optional insurance KYC.
 *   3. Weekly availability grid.
 *   4. Recap + welcome — primary CTA deep-links to the originating
 *      maintenance request when present (TCK-260 invitation metadata).
 *
 * Storage maps (keep in sync with the backend):
 *   - trades        → ServiceProviderProfile.specialties
 *   - zones         → ServiceProviderProfile.service_areas
 *   - hourly_rate   → ServiceProviderProfile.hourly_rate_min
 *   - visit_fee     → metadata.visit_fee
 *   - availability  → metadata.availability
 *   - cni / insurance → Document polymorph + medialibrary `file` collection
 */
export type ServiceProviderOnboardingWizardProps = {
  spProfileId: number;
  /** Pre-filled by the page if the invitation was emitted from a request. */
  fromMaintenanceRequestId?: number | null;
};

type WizardData = {
  phone: { number: string; code: string; verified: boolean };
  trades: {
    list: string[];
    intervention_zones: string[];
    hourly_rate: string; // string in UI to keep "" cleanly editable
    visit_fee: string;
    insurance_uploaded: boolean;
    cni_uploaded: boolean;
  };
  availability: AvailabilityState;
};

export function ServiceProviderOnboardingWizard({
  spProfileId,
  fromMaintenanceRequestId,
}: ServiceProviderOnboardingWizardProps) {
  const t = useTranslations('serviceProviders.onboarding');
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
      trades: {
        list: [],
        intervention_zones: [],
        hourly_rate: '',
        visit_fee: '',
        insurance_uploaded: false,
        cni_uploaded: false,
      },
      availability: emptyAvailabilityState(),
    }),
    [user],
  );

  const handleComplete = useCallback(
    async (data: WizardData) => {
      // Persist each chunk via its dedicated endpoint, then call the
      // transactional `complete` to flip status + collaborations + cookie.
      const tradesPayload = {
        trades: data.trades.list,
        intervention_zones: data.trades.intervention_zones,
        hourly_rate: data.trades.hourly_rate ? Number(data.trades.hourly_rate) : null,
        visit_fee: data.trades.visit_fee ? Number(data.trades.visit_fee) : null,
      };

      const tradesRes = await spPatchTradesAction(spProfileId, tradesPayload);
      if (!tradesRes.ok) {
        toast.add({
          title: t('errors.tradesTitle'),
          description: tradesRes.message,
          type: 'error',
        });
        return;
      }

      const slots = slotsFromState(data.availability);
      const availabilityRes = await spPatchAvailabilityAction(spProfileId, slots);
      if (!availabilityRes.ok) {
        toast.add({
          title: t('errors.availabilityTitle'),
          description: availabilityRes.message,
          type: 'error',
        });
        return;
      }

      const completeRes = await spOnboardCompleteAction(
        spProfileId,
        // OTP already verified inline by `phoneVerifyOtpAction` — the
        // backend bypasses re-verification when `phone_verified_at` is set.
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

      const target = completeRes.data.redirect_to_maintenance_request_id
        ?? fromMaintenanceRequestId
        ?? null;
      if (target !== null) {
        router.push(`/app/maintenance/requests/${target}`);
      } else {
        router.push('/app');
      }
    },
    [fromMaintenanceRequestId, refreshUser, router, spProfileId, t, toast],
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
        id: 'trades',
        title: t('steps.trades.title'),
        subtitle: t('steps.trades.subtitle'),
        canAdvance: (d) =>
          d.trades.list.length > 0 && d.trades.intervention_zones.length > 0,
        render: ({ data, setData }) => (
          <TradesStep data={data} setData={setData} spProfileId={spProfileId} />
        ),
      },
      {
        id: 'availability',
        title: t('steps.availability.title'),
        subtitle: t('steps.availability.subtitle'),
        canAdvance: (d) =>
          Object.values(d.availability).some((periods) => periods.length > 0),
        render: ({ data, setData }) => (
          <AvailabilityStep data={data} setData={setData} />
        ),
      },
      {
        id: 'recap',
        title: t('steps.recap.title'),
        subtitle: t('steps.recap.subtitle'),
        render: ({ data }) => (
          <RecapStep
            data={data}
            fromMaintenanceRequestId={fromMaintenanceRequestId ?? null}
          />
        ),
      },
    ],
    [fromMaintenanceRequestId, spProfileId, t],
  );

  return (
    <WizardReprenable<WizardData>
      storageKey={`sp-onboarding-${spProfileId}`}
      initialData={initialData}
      steps={steps}
      onComplete={handleComplete}
    />
  );
}

// ── Steps ────────────────────────────────────────────────────────────────

type StepProps = { data: WizardData; setData: (next: WizardData) => void };

function PhoneStep({ data, setData }: StepProps) {
  const t = useTranslations('serviceProviders.onboarding.steps.phone');
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
          <Label htmlFor="sp-phone">{t('fields.phone')}</Label>
          <Input
            id="sp-phone"
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
            <Label htmlFor="sp-otp">{t('fields.code')}</Label>
            <Input
              id="sp-otp"
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

function TradesStep({
  data,
  setData,
  spProfileId,
}: StepProps & { spProfileId: number }) {
  const t = useTranslations('serviceProviders.onboarding.steps.trades');
  const updateTrades = (next: Partial<WizardData['trades']>) =>
    setData({ ...data, trades: { ...data.trades, ...next } });

  const handleZonesChange = (raw: string) => {
    const list = raw
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    updateTrades({ intervention_zones: Array.from(new Set(list)) });
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Label className="mb-2 block">{t('fields.trades')}</Label>
        <TradesMultiSelect
          value={data.trades.list}
          onChange={(list) => updateTrades({ list })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="sp-zones">{t('fields.zones')}</Label>
        <Input
          id="sp-zones"
          placeholder={t('fields.zonesPlaceholder')}
          value={data.trades.intervention_zones.join(', ')}
          onChange={(e) => handleZonesChange(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t('fields.zonesHint')}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="sp-hourly">{t('fields.hourlyRate')}</Label>
          <Input
            id="sp-hourly"
            type="number"
            inputMode="numeric"
            min={0}
            value={data.trades.hourly_rate}
            onChange={(e) => updateTrades({ hourly_rate: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="sp-visit">{t('fields.visitFee')}</Label>
          <Input
            id="sp-visit"
            type="number"
            inputMode="numeric"
            min={0}
            value={data.trades.visit_fee}
            onChange={(e) => updateTrades({ visit_fee: e.target.value })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <KycUploader
          profileId={spProfileId}
          kind="cni"
          onUploaded={() => updateTrades({ cni_uploaded: true })}
        />
        <KycUploader
          profileId={spProfileId}
          kind="insurance"
          onUploaded={() => updateTrades({ insurance_uploaded: true })}
        />
      </div>
    </div>
  );
}

function AvailabilityStep({ data, setData }: StepProps) {
  return (
    <AvailabilityGrid
      value={data.availability}
      onChange={(next) => setData({ ...data, availability: next })}
    />
  );
}

function RecapStep({
  data,
  fromMaintenanceRequestId,
}: {
  data: WizardData;
  fromMaintenanceRequestId: number | null;
}) {
  const t = useTranslations('serviceProviders.onboarding.steps.recap');

  const slotCount = useMemo(
    () =>
      Object.values(data.availability).reduce(
        (total, periods) => total + periods.length,
        0,
      ),
    [data.availability],
  );

  return (
    <div className="flex flex-col gap-4">
      <dl className="divide-y divide-border rounded-xl border border-border">
        <Row label={t('rows.phone')} value={data.phone.number || '—'} />
        <Row
          label={t('rows.trades')}
          value={
            data.trades.list.length > 0
              ? data.trades.list
                  .filter((trade): trade is (typeof TRADE_OPTIONS)[number] =>
                    (TRADE_OPTIONS as readonly string[]).includes(trade),
                  )
                  .join(', ')
              : '—'
          }
        />
        <Row
          label={t('rows.zones')}
          value={data.trades.intervention_zones.join(', ') || '—'}
        />
        <Row
          label={t('rows.hourlyRate')}
          value={data.trades.hourly_rate || '—'}
        />
        <Row label={t('rows.visitFee')} value={data.trades.visit_fee || '—'} />
        <Row
          label={t('rows.insurance')}
          value={data.trades.insurance_uploaded ? t('rows.yes') : t('rows.no')}
        />
        <Row label={t('rows.availability')} value={`${slotCount} ${t('rows.slots')}`} />
      </dl>

      {fromMaintenanceRequestId !== null ? (
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-4 text-sm">
          <p className="font-medium text-foreground">
            {t('maintenanceRequest.title')}
          </p>
          <p className="mt-1 text-muted-foreground">
            {t('maintenanceRequest.body')}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  );
}
