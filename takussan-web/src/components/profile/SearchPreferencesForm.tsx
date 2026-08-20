'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  PROPERTY_ENUM_NAMESPACES,
  enumLabel,
} from '@/components/property-form/options';
import { propertyTypeValues } from '@/lib/schemas/property';
import {
  useCreateSavedSearchMutation,
  useUpdateSavedSearchMutation,
  type SavedSearch,
  type SavedSearchNotificationFrequency,
} from '@/lib/queries/saved-searches';
import type { PropertyType } from '@/types/property';
import type { ApiError } from '@/lib/api';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

/** La donnée porte la CLÉ ; le libellé est résolu au rendu (patron TCK-286). */
const FREQUENCY_VALUES = ['instant', 'daily', 'weekly'] as const;

const ENABLED_FREQUENCY: SavedSearchNotificationFrequency = 'daily';
const DISABLED_FREQUENCY: SavedSearchNotificationFrequency = 'off';

// Curated residential subset — the form targets locataires, not the full
// property catalog. The remaining types live on /properties for power users.
const PREFERRED_PROPERTY_TYPES: readonly PropertyType[] = [
  'apartment',
  'house',
  'villa',
  'studio',
  'room',
  'land',
];

interface SearchPreferencesFormProps {
  readonly initial: SavedSearch | null;
  readonly emailVerified: boolean;
}

type FormValues = {
  types: ReadonlySet<string>;
  budget: string;
  cities: string;
  alertsEnabled: boolean;
  frequency: SavedSearchNotificationFrequency;
};

function readInitial(initial: SavedSearch | null): FormValues {
  const criteria = (initial?.criteria ?? {}) as Record<string, unknown>;
  const rawTypes = Array.isArray(criteria.type)
    ? (criteria.type as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];
  const rawCities = Array.isArray(criteria.cities)
    ? (criteria.cities as unknown[]).filter((v): v is string => typeof v === 'string')
    : typeof criteria.city === 'string' && criteria.city.length > 0
      ? [criteria.city as string]
      : [];
  const budget =
    typeof criteria.price_max === 'number'
      ? String(criteria.price_max)
      : typeof criteria.price_max === 'string'
        ? criteria.price_max
        : '';
  const freq: SavedSearchNotificationFrequency =
    initial?.notification_frequency &&
    (['off', 'daily', 'weekly', 'instant'] as const).includes(
      initial.notification_frequency,
    )
      ? initial.notification_frequency
      : DISABLED_FREQUENCY;
  return {
    types: new Set(rawTypes),
    budget,
    cities: rawCities.join(', '),
    alertsEnabled: freq !== DISABLED_FREQUENCY,
    frequency: freq === DISABLED_FREQUENCY ? ENABLED_FREQUENCY : freq,
  };
}

function buildCriteria(values: FormValues): Record<string, unknown> {
  const cities = values.cities
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  const budgetNum = values.budget.trim() === '' ? null : Number(values.budget);
  const criteria: Record<string, unknown> = {};
  if (values.types.size > 0) criteria.type = Array.from(values.types);
  if (cities.length > 0) criteria.cities = cities;
  if (typeof budgetNum === 'number' && Number.isFinite(budgetNum) && budgetNum > 0) {
    criteria.price_max = budgetNum;
  }
  return criteria;
}

export function SearchPreferencesForm({
  initial,
  emailVerified,
}: SearchPreferencesFormProps) {
  const t = useTranslations('profile.searchPreferences');
  const tCommon = useTranslations('common.actions');
  // TCK-292 — le vocabulaire des types de bien vient du dictionnaire, pas d'une table locale.
  const tType = useTranslations(PROPERTY_ENUM_NAMESPACES.type);
  const messageErreur = useMessageErreurApi();
  const baseline = useMemo(() => readInitial(initial), [initial]);
  const frequencyOptions = FREQUENCY_VALUES.map((value) => ({
    value,
    label: t(`frequency.${value}`),
  }));
  const [values, setValues] = useState<FormValues>(baseline);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const createMutation = useCreateSavedSearchMutation();
  const updateMutation = useUpdateSavedSearchMutation();
  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  const toggleType = (type: string, next: boolean) => {
    setValues((v) => {
      const out = new Set(v.types);
      if (next) out.add(type);
      else out.delete(type);
      return { ...v, types: out };
    });
  };

  const handleAlertsToggle = (next: boolean) => {
    if (!emailVerified && next) return;
    setValues((v) => ({ ...v, alertsEnabled: next }));
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const criteria = buildCriteria(values);
    const effectiveFreq: SavedSearchNotificationFrequency =
      values.alertsEnabled && emailVerified
        ? values.frequency
        : DISABLED_FREQUENCY;

    try {
      if (initial) {
        await updateMutation.mutateAsync({
          id: initial.id,
          criteria,
          notification_frequency: effectiveFreq,
        });
      } else {
        await createMutation.mutateAsync({
          name: t('defaultName'),
          criteria,
          notification_frequency: effectiveFreq,
        });
      }
      setFeedback({ ok: true, message: t('saved') });
    } catch (err) {
      const apiErr = err as ApiError;
      setFeedback({
        ok: false,
        message: messageErreur(apiErr, t('saveError')),
      });
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} data-testid="search-prefs-form">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <span className="text-xs font-semibold text-app-ink-muted">
            {t('typeLabel')}
          </span>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {PREFERRED_PROPERTY_TYPES.map((type) => {
              const checked = values.types.has(type);
              return (
                <label
                  key={type}
                  className={
                    'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm ' +
                    (checked
                      ? 'border-app-accent bg-app-accent/10 text-app-ink'
                      : 'border-app-surface-3 bg-white text-app-ink-muted')
                  }
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={checked}
                    onChange={(e) => toggleType(type, e.target.checked)}
                    data-testid={`pref-type-${type}`}
                  />
                  <span>{enumLabel(tType, propertyTypeValues, type)}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="space-y-1">
          <label
            htmlFor="pref-budget"
            className="text-xs font-semibold text-app-ink-muted"
          >
            {t('budgetLabel')}
          </label>
          <Input
            id="pref-budget"
            type="number"
            inputMode="numeric"
            min={0}
            value={values.budget}
            onChange={(e) =>
              setValues((v) => ({ ...v, budget: e.target.value }))
            }
            placeholder={t('budgetPlaceholder')}
            data-testid="pref-budget"
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor="pref-cities"
            className="text-xs font-semibold text-app-ink-muted"
          >
            {t('citiesLabel')}
          </label>
          <Input
            id="pref-cities"
            value={values.cities}
            onChange={(e) =>
              setValues((v) => ({ ...v, cities: e.target.value }))
            }
            placeholder={t('citiesPlaceholder')}
            data-testid="pref-cities"
          />
          <p className="text-xs text-app-ink-muted">{t('citiesHint')}</p>
        </div>
      </div>

      <div
        className="flex flex-col gap-2 rounded-md bg-white/60 px-3 py-3 md:flex-row md:items-center md:justify-between md:gap-4"
        data-testid="pref-alerts-block"
      >
        <div>
          <p className="text-sm font-semibold text-app-ink">{t('alertsTitle')}</p>
          {emailVerified ? (
            <p className="text-xs text-app-ink-muted">
              {t('alertsDescription')}
            </p>
          ) : (
            <p className="text-xs text-app-accent" data-testid="pref-alerts-unverified">
              {t('alertsUnverified')}{' '}
              <Link
                href="/auth/verify-email"
                className="font-semibold underline"
              >
                {t('verifyEmailCta')}
              </Link>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              role="switch"
              className="size-4 accent-primary disabled:opacity-60"
              checked={values.alertsEnabled && emailVerified}
              disabled={!emailVerified}
              onChange={(e) => handleAlertsToggle(e.target.checked)}
              aria-label={t('alertsToggleAria')}
              data-testid="pref-alerts-toggle"
            />
            <span className="text-app-ink">
              {values.alertsEnabled && emailVerified ? t('enabled') : t('disabled')}
            </span>
          </label>
          {values.alertsEnabled && emailVerified ? (
            <Select
              value={values.frequency}
              onValueChange={(value) =>
                setValues((v) => ({
                  ...v,
                  frequency: (value ?? v.frequency) as SavedSearchNotificationFrequency,
                }))
              }
              items={frequencyOptions as unknown as Array<{ value: string; label: string }>}
            >
              <SelectTrigger
                aria-label={t('frequencyAria')}
                data-testid="pref-alerts-frequency"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {frequencyOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </div>

      {feedback ? (
        <p
          role={feedback.ok ? 'status' : 'alert'}
          className={
            'text-sm ' + (feedback.ok ? 'text-emerald-700' : 'text-red-600')
          }
          data-testid="pref-feedback"
        >
          {feedback.message}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <Link
          href="/app/saved-searches"
          className="text-xs font-semibold text-app-ink-muted underline-offset-2 hover:underline"
        >
          {t('manageSavedSearches')}
        </Link>
        <Button type="submit" size="sm" disabled={isSubmitting} data-testid="pref-save">
          {isSubmitting ? (
            <Loader2 aria-hidden="true" className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Save aria-hidden="true" className="mr-1 h-4 w-4" />
          )}
          {tCommon('save')}
        </Button>
      </div>
    </form>
  );
}
