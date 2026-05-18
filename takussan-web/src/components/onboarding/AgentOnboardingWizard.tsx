'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import {
  WizardReprenable,
  type WizardStep,
} from '@/components/wizard/WizardReprenable';
import { KycUploader } from '@/components/kyc/KycUploader';
import { ZoneMultiSelect } from '@/components/agents/ZoneMultiSelect';
import {
  agentOnboardCompleteAction,
  agentSubmitKycAction,
  agentUpdateSpecializationAction,
  getAgentFirstLeadAction,
} from '@/app/actions/agent-onboarding';
import {
  phoneSendOtpAction,
  phoneVerifyOtpAction,
} from '@/app/actions/security';
import type {
  AgentFirstLeadEntry,
  AgentSpecializationPayload,
} from '@/lib/agent-onboarding';

/**
 * TCK-259 — Agent post-acceptance onboarding wizard.
 *
 * Four steps (mirror of the Owner wizard, TCK-257):
 *   1. Phone OTP (mandatory).
 *   2. KYC : license_number input + license card / CNI / photo uploads.
 *      Each upload persists immediately. Bottom CTA submits the dossier
 *      (status = pending_review). Wizard is resumable — closing the tab
 *      keeps the uploaded docs.
 *   3. Specialization & intervention zones — selection persists via the
 *      dedicated PATCH endpoint so zones are saved even if the user
 *      bails mid-wizard.
 *   4. Recap : assigned role + main permissions + first pre-assigned
 *      lead (if any). Final CTA → /app, where the welcome modale fires.
 *
 * KYC submission is **non-blocking** for activation per spec — the
 * `complete()` endpoint flips AgentProfile.status = active regardless
 * of whether the dossier has been submitted yet.
 */
export type AgentOnboardingWizardProps = {
  agentProfileId: number;
  /** Role assigned by the inviting admin: agent | agent_senior | agent_manager. */
  invitedRole?: string | null;
};

type Specialization = AgentSpecializationPayload['specialization'];

type WizardData = {
  phone: { number: string; code: string; verified: boolean };
  kyc: {
    license_number: string;
    license_uploaded: boolean;
    cni_uploaded: boolean;
    photo_uploaded: boolean;
    submitted: boolean;
  };
  specialization: {
    value: Specialization | '';
    zones: string[];
    saved: boolean;
  };
};

const SPECIALIZATIONS: Specialization[] = ['residential', 'commercial', 'luxury', 'mixed'];

export function AgentOnboardingWizard({
  agentProfileId,
  invitedRole,
}: AgentOnboardingWizardProps) {
  const t = useTranslations('agents.onboarding');
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
        license_number: '',
        license_uploaded: false,
        cni_uploaded: false,
        photo_uploaded: false,
        submitted: false,
      },
      specialization: { value: '', zones: [], saved: false },
    }),
    [user],
  );

  const handleComplete = useCallback(async () => {
    const completeRes = await agentOnboardCompleteAction(agentProfileId, undefined);
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
  }, [agentProfileId, refreshUser, router, t, toast]);

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
        // Non-blocking — the user may move on with a partial dossier,
        // the backend doesn't gate activation on it.
        render: ({ data, setData }) => (
          <KycStep
            data={data}
            setData={setData}
            agentProfileId={agentProfileId}
          />
        ),
      },
      {
        id: 'specialization',
        title: t('steps.specialization.title'),
        subtitle: t('steps.specialization.subtitle'),
        canAdvance: (d) => d.specialization.saved,
        render: ({ data, setData }) => (
          <SpecializationStep
            data={data}
            setData={setData}
            agentProfileId={agentProfileId}
          />
        ),
      },
      {
        id: 'welcome',
        title: t('steps.welcome.title'),
        subtitle: t('steps.welcome.subtitle'),
        render: () => (
          <WelcomeStep agentProfileId={agentProfileId} invitedRole={invitedRole} />
        ),
      },
    ],
    [agentProfileId, invitedRole, t],
  );

  return (
    <WizardReprenable<WizardData>
      storageKey={`agent-onboarding-${agentProfileId}`}
      initialData={initialData}
      steps={steps}
      onComplete={handleComplete}
    />
  );
}

// ── Steps ────────────────────────────────────────────────────────────────

type StepProps = { data: WizardData; setData: (next: WizardData) => void };

function PhoneStep({ data, setData }: StepProps) {
  const t = useTranslations('agents.onboarding.steps.phone');
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
          <Label htmlFor="agent-phone">{t('fields.phone')}</Label>
          <Input
            id="agent-phone"
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
            <Label htmlFor="agent-otp">{t('fields.code')}</Label>
            <Input
              id="agent-otp"
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
  agentProfileId,
}: StepProps & { agentProfileId: number }) {
  const t = useTranslations('agents.onboarding.steps.kyc');
  const toast = useToast();
  const [submitPending, startSubmit] = useTransition();

  const updateKyc = (next: Partial<WizardData['kyc']>) =>
    setData({ ...data, kyc: { ...data.kyc, ...next } });

  const handleSubmit = () => {
    startSubmit(async () => {
      const res = await agentSubmitKycAction(agentProfileId);
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
    data.kyc.license_uploaded && data.kyc.cni_uploaded && data.kyc.photo_uploaded;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {data.kyc.submitted ? t('submittedBadge') : t('draftBadge')}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="agent-license-number">{t('licenseNumberLabel')}</Label>
        <Input
          id="agent-license-number"
          value={data.kyc.license_number}
          placeholder="AGT-2026-001"
          onChange={(e) => updateKyc({ license_number: e.target.value })}
        />
        <span className="text-xs text-muted-foreground">{t('licenseNumberHint')}</span>
      </div>

      <div className="flex flex-col gap-3">
        <KycUploader
          profileId={agentProfileId}
          kind="license"
          endpoint="agent-profiles"
          i18nNamespace="agents.onboarding.kyc"
          onUploaded={() => updateKyc({ license_uploaded: true })}
        />
        <KycUploader
          profileId={agentProfileId}
          kind="cni"
          endpoint="agent-profiles"
          i18nNamespace="agents.onboarding.kyc"
          onUploaded={() => updateKyc({ cni_uploaded: true })}
        />
        <KycUploader
          profileId={agentProfileId}
          kind="photo"
          endpoint="agent-profiles"
          i18nNamespace="agents.onboarding.kyc"
          onUploaded={() => updateKyc({ photo_uploaded: true })}
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

function SpecializationStep({
  data,
  setData,
  agentProfileId,
}: StepProps & { agentProfileId: number }) {
  const t = useTranslations('agents.onboarding.steps.specialization');
  const toast = useToast();
  const [savePending, startSave] = useTransition();

  const handleSave = () => {
    if (data.specialization.value === '') return;
    startSave(async () => {
      const res = await agentUpdateSpecializationAction(agentProfileId, {
        specialization: data.specialization.value as Specialization,
        intervention_zones: data.specialization.zones,
        license_number: data.kyc.license_number || undefined,
      });
      if (!res.ok) {
        toast.add({
          title: t('errors.saveTitle'),
          description: res.message,
          type: 'error',
        });
        return;
      }
      setData({
        ...data,
        specialization: { ...data.specialization, saved: true },
      });
      toast.add({
        title: t('saved.title'),
        description: t('saved.body'),
        type: 'success',
      });
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="agent-specialization">{t('specializationLabel')}</Label>
        <Select
          value={data.specialization.value || ''}
          onValueChange={(value) =>
            setData({
              ...data,
              specialization: {
                ...data.specialization,
                value: (value ?? '') as Specialization,
                saved: false,
              },
            })
          }
          items={SPECIALIZATIONS.map((s) => ({
            value: s,
            label: t(`specializationValues.${s}`),
          }))}
        >
          <SelectTrigger id="agent-specialization" className="w-full">
            <SelectValue placeholder={t('specializationPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {SPECIALIZATIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`specializationValues.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ZoneMultiSelect
        labelHtmlFor="agent-zones"
        value={data.specialization.zones}
        onChange={(zones) =>
          setData({
            ...data,
            specialization: { ...data.specialization, zones, saved: false },
          })
        }
      />

      <div>
        <Button
          type="button"
          onClick={handleSave}
          disabled={
            savePending ||
            data.specialization.value === '' ||
            data.specialization.saved
          }
        >
          {savePending
            ? t('saving')
            : data.specialization.saved
              ? t('savedBadge')
              : t('saveCta')}
        </Button>
      </div>
    </div>
  );
}

const ROLE_PERMISSIONS: Record<string, string[]> = {
  agent: ['list_properties', 'list_customers', 'create_visits', 'message_customers'],
  agent_senior: [
    'list_properties',
    'list_customers',
    'create_visits',
    'message_customers',
    'edit_properties',
    'invite_owner',
  ],
  agent_manager: [
    'list_properties',
    'list_customers',
    'create_visits',
    'message_customers',
    'edit_properties',
    'invite_owner',
    'invite_agent',
    'reassign_leads',
  ],
};

function WelcomeStep({
  agentProfileId,
  invitedRole,
}: {
  agentProfileId: number;
  invitedRole?: string | null;
}) {
  const t = useTranslations('agents.onboarding.steps.welcome');
  const [lead, setLead] = useState<AgentFirstLeadEntry | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await getAgentFirstLeadAction(agentProfileId);
      if (cancelled) return;
      if (!res.ok) {
        setError(res.message);
        setLead(null);
        return;
      }
      setLead(res.data.customer);
    })();
    return () => {
      cancelled = true;
    };
  }, [agentProfileId]);

  const role = (invitedRole ?? 'agent') as keyof typeof ROLE_PERMISSIONS;
  const permissions = ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS.agent;

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-border bg-muted/30 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('roleLabel')}
        </p>
        <p className="mt-1 text-lg font-semibold text-foreground">
          {t(`roles.${role}`)}
        </p>
        <ul className="mt-3 grid grid-cols-1 gap-1 text-sm text-muted-foreground sm:grid-cols-2">
          {permissions.map((perm) => (
            <li key={perm} className="flex items-start gap-2">
              <span className="mt-1 inline-block size-1.5 rounded-full bg-primary" aria-hidden />
              <span>{t(`permissions.${perm}`)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div data-testid="agent-first-lead-block">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('firstLeadLabel')}
        </p>
        {lead === undefined ? (
          <p className="mt-2 text-sm text-muted-foreground">…</p>
        ) : error ? (
          <div className="mt-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : lead === null ? (
          <div className="mt-2 rounded-xl border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
            {t('noLead')}
          </div>
        ) : (
          <a
            href={`/app/customers/${lead.id}`}
            data-testid={`agent-first-lead-${lead.id}`}
            className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-4 text-sm hover:border-primary"
          >
            <div className="flex flex-col">
              <span className="font-medium text-foreground">{lead.full_name}</span>
              {lead.pipeline_stage ? (
                <span className="text-xs text-muted-foreground">
                  {t('stageLabel', { stage: lead.pipeline_stage })}
                </span>
              ) : null}
            </div>
            <span className="text-xs font-medium text-primary">{t('viewLead')}</span>
          </a>
        )}
      </div>
    </div>
  );
}
