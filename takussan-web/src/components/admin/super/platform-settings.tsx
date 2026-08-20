'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, RotateCcw, Save, TriangleAlert } from 'lucide-react';
import { ErrorState } from '@/components/feedback';
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
import { patchPlatformSettings } from '@/lib/queries/super-admin';
import type { PlatformSetting, PlatformSettingCategory } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

type SettingValue = string | number | string[];
type Draft = Record<string, SettingValue>;

export const categoryOrder: PlatformSettingCategory[] = ['currency', 'format', 'transaction', 'limits'];

/**
 * TCK-292 — la donnée porte la CLÉ, le rendu la résout.
 *
 * La table portait les quatre titres en français. Elle est lue par
 * `app/(super-admin)/super-admin/settings/page.tsx`, qui est un composant : c'est LUI qui résout,
 * via `useTranslations(CATEGORY_TITLE_NAMESPACE)`. Ici ne reste que le nom de l'espace de noms —
 * la clé de chaque catégorie est la catégorie elle-même.
 */
export const CATEGORY_TITLE_NAMESPACE = 'superAdmin.platformSettings.categories' as const;

export function SettingsSection({
  title,
  settings,
}: {
  title: string;
  settings: PlatformSetting[];
}) {
  const t = useTranslations('superAdmin.platformSettings');
  const tCommon = useTranslations('common');
  const messageErreur = useMessageErreurApi();
  const queryClient = useQueryClient();
  const initialDraft = useMemo(
    () => Object.fromEntries(settings.map((setting) => [setting.key, setting.value])) as Draft,
    [settings],
  );
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [error, setError] = useState<string | null>(null);
  const requiresRestart = settings.some((setting) => setting.requires_restart);
  const hasChanges = settings.some((setting) => JSON.stringify(draft[setting.key]) !== JSON.stringify(setting.value));
  const clientError = validateSection(settings, draft, t);

  const mutation = useMutation({
    mutationFn: () => patchPlatformSettings(draft),
    onSuccess: (response) => {
      const category = settings[0]?.category;
      const nextSettings = category ? response.data[category] : null;
      if (nextSettings) {
        setDraft(Object.fromEntries(nextSettings.map((setting) => [setting.key, setting.value])) as Draft);
      }
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'platform-settings'] });
    },
    onError: (err: ApiError) => setError(messageErreur(err)),
  });

  return (
    <section className="rounded-xl bg-white ring-1 ring-stone-200">
      <div className="flex flex-col gap-3 border-b border-stone-200 p-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold text-stone-950">{title}</h2>
          {requiresRestart ? (
            <p className="mt-1 flex items-center gap-2 text-sm text-amber-700">
              <TriangleAlert className="size-4" aria-hidden="true" />
              {t('restartWarning')}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setDraft(initialDraft)}
            disabled={!hasChanges || mutation.isPending}
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            {t('reset')}
          </Button>
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={!hasChanges || mutation.isPending || clientError !== null}
          >
            <Save className="size-4" aria-hidden="true" />
            {tCommon('actions.save')}
          </Button>
        </div>
      </div>

      <div className="divide-y divide-stone-100">
        {settings.map((setting) => (
          <SettingField
            key={setting.key}
            setting={setting}
            value={draft[setting.key]}
            onChange={(value) => setDraft((current) => ({ ...current, [setting.key]: value }))}
          />
        ))}
      </div>

      {clientError || error ? (
        <ErrorState className="m-4" message={clientError ?? error ?? ''} />
      ) : mutation.isSuccess ? (
        <div className="m-4 flex items-center gap-2 rounded-md bg-stone-50 px-3 py-2 text-sm text-stone-700 ring-1 ring-stone-200">
          <Check className="size-4 text-accent" aria-hidden="true" />
          {t('saved')}
        </div>
      ) : null}
    </section>
  );
}

export function SettingField({
  setting,
  value,
  onChange,
}: {
  setting: PlatformSetting;
  value: SettingValue;
  onChange: (value: SettingValue) => void;
}) {
  const t = useTranslations('superAdmin.platformSettings');
  return (
    <div className="grid gap-3 p-4 md:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)_minmax(180px,0.7fr)] md:items-center">
      <div>
        <Label htmlFor={setting.key}>{setting.label}</Label>
        <p className="mt-1 text-sm text-stone-500">{setting.description}</p>
      </div>
      <div>
        {setting.type === 'select' ? (
          <Select
            value={String(value)}
            onValueChange={(next) => {
              if (next !== null) onChange(next);
            }}
            items={(setting.options ?? []).map((option) => ({ value: option, label: option }))}
          >
            <SelectTrigger id={setting.key} className="w-full bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(setting.options ?? []).map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {setting.type === 'multi_select' ? (
          <div className="flex flex-wrap gap-2">
            {(setting.options ?? []).map((option) => {
              const selected = Array.isArray(value) && value.includes(option);
              return (
                <Button
                  key={option}
                  type="button"
                  variant={selected ? 'default' : 'outline'}
                  className={cn('min-w-16', option === 'XOF' && selected && 'cursor-not-allowed')}
                  onClick={() => {
                    if (option === 'XOF' && selected) return;
                    const current = Array.isArray(value) ? value : [];
                    onChange(selected ? current.filter((item) => item !== option) : [...current, option]);
                  }}
                >
                  {option}
                </Button>
              );
            })}
          </div>
        ) : null}

        {setting.type === 'percentage' || setting.type === 'integer' ? (
          <Input
            id={setting.key}
            type="number"
            min={setting.type === 'percentage' ? 0 : 1}
            max={setting.type === 'percentage' ? 100 : undefined}
            step={setting.type === 'percentage' ? 0.01 : 1}
            value={String(value)}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : null}
      </div>
      <p className="text-sm text-stone-500">
        {setting.updated_by
          ? setting.updated_at
            ? t('updatedByOn', {
              name: setting.updated_by.name,
              date: new Date(setting.updated_at).toLocaleDateString('fr-SN'),
            })
            : t('updatedBy', { name: setting.updated_by.name })
          : t('defaultValue')}
      </p>
    </div>
  );
}

function validateSection(
  settings: PlatformSetting[],
  draft: Draft,
  t: (key: string) => string,
): string | null {
  const supportedCurrencies = draft['currency.supported'];
  if (Array.isArray(supportedCurrencies) && !supportedCurrencies.includes('XOF')) {
    return t('errors.xofRequired');
  }

  for (const setting of settings) {
    if (setting.type !== 'percentage') continue;
    const raw = draft[setting.key];
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
      return t('errors.feeRange');
    }
    if (!/^\d+(\.\d{1,2})?$/.test(String(raw))) {
      return t('errors.feeDecimals');
    }
  }

  return null;
}
