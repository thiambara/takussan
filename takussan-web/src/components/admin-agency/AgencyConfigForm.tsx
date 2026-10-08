'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useRef, useState, useTransition } from 'react';
import { useWatch } from 'react-hook-form';
import { Loader2, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  FormGlobalError,
  FormInput,
  FormSelect,
  FormSuccess,
  FormTextarea,
} from '@/components/forms';
import { useApiForm } from '@/hooks/useApiForm';
import { ApiError } from '@/lib/api';
import { CURRENCY_METADATA, formatCurrency, type CurrencyCode } from '@/lib/format/currency';
import { useTranslations } from 'next-intl';
import {
  agencyFormSchema,
  AGENCY_LOGO_ACCEPT,
  normaliseAgencyForm,
  validateAgencyLogoFile,
  type AgencyFormValues,
} from '@/lib/schemas/agency';
import { traduireMessageValidation } from '@/lib/schemas/messages';
import { useTraducteurValidation } from '@/hooks/useApiForm';
import {
  confirmPayoutThresholdAction,
  updateAgencyAction,
  uploadAgencyLogoAction,
} from '@/app/actions/admin-agency';
import type { Agency } from '@/types/agency';
import { reduirePhoto } from '@/lib/reduire-photo';
import { useCan } from '@/hooks/useCan';
import { useAuth } from '@/context/AuthContext';

/**
 * Agency admin configuration form — TCK-064.
 *
 * Single submit button at the bottom of the page; the logo is uploaded
 * through a dedicated action so it persists even if the main form has
 * pending edits (matches Linear/Stripe settings UX).
 */

interface AgencyConfigFormProps {
  readonly agency: Agency;
}

function toDefaults(agency: Agency): AgencyFormValues {
  const settings = agency.settings ?? {};
  const commission =
    typeof settings.default_commission_rate === 'number'
      ? settings.default_commission_rate
      : agency.commission_rate;
  // TCK-084 — agency-level `currency` is now a first-class column. We still
  // accept the legacy `settings.currency` value as a fallback so previously
  // saved agencies migrate without an explicit data backfill.
  const currency =
    agency.currency
    ?? (typeof settings.currency === 'string' ? settings.currency : '')
    ?? '';
  return {
    name: agency.name ?? '',
    license_number: agency.license_number ?? '',
    description: agency.description ?? '',
    email: agency.email ?? '',
    phone: agency.phone ?? '',
    website: agency.website ?? '',
    commission_rate: commission !== null && commission !== undefined ? String(commission) : '',
    currency: currency.toUpperCase(),
    timezone: typeof settings.timezone === 'string' ? settings.timezone : '',
    moderation_required: agency.moderation_required ?? false,
    require_team_two_factor: settings.require_team_two_factor === true,
    // TCK-593 — clé absente (agence neuve) = désactivé, comme côté API.
    late_fee_online_collection: settings.late_fee_online_collection === true,
    default_tax_rate: agency.default_tax_rate != null ? String(agency.default_tax_rate) : '',
    payout_approval_threshold: initialThreshold(agency),
    legal_name: agency.legal_name ?? '',
    ninea: agency.ninea ?? '',
    rccm: agency.rccm ?? '',
    legal_address: agency.legal_address ?? '',
  };
}

function initialThreshold(agency: Agency): string {
  return agency.payout_approval_threshold != null ? String(Math.round(agency.payout_approval_threshold)) : '';
}

const CURRENCY_OPTIONS = (Object.keys(CURRENCY_METADATA) as CurrencyCode[])
  // Surface only the three core currencies in the UI (XAF stays available
  // server-side for legacy data but the spec scopes the picker to XOF/EUR/USD).
  .filter((code) => code === 'XOF' || code === 'EUR' || code === 'USD')
  .map((code) => ({
    value: code,
    label: `${code} (${CURRENCY_METADATA[code].symbol})`,
  }));

export function AgencyConfigForm({ agency }: AgencyConfigFormProps) {
  const router = useRouter();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(agency.logo_url);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [isUploadingLogo, startLogoTransition] = useTransition();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations('admin.agencyConfig');
  const tValidation = useTraducteurValidation();
  const tCurrency = useTranslations('agency.currency');
  const tCommon = useTranslations('common.actions');
  const tMoney = useTranslations('admin.agencyConfig.moneyOut');
  // TCK-594 — le serveur décide (`AgencyPolicy::updatePayoutThreshold`) ; ceci évite seulement de
  // proposer un champ qui rendrait 403.
  const { can: canSetThreshold } = useCan('payouts.approve');
  const individual = agency.kind === 'individual';
  const { user } = useAuth();
  const pendingThreshold = agency.pending_payout_threshold_change ?? null;
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isConfirming, startConfirmTransition] = useTransition();

  function confirmThreshold() {
    setConfirmError(null);
    startConfirmTransition(async () => {
      // VERIF-594 passe 2, N-5 — on confirme la valeur AFFICHÉE ; remplacée entre-temps, le serveur rend 409.
      const result = await confirmPayoutThresholdAction(agency.id, pendingThreshold?.threshold ?? null);
      if (!result.ok) {
        setConfirmError(result.message);
        return;
      }
      setSuccessMessage(tMoney('thresholdConfirmed'));
      router.refresh();
    });
  }

  const { form, isSubmitting, globalError, handleSubmit, clearGlobalError } =
    useApiForm<AgencyFormValues, Agency>({
      schema: agencyFormSchema,
      defaultValues: toDefaults(agency),
      onSubmit: async (values) => {
        const payload = normaliseAgencyForm(values, {
          individual,
          initialThreshold: initialThreshold(agency),
        });
        const result = await updateAgencyAction(agency.id, payload);
        if (!result.ok) {
          throw new ApiError(result.status ?? 500, {
            message: result.message,
            errors: result.errors,
          });
        }
        return result.data as Agency;
      },
      onSuccess: (saved) => {
        // VERIF-594 M-2 — un relâchement du seuil n'est pas appliqué : il attend un second
        // approbateur (202). Le dire, plutôt qu'un « enregistré » qui laisserait croire le contraire.
        const pending = saved?.pending_payout_threshold_change != null
          && agency.pending_payout_threshold_change?.requested_at !== saved.pending_payout_threshold_change.requested_at;
        setSuccessMessage(pending ? tMoney('thresholdPendingSaved') : t('successSaved'));
        router.refresh();
      },
    });

  const { control } = form;
  // TCK-571 — `useWatch`, jamais `form.watch()` lu pendant le rendu. Compilée, la lecture tombait
  // dans un bloc mis en cache sur dix-neuf dépendances dont AUCUNE ne bouge avec la devise : l'aperçu
  // restait dans la devise d'origine et l'avertissement ne s'affichait jamais (TCK-564).
  const selectedCurrency = (useWatch({ control, name: 'currency' }) || 'XOF').toUpperCase() as CurrencyCode;
  const originalCurrency = (agency.currency ?? 'XOF').toUpperCase() as CurrencyCode;
  const currencyChanged = selectedCurrency !== originalCurrency;

  function handleLogoPick(ev: React.ChangeEvent<HTMLInputElement>) {
    setLogoError(null);
    const file = ev.target.files?.[0];
    if (!file) return;
    const validation = validateAgencyLogoFile(file);
    if (validation) {
      // `validateAgencyLogoFile` rend une CLÉ (`validation.agency.logoTooLarge`), pas un libellé :
      // sans cette résolution l'utilisateur lit la clé brute (TCK-292, 2026-08-22).
      setLogoError(traduireMessageValidation(validation, tValidation));
      ev.target.value = '';
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setLogoPreview(objectUrl);

    startLogoTransition(async () => {
      const formData = new FormData();
      // Réduit dans le navigateur avant l'envoi (TCK-542).
      formData.append('file', await reduirePhoto(file));
      const result = await uploadAgencyLogoAction(agency.id, formData);
      if (!result.ok) {
        setLogoError(result.message);
        setLogoPreview(agency.logo_url);
      } else if (result.data) {
        setLogoPreview(result.data.logo_url);
        setSuccessMessage(t('logoUpdated'));
        router.refresh();
      }
      if (ev.target) ev.target.value = '';
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8" noValidate>
      {globalError ? (
        <FormGlobalError>
          <span className="flex items-center justify-between gap-4">
            <span>{globalError}</span>
            <button type="button" onClick={clearGlobalError} className="text-xs underline">
              {tCommon('close')}
            </button>
          </span>
        </FormGlobalError>
      ) : null}
      {successMessage ? (
        <FormSuccess>
          <span className="flex items-center justify-between gap-4">
            <span>{successMessage}</span>
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              className="text-xs underline"
            >
              {tCommon('close')}
            </button>
          </span>
        </FormSuccess>
      ) : null}

      {/* Identité */}
      <section className="rounded-xl bg-card p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">{t('identity.title')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('identity.description')}</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <FormInput control={control} name="name" label={t('fields.name')} required />
          <div>
            <label
              htmlFor="agency-slug"
              className="mb-1.5 block text-sm font-medium text-muted-foreground"
            >
              {t('fields.slug')}
            </label>
            {/* La primitive, et non un `<input>` natif : celui-ci portait `h-9 rounded-md` à côté
                de champs `h-8 rounded-lg` — deux hauteurs et deux rayons sur la même ligne. */}
            <Input id="agency-slug" value={agency.slug} disabled readOnly />
          </div>
        </div>
        <FormInput
          control={control}
          name="license_number"
          label={t('fields.license')}
          placeholder={t('fields.licensePlaceholder')}
        />
        <FormTextarea
          control={control}
          name="description"
          label={t('fields.description')}
          rows={3}
          placeholder={t('fields.descriptionPlaceholder')}
        />
      </section>

      {/* Contact */}
      <section className="rounded-xl bg-card p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">{t('contact.title')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('contact.description')}</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <FormInput control={control} name="email" label={t('fields.email')} type="email" />
          <FormInput
            control={control}
            name="phone"
            label={t('fields.phone')}
            type="tel"
            placeholder="+221 77 123 45 67"
          />
        </div>
        <FormInput
          control={control}
          name="website"
          label={t('fields.website')}
          type="url"
          placeholder={t('fields.websitePlaceholder')}
        />
      </section>

      {/* Logo */}
      <section className="rounded-xl bg-card p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">{t('logo.title')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('logo.description')}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex size-20 items-center justify-center overflow-hidden rounded-lg border border-dashed border-input bg-muted">
            {logoPreview ? (
              <Image
                src={logoPreview}
                alt={t('logo.alt', { name: agency.name })}
                width={80}
                height={80}
                className="size-full object-contain"
                unoptimized
              />
            ) : (
              <span className="text-xs text-muted-foreground">{t('logo.empty')}</span>
            )}
          </div>
          <div>
            <input
              ref={logoInputRef}
              id="agency-logo"
              type="file"
              accept={AGENCY_LOGO_ACCEPT}
              className="sr-only"
              onChange={handleLogoPick}
              disabled={isUploadingLogo}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => logoInputRef.current?.click()}
              disabled={isUploadingLogo}
            >
              {isUploadingLogo ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  <span>{t('logo.uploading')}</span>
                </>
              ) : (
                <>
                  <Upload aria-hidden="true" />
                  <span>{logoPreview ? t('logo.change') : t('logo.add')}</span>
                </>
              )}
            </Button>
            {logoError ? (
              <p role="alert" className="mt-2 text-xs text-destructive">
                {logoError}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* Paramètres métier */}
      <section className="rounded-xl bg-card p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">{t('business.title')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('business.description')}</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <FormInput
            control={control}
            name="commission_rate"
            label={t('fields.commission')}
            inputMode="decimal"
            placeholder="5"
          />
          <div>
            <FormSelect
              control={control}
              name="currency"
              label={tCurrency('label')}
              options={CURRENCY_OPTIONS}
              placeholder={tCurrency('placeholder')}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              {tCurrency('preview', { example: formatCurrency(100_000, selectedCurrency) })}
            </p>
            {currencyChanged ? (
              <p
                role="alert"
                className="mt-1.5 rounded-md bg-primary/5 px-2 py-1.5 text-xs text-foreground"
              >
                {tCurrency('warningOnChange')}
              </p>
            ) : null}
          </div>
          <FormInput
            control={control}
            name="timezone"
            label={t('fields.timezone')}
            placeholder={t('fields.timezonePlaceholder')}
          />
        </div>

        {/* TCK-098 — moderation toggle */}
        {/* Tout l'encadré est cliquable : le `::after` du libellé le recouvre, sans que le texte
            d'aide n'entre dans le nom accessible de la case. La case seule faisait 13 × 16 px. */}
        <div className="relative flex items-start gap-4 rounded-lg border border-input bg-background px-4 py-3 transition-colors hover:bg-muted/40">
          <input
            id="moderation_required"
            type="checkbox"
            aria-describedby="moderation_required-hint"
            {...form.register('moderation_required')}
            className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-input accent-primary"
          />
          <div>
            <label
              htmlFor="moderation_required"
              className="cursor-pointer text-sm font-medium text-foreground after:absolute after:inset-0 after:rounded-lg"
            >
              {t('moderation.label')}
            </label>
            <p id="moderation_required-hint" className="mt-0.5 text-pretty text-xs text-muted-foreground">
              {t('moderation.hint')}
            </p>
          </div>
        </div>

        {/* TCK-593 — encaissement des pénalités de retard avec le paiement en ligne. */}
        <div className="relative flex items-start gap-4 rounded-lg border border-input bg-background px-4 py-3 transition-colors hover:bg-muted/40">
          <input
            id="late_fee_online_collection"
            type="checkbox"
            role="switch"
            aria-describedby="late_fee_online_collection-hint"
            {...form.register('late_fee_online_collection')}
            className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-input accent-primary"
          />
          <div>
            <label
              htmlFor="late_fee_online_collection"
              className="cursor-pointer text-sm font-medium text-foreground after:absolute after:inset-0 after:rounded-lg"
            >
              {t('lateFeeOnline.label')}
            </label>
            <p
              id="late_fee_online_collection-hint"
              className="mt-0.5 text-pretty text-xs text-muted-foreground"
            >
              {t('lateFeeOnline.hint')}
            </p>
          </div>
        </div>
      </section>

      {/* TCK-594 (ADR-0039 §4, §7) — ce qui sort de l'agence : factures et reversements. */}
      <section className="rounded-xl bg-card p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">{tMoney('title')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{tMoney('description')}</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <FormInput
            control={control}
            name="default_tax_rate"
            label={tMoney('taxRate')}
            inputMode="decimal"
            placeholder="18"
          />
          {canSetThreshold ? (
            <div>
              <FormInput
                control={control}
                name="payout_approval_threshold"
                label={tMoney('threshold')}
                inputMode="numeric"
              />
              <p className="mt-1.5 text-pretty text-xs text-muted-foreground">{tMoney('thresholdHint')}</p>
              {pendingThreshold ? (
                <div className="mt-3 space-y-2 rounded-xl border border-border bg-muted/40 p-3" role="status">
                  <p className="text-pretty text-sm text-foreground">
                    {pendingThreshold.threshold == null
                      ? tMoney('thresholdPendingOff')
                      : tMoney('thresholdPendingRaise', {
                          threshold: formatCurrency(pendingThreshold.threshold, originalCurrency),
                        })}
                  </p>
                  {user != null && pendingThreshold.requested_by_id === user.id ? (
                    <p className="text-pretty text-xs text-muted-foreground">{tMoney('thresholdPendingSelf')}</p>
                  ) : (
                    <Button type="button" size="sm" disabled={isConfirming} onClick={confirmThreshold}>
                      {isConfirming ? tMoney('thresholdConfirming') : tMoney('thresholdConfirm')}
                    </Button>
                  )}
                  {confirmError ? <p className="text-sm text-destructive">{confirmError}</p> : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        {individual ? null : (
          <>
            <div className="grid gap-4 lg:grid-cols-3">
              <FormInput control={control} name="legal_name" label={tMoney('legalName')} />
              <FormInput control={control} name="ninea" label={tMoney('ninea')} />
              <FormInput control={control} name="rccm" label={tMoney('rccm')} />
            </div>
            <FormTextarea control={control} name="legal_address" label={tMoney('legalAddress')} rows={2} />
          </>
        )}
      </section>

      {/* TCK-589 — sécurité de l'équipe. Même encadré cliquable que la modération. */}
      <section className="rounded-xl bg-card p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">{t('security.title')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('security.description')}</p>
        </div>
        <div className="relative flex items-start gap-4 rounded-lg border border-input bg-background px-4 py-3 transition-colors hover:bg-muted/40">
          <input
            id="require_team_two_factor"
            type="checkbox"
            aria-describedby="require_team_two_factor-hint"
            {...form.register('require_team_two_factor')}
            className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-input accent-primary"
          />
          <div>
            <label
              htmlFor="require_team_two_factor"
              className="cursor-pointer text-sm font-medium text-foreground after:absolute after:inset-0 after:rounded-lg"
            >
              {t('security.teamTwoFactorLabel')}
            </label>
            <p id="require_team_two_factor-hint" className="mt-0.5 text-pretty text-xs text-muted-foreground">
              {t('security.teamTwoFactorHint')}
            </p>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              <span>{t('submit.saving')}</span>
            </>
          ) : (
            <span>{tCommon('save')}</span>
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={isSubmitting}
        >
          {tCommon('cancel')}
        </Button>
      </div>
    </form>
  );
}
