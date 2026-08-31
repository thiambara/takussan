'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Building2, Mail, User } from 'lucide-react';

// HostWizardData / step list are intentionally trimmed compared to TCK-255:
// the "Votre premier bien" step has been removed so the wizard focuses on
// agency creation + OTP. After completion the user lands on the regular
// property-creation form (`/app/properties/new`) inside the dashboard.

import { Button } from '@/components/ui/button';
import { ChoiceCard, ChoiceCardGroup } from '@/components/ui/choice-card';
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
import { useUserLocation } from '@/components/providers/UserLocationProvider';
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

type HostWizardData = {
  intent: Intent;
  agency: { name: string; primary_city: string; currency: string };
  phone_otp: { phone: string; code: string; verified: boolean };
  preferences: { primary_property_type: string };
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
type Currency = (typeof CURRENCIES)[number];

const SUPER_ADMIN_EMAIL = 'support@takussan.app';

/**
 * Map an ipapi `currency` (any ISO 4217 code) to one of the four currencies
 * the backend accepts. Returns `null` when the geo currency isn't supported
 * so the caller can fall back to `XOF` (the platform default for Senegal).
 */
function matchSupportedCurrency(raw: string | undefined): Currency | null {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase();
  return (CURRENCIES as readonly string[]).includes(upper)
    ? (upper as Currency)
    : null;
}

/**
 * TCK-255 — Host individual onboarding wizard.
 *
 * Trois étapes :
 *   1. Intent (individual vs professional)
 *   2. Identity + phone OTP
 *   3. Recap + CGU + publish
 *
 * ⚠ TCK-496 — il y en avait QUATRE : un « mode de paiement » se glissait entre
 * l'identité et le récapitulatif. On y demandait par quel opérateur être payé à
 * quelqu'un qui n'avait pas encore d'annonce, et la réponse n'était lue par
 * rien — le service back reporte lui-même la configuration réelle au premier
 * encaissement. *Ce qui est demandé doit servir à ce qu'on est en train de
 * faire.* La question reste légitime ; c'est son moment qui ne l'était pas.
 *
 * Les trois étapes restantes se défendent chacune : le mode oriente la suite,
 * l'OTP est une exigence de sécurité (`features.md#21`), les CGU sont un
 * consentement.
 *
 * Uses the generic `<WizardReprenable>` (TCK-250) for autosave + resume.
 * On completion, hits `hostIndividualOnboardAction` which creates the
 * agency + owner profile in a single transaction (Laravel side) and pins
 * the new active_profile cookie. The user is then routed to
 * `/app/properties/new` to publish their first listing through the regular
 * property-creation form (no more inline "first property" step in the
 * wizard — TCK-255 follow-up).
 */
export function HostIndividualWizard() {
  const t = useTranslations('onboarding.host');
  const router = useRouter();
  const toast = useToast();
  const { user, refreshUser } = useAuth();
  const { location, loading: locationLoading } = useUserLocation();

  // Reuse the user's geo-IP context (resolved once site-wide via
  // `UserLocationProvider`, cached 24h in localStorage) to pre-fill the
  // city / currency / dialing-code defaults. The user can still override
  // every value in the form — this just removes friction on the happy path.
  const initialData: HostWizardData = useMemo(() => {
    const fullName = user
      ? [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
      : '';
    const geoCity = location?.city?.trim() ?? '';
    const geoCurrency = matchSupportedCurrency(location?.currency) ?? 'XOF';
    const geoDialing = location?.country_calling_code?.trim() ?? '';

    return {
      intent: 'individual',
      agency: {
        name: fullName ? t('defaults.spaceNameOf', { name: fullName }) : '',
        primary_city: geoCity,
        currency: geoCurrency,
      },
      phone_otp: {
        // If we already have the user's phone, use it; otherwise seed with
        // the country dialing code so the OTP step is one-tap-away from a
        // valid E.164-ish number.
        phone: user?.phone?.trim() ? user.phone : geoDialing,
        code: '',
        // Users who already verified their phone (registration, prior
        // onboarding, profile flow) skip the OTP UI; the backend service
        // mirrors this — `phone_verified_at !== null` ⇒ no fresh OTP check.
        verified: Boolean(user?.phone_verified_at),
      },
      preferences: { primary_property_type: 'apartment' },
      cgu_accepted: false,
    };
  }, [user, t, location]);

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

      const result = await hostIndividualOnboardAction({
        agency: data.agency,
        phone_otp: { phone: data.phone_otp.phone, code: data.phone_otp.code },
        preferences: data.preferences,
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
      router.push('/app/properties/new');
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
          (d.agency?.name ?? '').trim() !== '' &&
          (d.agency?.primary_city ?? '').trim() !== '' &&
          (d.agency?.currency ?? '') !== '' &&
          (d.phone_otp?.phone ?? '').trim() !== '' &&
          d.phone_otp?.verified === true &&
          (d.preferences?.primary_property_type ?? '') !== '',
        render: ({ data, setData }) => (
          <IdentityStep data={data} setData={setData} />
        ),
      },
      {
        id: 'recap',
        title: t('steps.recap.title'),
        subtitle: t('steps.recap.subtitle'),
        canAdvance: (d) => Boolean(d.cgu_accepted) && d.phone_otp?.verified === true,
        render: ({ data, setData }) => (
          <RecapStep data={data} setData={setData} />
        ),
      },
    ],
    [t],
  );

  // Wait one beat for the geo-IP lookup to settle before mounting the
  // wizard so `initialData` carries city/currency/dialing-code defaults on
  // the very first render — otherwise `WizardReprenable`'s internal
  // `useState(initialData)` would freeze the empty defaults in place.
  // Even on a cache hit the skeleton shows for at least one render tick:
  // `UserLocationProvider` defers its state update by a microtask so the
  // write leaves the effect's synchronous body. Brief, but not "invisible" —
  // this comment said synchronously, and it stopped being true when that
  // deferral landed.
  if (locationLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mx-auto flex w-full max-w-2xl flex-col gap-4"
      >
        <div className="h-2 w-full rounded-full bg-muted" />
        <div className="h-40 rounded-2xl border border-border bg-card" />
      </div>
    );
  }

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
    <ChoiceCardGroup legend={t('legend')}>
      <ChoiceCard
        name="intent"
        value="individual"
        checked={data.intent === 'individual'}
        onSelect={() => setIntent('individual')}
        icon={<User className="size-5" aria-hidden />}
        title={t('options.individual.title')}
        description={t('options.individual.body')}
      />

      <ChoiceCard
        name="intent"
        value="professional"
        checked={data.intent === 'professional'}
        onSelect={() => setIntent('professional')}
        icon={<Building2 className="size-5" aria-hidden />}
        title={t('options.professional.title')}
        description={t('options.professional.body')}
      >
        {/* Le professionnel n'est pas libre-service : il passe par le support.
            L'avis vit SOUS l'option qui le déclenche plutôt qu'en bas de
            l'étape — c'est la réponse à ce qu'on vient de cliquer. */}
        <div className="rounded-xl border border-primary/25 bg-primary/[0.04] p-4 text-sm">
          <p className="font-medium text-foreground">{t('professionalNotice.title')}</p>
          <p className="mt-1 leading-relaxed text-muted-foreground">
            {t('professionalNotice.body')}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <a
              href={`mailto:${SUPER_ADMIN_EMAIL}?subject=${encodeURIComponent(t('professionalNotice.mailSubject'))}`}
              className="inline-flex items-center gap-2 font-medium text-primary underline-offset-4 hover:underline"
            >
              <Mail className="size-4" aria-hidden />
              {t('professionalNotice.contactCta')}
            </a>
            <span aria-hidden className="text-border">
              |
            </span>
            <button
              type="button"
              className="font-medium text-primary underline-offset-4 hover:underline"
              onClick={() => setIntent('individual')}
            >
              {t('professionalNotice.continueIndividual')}
            </button>
          </div>
        </div>
      </ChoiceCard>
    </ChoiceCardGroup>
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
          <Select
            value={data.agency.currency}
            onValueChange={(value) =>
              setData({
                ...data,
                agency: { ...data.agency, currency: value ?? '' },
              })
            }
            items={CURRENCIES.map((c) => ({ value: c, label: c }))}
          >
            <SelectTrigger id="agency-currency" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="primary-property-type">
            {t('fields.primaryPropertyType')}
          </Label>
          <Select
            value={data.preferences.primary_property_type}
            onValueChange={(value) =>
              setData({
                ...data,
                preferences: {
                  ...data.preferences,
                  primary_property_type: value ?? '',
                },
              })
            }
            items={PROPERTY_TYPES.map((p) => ({
              value: p,
              label: t(`propertyTypes.${p}` as never),
            }))}
          >
            <SelectTrigger id="primary-property-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROPERTY_TYPES.map((p) => (
                <SelectItem key={p} value={p}>
                  {t(`propertyTypes.${p}` as never)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <PhoneOtpField data={data} setData={setData} />
    </div>
  );
}

function PhoneOtpField({ data, setData }: StepProps) {
  const t = useTranslations('onboarding.host.steps.identity');
  const toast = useToast();
  const { refreshUser } = useAuth();
  const [sendPending, startSend] = useTransition();
  const [verifyPending, startVerify] = useTransition();
  const [otpSent, setOtpSent] = useState(false);
  const [debugCode, setDebugCode] = useState<string | null>(null);

  const handleSend = () => {
    const phone = data.phone_otp.phone.trim();
    if (phone === '') return;
    startSend(async () => {
      // Persist the typed phone alongside the OTP request — the wizard is
      // the first place the user enters a phone number, so the user record
      // is empty until we forward it here.
      const res = await phoneSendOtpAction(phone);
      if (!res.ok) {
        toast.add({
          title: t('otp.errors.sendFailed'),
          description: res.message,
          type: 'error',
        });
        return;
      }
      // Pull the freshly-persisted phone (and reset verification state)
      // into the auth context so the rest of the app stays in sync.
      await refreshUser();
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
