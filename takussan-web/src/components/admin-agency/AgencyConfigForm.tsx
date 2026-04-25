'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useRef, useState, useTransition } from 'react';
import { Loader2, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
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
import {
  updateAgencyAction,
  uploadAgencyLogoAction,
} from '@/app/actions/admin-agency';
import type { Agency } from '@/types/agency';

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
  };
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

  const { form, isSubmitting, globalError, handleSubmit, clearGlobalError } =
    useApiForm<AgencyFormValues, Agency>({
      schema: agencyFormSchema,
      defaultValues: toDefaults(agency),
      onSubmit: async (values) => {
        const payload = normaliseAgencyForm(values);
        const result = await updateAgencyAction(agency.id, payload);
        if (!result.ok) {
          throw new ApiError(result.status ?? 500, {
            message: result.message,
            errors: result.errors,
          });
        }
        return result.data as Agency;
      },
      onSuccess: () => {
        setSuccessMessage('Modifications enregistrées.');
        router.refresh();
      },
    });

  const { control } = form;
  const t = useTranslations('agency.currency');
  const selectedCurrency = (form.watch('currency') || 'XOF').toUpperCase() as CurrencyCode;
  const originalCurrency = (agency.currency ?? 'XOF').toUpperCase() as CurrencyCode;
  const currencyChanged = selectedCurrency !== originalCurrency;

  function handleLogoPick(ev: React.ChangeEvent<HTMLInputElement>) {
    setLogoError(null);
    const file = ev.target.files?.[0];
    if (!file) return;
    const validation = validateAgencyLogoFile(file);
    if (validation) {
      setLogoError(validation);
      ev.target.value = '';
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setLogoPreview(objectUrl);

    const formData = new FormData();
    formData.append('file', file);

    startLogoTransition(async () => {
      const result = await uploadAgencyLogoAction(agency.id, formData);
      if (!result.ok) {
        setLogoError(result.message);
        setLogoPreview(agency.logo_url);
      } else if (result.data) {
        setLogoPreview(result.data.logo_url);
        setSuccessMessage('Logo mis à jour.');
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
              Fermer
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
              Fermer
            </button>
          </span>
        </FormSuccess>
      ) : null}

      {/* Identité */}
      <section className="rounded-xl bg-app-surface-1 p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-app-ink">Identité</h2>
          <p className="mt-1 text-xs text-app-ink-muted">
            Nom commercial, licence professionnelle et description publique.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <FormInput control={control} name="name" label="Nom de l’agence" required />
          <div>
            <label
              htmlFor="agency-slug"
              className="mb-1.5 block text-sm font-medium text-muted-foreground"
            >
              Identifiant URL (non modifiable)
            </label>
            <input
              id="agency-slug"
              value={agency.slug}
              disabled
              readOnly
              className="h-9 w-full rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground"
            />
          </div>
        </div>
        <FormInput
          control={control}
          name="license_number"
          label="Numéro de licence"
          placeholder="ex : SEN-IMMO-2024"
        />
        <FormTextarea
          control={control}
          name="description"
          label="Description"
          rows={3}
          placeholder="Quelques mots sur votre agence, affichés sur le site public."
        />
      </section>

      {/* Contact */}
      <section className="rounded-xl bg-app-surface-1 p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-app-ink">Contact</h2>
          <p className="mt-1 text-xs text-app-ink-muted">
            Coordonnées utilisées dans les e-mails transactionnels et sur les fiches
            biens publiées.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <FormInput control={control} name="email" label="E-mail" type="email" />
          <FormInput
            control={control}
            name="phone"
            label="Téléphone"
            type="tel"
            placeholder="+221 77 123 45 67"
          />
        </div>
        <FormInput
          control={control}
          name="website"
          label="Site internet"
          type="url"
          placeholder="https://votre-agence.sn"
        />
      </section>

      {/* Logo */}
      <section className="rounded-xl bg-app-surface-1 p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-app-ink">Logo</h2>
          <p className="mt-1 text-xs text-app-ink-muted">
            JPG, PNG ou WEBP — 2 Mo maximum. Le logo est affiché dans l’espace
            agent et sur les documents générés.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex size-20 items-center justify-center overflow-hidden rounded-lg border border-dashed border-input bg-muted">
            {logoPreview ? (
              <Image
                src={logoPreview}
                alt={`Logo ${agency.name}`}
                width={80}
                height={80}
                className="size-full object-contain"
                unoptimized
              />
            ) : (
              <span className="text-xs text-muted-foreground">Aucun logo</span>
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
                  <span>Envoi en cours…</span>
                </>
              ) : (
                <>
                  <Upload aria-hidden="true" />
                  <span>{logoPreview ? 'Changer de logo' : 'Ajouter un logo'}</span>
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
      <section className="rounded-xl bg-app-surface-1 p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-app-ink">Paramètres métier</h2>
          <p className="mt-1 text-xs text-app-ink-muted">
            Appliqués par défaut aux nouveaux biens et aux calculs de commission.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <FormInput
            control={control}
            name="commission_rate"
            label="Commission par défaut (%)"
            inputMode="decimal"
            placeholder="5"
          />
          <div>
            <FormSelect
              control={control}
              name="currency"
              label={t('label')}
              options={CURRENCY_OPTIONS}
              placeholder={t('placeholder')}
            />
            <p className="mt-1.5 text-xs text-app-ink-muted">
              {t('preview', { example: formatCurrency(100_000, selectedCurrency) })}
            </p>
            {currencyChanged ? (
              <p
                role="alert"
                className="mt-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900"
              >
                {t('warningOnChange')}
              </p>
            ) : null}
          </div>
          <FormInput
            control={control}
            name="timezone"
            label="Fuseau horaire"
            placeholder="Africa/Dakar"
          />
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              <span>Enregistrement…</span>
            </>
          ) : (
            <span>Enregistrer</span>
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={isSubmitting}
        >
          Annuler
        </Button>
      </div>
    </form>
  );
}
