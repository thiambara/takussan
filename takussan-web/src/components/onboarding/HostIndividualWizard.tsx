'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Mail } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import {
  WizardReprenable,
  type WizardStep,
} from '@/components/wizard/WizardReprenable';
import { hostIndividualOnboardAction } from '@/app/actions/onboarding';
import {
  phoneSendOtpAction,
  phoneVerifyOtpAction,
} from '@/app/actions/security';

type Intent = 'individual' | 'professional';
type ContractType = 'rent' | 'sale';

type HostWizardData = {
  intent: Intent;
  agency: { name: string; primary_city: string; currency: string };
  phone_otp: { phone: string; code: string; verified: boolean };
  preferences: { primary_property_type: string };
  first_property_draft: {
    title: string;
    type: string;
    city: string;
    contract_type: ContractType;
    price: string; // string in the UI to keep "" cleanly editable; serialized as Number on submit
  };
  payment_setting: { preferred_provider: string };
  cgu_accepted: boolean;
};

const PROPERTY_TYPES = [
  'apartment',
  'house',
  'villa',
  'studio',
  'room',
  'land',
  'office',
  'shop',
  'warehouse',
  'other',
] as const;

const CURRENCIES = ['XOF', 'XAF', 'EUR', 'USD'] as const;
const PAYMENT_PROVIDERS = ['wave', 'orange_money', 'lemon_squeezy'] as const;

const SUPER_ADMIN_EMAIL = 'support@takussan.app';

/**
 * TCK-255 — Host individual onboarding wizard.
 *
 * Five steps:
 *   1. Intent (individual vs professional)
 *   2. Identity + phone OTP
 *   3. First property draft
 *   4. Payment provider
 *   5. Recap + CGU + publish
 *
 * Uses the generic `<WizardReprenable>` (TCK-250) for autosave + resume.
 * On completion, hits `hostIndividualOnboardAction` which:
 *   - creates the agency, owner profile, first draft property in a single
 *     transaction (Laravel side),
 *   - persists the active_profile cookie,
 *   - returns the new property id so we can deep-link to its edit form.
 */
export function HostIndividualWizard() {
  const t = useTranslations('onboarding.host');
  const router = useRouter();
  const toast = useToast();
  const { user, refreshUser } = useAuth();

  const initialData: HostWizardData = useMemo(() => {
    const fullName = user
      ? [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
      : '';
    return {
      intent: 'individual',
      agency: {
        name: fullName ? t('defaults.spaceNameOf', { name: fullName }) : '',
        primary_city: '',
        currency: 'XOF',
      },
      phone_otp: {
        phone: user?.phone ?? '',
        code: '',
        verified: Boolean(user?.phone_verified_at),
      },
      preferences: { primary_property_type: 'apartment' },
      first_property_draft: {
        title: '',
        type: 'apartment',
        city: '',
        contract_type: 'rent',
        price: '',
      },
      payment_setting: { preferred_provider: 'wave' },
      cgu_accepted: false,
    };
  }, [user, t]);

  const handleComplete = useCallback(
    async (data: HostWizardData) => {
      // Defensive: the gate is also enforced by `canAdvance` on the recap
      // step, but we re-check here so a corrupt resumed draft doesn't
      // sneak through.
      if (!data.cgu_accepted) {
        toast.add({
          title: t('errors.cguTitle'),
          description: t('errors.cguBody'),
          type: 'error',
        });
        return;
      }
      if (!data.phone_otp.verified) {
        toast.add({
          title: t('errors.otpTitle'),
          description: t('errors.otpBody'),
          type: 'error',
        });
        return;
      }

      const price = Number(data.first_property_draft.price);
      const result = await hostIndividualOnboardAction({
        agency: data.agency,
        phone_otp: { phone: data.phone_otp.phone, code: data.phone_otp.code },
        preferences: data.preferences,
        first_property_draft: {
          title: data.first_property_draft.title,
          type: data.first_property_draft.type,
          city: data.first_property_draft.city,
          contract_type: data.first_property_draft.contract_type,
          price: Number.isFinite(price) ? price : 0,
        },
        payment_setting: data.payment_setting,
        cgu_accepted: data.cgu_accepted,
      });

      if (!result.ok) {
        toast.add({
          title: t('errors.submitTitle'),
          description: result.message,
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
      router.push(`/app/properties/${result.data.property_draft.id}/edit`);
    },
    [refreshUser, router, t, toast],
  );

  const steps: WizardStep<HostWizardData>[] = useMemo(
    () => [
      {
        id: 'intent',
        title: t('steps.intent.title'),
        subtitle: t('steps.intent.subtitle'),
        render: ({ data, setData }) => (
          <IntentStep data={data} setData={setData} />
        ),
      },
      {
        id: 'identity',
        title: t('steps.identity.title'),
        subtitle: t('steps.identity.subtitle'),
        canAdvance: (d) =>
          d.agency.name.trim() !== '' &&
          d.agency.primary_city.trim() !== '' &&
          d.agency.currency !== '' &&
          d.phone_otp.phone.trim() !== '' &&
          d.phone_otp.verified === true &&
          d.preferences.primary_property_type !== '',
        render: ({ data, setData }) => (
          <IdentityStep data={data} setData={setData} />
        ),
      },
      {
        id: 'first-property',
        title: t('steps.firstProperty.title'),
        subtitle: t('steps.firstProperty.subtitle'),
        canAdvance: (d) => {
          const price = Number(d.first_property_draft.price);
          return (
            d.first_property_draft.title.trim() !== '' &&
            d.first_property_draft.type !== '' &&
            d.first_property_draft.city.trim() !== '' &&
            (d.first_property_draft.contract_type === 'rent' ||
              d.first_property_draft.contract_type === 'sale') &&
            Number.isFinite(price) &&
            price >= 0 &&
            d.first_property_draft.price !== ''
          );
        },
        render: ({ data, setData }) => (
          <FirstPropertyStep data={data} setData={setData} />
        ),
      },
      {
        id: 'payment',
        title: t('steps.payment.title'),
        subtitle: t('steps.payment.subtitle'),
        canAdvance: (d) => d.payment_setting.preferred_provider !== '',
        render: ({ data, setData }) => (
          <PaymentStep data={data} setData={setData} />
        ),
      },
      {
        id: 'recap',
        title: t('steps.recap.title'),
        subtitle: t('steps.recap.subtitle'),
        canAdvance: (d) => d.cgu_accepted && d.phone_otp.verified,
        render: ({ data, setData }) => (
          <RecapStep data={data} setData={setData} />
        ),
      },
    ],
    [t],
  );

  return (
    <WizardReprenable<HostWizardData>
      storageKey="host-individual-wizard"
      initialData={initialData}
      steps={steps}
      onComplete={handleComplete}
    />
  );
}

// --- Step components ----------------------------------------------------

type StepProps = {
  data: HostWizardData;
  setData: (next: HostWizardData) => void;
};

function IntentStep({ data, setData }: StepProps) {
  const t = useTranslations('onboarding.host.steps.intent');
  const setIntent = (intent: Intent) => setData({ ...data, intent });

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">{t('legend')}</legend>
        <label
          className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
            data.intent === 'individual'
              ? 'border-primary bg-primary/5'
              : 'border-border'
          }`}
        >
          <input
            type="radio"
            name="intent"
            value="individual"
            checked={data.intent === 'individual'}
            onChange={() => setIntent('individual')}
            className="mt-1"
          />
          <span>
            <span className="block font-medium text-foreground">
              {t('options.individual.title')}
            </span>
            <span className="block text-sm text-muted-foreground">
              {t('options.individual.body')}
            </span>
          </span>
        </label>

        <label
          className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
            data.intent === 'professional'
              ? 'border-primary bg-primary/5'
              : 'border-border'
          }`}
        >
          <input
            type="radio"
            name="intent"
            value="professional"
            checked={data.intent === 'professional'}
            onChange={() => setIntent('professional')}
            className="mt-1"
          />
          <span>
            <span className="block font-medium text-foreground">
              {t('options.professional.title')}
            </span>
            <span className="block text-sm text-muted-foreground">
              {t('options.professional.body')}
            </span>
          </span>
        </label>
      </fieldset>

      {data.intent === 'professional' ? (
        <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4 text-sm">
          <p className="text-foreground">{t('professionalNotice.title')}</p>
          <p className="mt-1 text-muted-foreground">
            {t('professionalNotice.body')}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href={`mailto:${SUPER_ADMIN_EMAIL}?subject=${encodeURIComponent(t('professionalNotice.mailSubject'))}`}
              className="inline-flex items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              <Mail className="size-4" aria-hidden />
              {t('professionalNotice.contactCta')}
            </a>
            <span aria-hidden className="text-muted-foreground">
              ·
            </span>
            <button
              type="button"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              onClick={() => setIntent('individual')}
            >
              {t('professionalNotice.continueIndividual')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function IdentityStep({ data, setData }: StepProps) {
  const t = useTranslations('onboarding.host.steps.identity');

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="agency-name">{t('fields.spaceName')}</Label>
          <Input
            id="agency-name"
            value={data.agency.name}
            onChange={(e) =>
              setData({ ...data, agency: { ...data.agency, name: e.target.value } })
            }
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="agency-city">{t('fields.primaryCity')}</Label>
          <Input
            id="agency-city"
            value={data.agency.primary_city}
            onChange={(e) =>
              setData({
                ...data,
                agency: { ...data.agency, primary_city: e.target.value },
              })
            }
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="agency-currency">{t('fields.currency')}</Label>
          <select
            id="agency-currency"
            value={data.agency.currency}
            onChange={(e) =>
              setData({
                ...data,
                agency: { ...data.agency, currency: e.target.value },
              })
            }
            className="h-9 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="primary-property-type">
            {t('fields.primaryPropertyType')}
          </Label>
          <select
            id="primary-property-type"
            value={data.preferences.primary_property_type}
            onChange={(e) =>
              setData({
                ...data,
                preferences: {
                  ...data.preferences,
                  primary_property_type: e.target.value,
                },
              })
            }
            className="h-9 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm"
          >
            {PROPERTY_TYPES.map((p) => (
              <option key={p} value={p}>
                {t(`propertyTypes.${p}` as never)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <PhoneOtpField data={data} setData={setData} />
    </div>
  );
}

function PhoneOtpField({ data, setData }: StepProps) {
  const t = useTranslations('onboarding.host.steps.identity');
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
          title: t('otp.errors.sendFailed'),
          description: res.message,
          type: 'error',
        });
        return;
      }
      setOtpSent(true);
      setDebugCode(res.data.debug_code ?? null);
      toast.add({
        title: t('otp.sentTitle'),
        description: res.data.debug_code
          ? t('otp.sentDebug', { code: res.data.debug_code })
          : t('otp.sentBody'),
        type: 'success',
      });
    });
  };

  const handleVerify = () => {
    if (data.phone_otp.code.length !== 6) return;
    startVerify(async () => {
      const res = await phoneVerifyOtpAction(data.phone_otp.code);
      if (!res.ok) {
        toast.add({
          title: t('otp.errors.verifyFailed'),
          description: res.message,
          type: 'error',
        });
        return;
      }
      setData({
        ...data,
        phone_otp: { ...data.phone_otp, verified: true },
      });
      toast.add({
        title: t('otp.verifiedTitle'),
        description: t('otp.verifiedBody'),
        type: 'success',
      });
    });
  };

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-foreground">{t('otp.heading')}</p>
          <p className="text-sm text-muted-foreground">{t('otp.body')}</p>
        </div>
        {data.phone_otp.verified ? (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
            {t('otp.statusVerified')}
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
            {t('otp.statusPending')}
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-1">
          <Label htmlFor="phone-otp-phone">{t('fields.phone')}</Label>
          <Input
            id="phone-otp-phone"
            type="tel"
            inputMode="tel"
            placeholder="+221..."
            value={data.phone_otp.phone}
            onChange={(e) =>
              setData({
                ...data,
                phone_otp: {
                  ...data.phone_otp,
                  phone: e.target.value,
                  // Editing the phone invalidates a previous OTP — the
                  // user has to re-send and re-verify.
                  verified: false,
                },
              })
            }
            disabled={data.phone_otp.verified}
          />
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            variant="outline"
            onClick={handleSend}
            disabled={
              sendPending ||
              data.phone_otp.verified ||
              data.phone_otp.phone.trim() === ''
            }
          >
            {sendPending ? t('otp.sending') : t('otp.sendCta')}
          </Button>
        </div>
      </div>

      {otpSent && !data.phone_otp.verified ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-1">
            <Label htmlFor="phone-otp-code">{t('fields.otpCode')}</Label>
            <Input
              id="phone-otp-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={data.phone_otp.code}
              onChange={(e) =>
                setData({
                  ...data,
                  phone_otp: {
                    ...data.phone_otp,
                    code: e.target.value.replace(/\D/g, '').slice(0, 6),
                  },
                })
              }
            />
            {debugCode ? (
              <span className="text-xs text-muted-foreground">
                {t('otp.devHint', { code: debugCode })}
              </span>
            ) : null}
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              onClick={handleVerify}
              disabled={verifyPending || data.phone_otp.code.length !== 6}
            >
              {verifyPending ? t('otp.verifying') : t('otp.verifyCta')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FirstPropertyStep({ data, setData }: StepProps) {
  const t = useTranslations('onboarding.host.steps.firstProperty');
  const draft = data.first_property_draft;

  const update = (next: Partial<HostWizardData['first_property_draft']>) =>
    setData({
      ...data,
      first_property_draft: { ...draft, ...next },
    });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1 sm:col-span-2">
        <Label htmlFor="property-title">{t('fields.title')}</Label>
        <Input
          id="property-title"
          value={draft.title}
          onChange={(e) => update({ title: e.target.value })}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="property-type">{t('fields.type')}</Label>
        <select
          id="property-type"
          value={draft.type}
          onChange={(e) => update({ type: e.target.value })}
          className="h-9 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm"
        >
          {PROPERTY_TYPES.map((p) => (
            <option key={p} value={p}>
              {t(`types.${p}` as never)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="property-city">{t('fields.city')}</Label>
        <Input
          id="property-city"
          value={draft.city}
          onChange={(e) => update({ city: e.target.value })}
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="property-contract">{t('fields.contractType')}</Label>
        <select
          id="property-contract"
          value={draft.contract_type}
          onChange={(e) =>
            update({ contract_type: e.target.value as ContractType })
          }
          className="h-9 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm"
        >
          <option value="rent">{t('contracts.rent')}</option>
          <option value="sale">{t('contracts.sale')}</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="property-price">{t('fields.price')}</Label>
        <Input
          id="property-price"
          type="number"
          inputMode="numeric"
          min={0}
          value={draft.price}
          onChange={(e) => update({ price: e.target.value })}
        />
      </div>
    </div>
  );
}

function PaymentStep({ data, setData }: StepProps) {
  const t = useTranslations('onboarding.host.steps.payment');

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="sr-only">{t('legend')}</legend>
      {PAYMENT_PROVIDERS.map((provider) => (
        <label
          key={provider}
          className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
            data.payment_setting.preferred_provider === provider
              ? 'border-primary bg-primary/5'
              : 'border-border'
          }`}
        >
          <input
            type="radio"
            name="payment-provider"
            value={provider}
            checked={data.payment_setting.preferred_provider === provider}
            onChange={() =>
              setData({
                ...data,
                payment_setting: { preferred_provider: provider },
              })
            }
            className="mt-1"
          />
          <span>
            <span className="block font-medium text-foreground">
              {t(`providers.${provider}.title` as never)}
            </span>
            <span className="block text-sm text-muted-foreground">
              {t(`providers.${provider}.body` as never)}
            </span>
          </span>
        </label>
      ))}
      <p className="text-xs text-muted-foreground">{t('disclaimer')}</p>
    </fieldset>
  );
}

function RecapStep({ data, setData }: StepProps) {
  const t = useTranslations('onboarding.host.steps.recap');

  const rows: Array<{ label: string; value: string }> = [
    { label: t('rows.spaceName'), value: data.agency.name || '—' },
    {
      label: t('rows.primaryCity'),
      value: data.agency.primary_city || '—',
    },
    { label: t('rows.currency'), value: data.agency.currency },
    { label: t('rows.phone'), value: data.phone_otp.phone || '—' },
    {
      label: t('rows.phoneVerified'),
      value: data.phone_otp.verified ? t('rows.yes') : t('rows.no'),
    },
    {
      label: t('rows.firstPropertyTitle'),
      value: data.first_property_draft.title || '—',
    },
    {
      label: t('rows.firstPropertyType'),
      value: data.first_property_draft.type,
    },
    {
      label: t('rows.firstPropertyContract'),
      value: data.first_property_draft.contract_type,
    },
    {
      label: t('rows.firstPropertyPrice'),
      value: data.first_property_draft.price
        ? `${data.first_property_draft.price} ${data.agency.currency}`
        : '—',
    },
    {
      label: t('rows.paymentProvider'),
      value: data.payment_setting.preferred_provider,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <dl className="divide-y divide-border rounded-xl border border-border">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
          >
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="font-medium text-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>

      {!data.phone_otp.verified ? (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t('warnings.otpRequired')}
        </p>
      ) : null}

      <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3 text-sm">
        <input
          type="checkbox"
          checked={data.cgu_accepted}
          onChange={(e) =>
            setData({ ...data, cgu_accepted: e.target.checked })
          }
          className="mt-1"
        />
        <span className="text-foreground">
          {t.rich('cgu.label', {
            link: (chunks) => (
              <a
                href="/legal/cgu"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline-offset-4 hover:underline"
              >
                {chunks}
              </a>
            ),
          })}
        </span>
      </label>
    </div>
  );
}
