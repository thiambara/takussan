'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PROPERTY_TYPE_LABELS } from '@/components/property-form/options';
import {
  useCreateSavedSearchMutation,
  useUpdateSavedSearchMutation,
  type SavedSearch,
  type SavedSearchNotificationFrequency,
} from '@/lib/queries/saved-searches';
import type { PropertyType } from '@/types/property';
import type { ApiError } from '@/lib/api';

const DEFAULT_NAME = 'Mes préférences';
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
  const baseline = useMemo(() => readInitial(initial), [initial]);
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
          name: DEFAULT_NAME,
          criteria,
          notification_frequency: effectiveFreq,
        });
      }
      setFeedback({ ok: true, message: 'Préférences enregistrées.' });
    } catch (err) {
      const apiErr = err as ApiError;
      setFeedback({
        ok: false,
        message: apiErr?.displayMessage ?? 'Échec de la sauvegarde.',
      });
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} data-testid="search-prefs-form">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <span className="text-xs font-semibold text-app-ink-muted">
            Type de bien préféré
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
                  <span>{PROPERTY_TYPE_LABELS[type] ?? type}</span>
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
            Budget max (FCFA)
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
            placeholder="ex: 200000"
            data-testid="pref-budget"
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor="pref-cities"
            className="text-xs font-semibold text-app-ink-muted"
          >
            Villes favorites
          </label>
          <Input
            id="pref-cities"
            value={values.cities}
            onChange={(e) =>
              setValues((v) => ({ ...v, cities: e.target.value }))
            }
            placeholder="Dakar, Saly, Thiès"
            data-testid="pref-cities"
          />
          <p className="text-xs text-app-ink-muted">Séparez les villes par une virgule.</p>
        </div>
      </div>

      <div
        className="flex flex-col gap-2 rounded-md bg-white/60 px-3 py-3 md:flex-row md:items-center md:justify-between md:gap-4"
        data-testid="pref-alerts-block"
      >
        <div>
          <p className="text-sm font-semibold text-app-ink">Alertes email</p>
          {emailVerified ? (
            <p className="text-xs text-app-ink-muted">
              Recevez un email dès qu&apos;un nouveau bien correspond à vos
              critères.
            </p>
          ) : (
            <p className="text-xs text-app-accent" data-testid="pref-alerts-unverified">
              Vérifiez votre adresse email pour activer les alertes.{' '}
              <Link
                href="/auth/verify-email"
                className="font-semibold underline"
              >
                Vérifier mon email
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
              aria-label="Activer les alertes email"
              data-testid="pref-alerts-toggle"
            />
            <span className="text-app-ink">
              {values.alertsEnabled && emailVerified ? 'Activées' : 'Désactivées'}
            </span>
          </label>
          {values.alertsEnabled && emailVerified ? (
            <select
              className="rounded-md border border-app-surface-3 bg-white px-2 py-1 text-sm"
              value={values.frequency}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  frequency: e.target.value as SavedSearchNotificationFrequency,
                }))
              }
              aria-label="Fréquence des alertes"
              data-testid="pref-alerts-frequency"
            >
              <option value="instant">Instantané</option>
              <option value="daily">Quotidien</option>
              <option value="weekly">Hebdomadaire</option>
            </select>
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
          Gérer toutes mes recherches sauvegardées
        </Link>
        <Button type="submit" size="sm" disabled={isSubmitting} data-testid="pref-save">
          {isSubmitting ? (
            <Loader2 aria-hidden="true" className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Save aria-hidden="true" className="mr-1 h-4 w-4" />
          )}
          Enregistrer
        </Button>
      </div>
    </form>
  );
}
