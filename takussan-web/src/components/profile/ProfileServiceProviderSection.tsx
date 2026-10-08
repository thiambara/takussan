'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import {
  AvailabilityGrid,
  slotsFromState,
  stateFromSlots,
  type AvailabilityState,
} from '@/components/service-providers/AvailabilityGrid';
import { TradesMultiSelect } from '@/components/service-providers/TradesMultiSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useMyProfiles } from '@/hooks/useProfiles';
import type { AvailabilitySlot } from '@/lib/service-provider-onboarding';
import type { ApiResponse } from '@/types/api';

type SpSettings = {
  id: number;
  trades: string[];
  intervention_zones: string[];
  hourly_rate: number | string | null;
  visit_fee: number | null;
  available_slots: AvailabilitySlot[];
};

type TradesPatch = Partial<{
  trades: string[];
  intervention_zones: string[];
  hourly_rate: number | null;
  visit_fee: number | null;
}>;

const settingsKey = (id: number) => ['me', 'sp-settings', id] as const;

/**
 * TCK-592 (P16) — la section prestataire du profil : métiers, zones, tarifs, disponibilités, les
 * mêmes contrôles que l'assistant d'inscription, enregistrés UN PAR UN. Ils ne s'éditaient que
 * dans l'assistant, et `PATCH …/trades` effaçait les métiers à chaque édition des zones : l'API
 * n'écrit plus que les clés présentes.
 */
export function ProfileServiceProviderSection() {
  const profiles = useMyProfiles();
  const spId = profiles.data?.data.find((p) => p.type === 'service_provider')?.numeric_id ?? null;
  const settings = useApiQuery<ApiResponse<SpSettings>>(
    settingsKey(spId ?? 0),
    `/api/me/profiles/${spId}`,
    { enabled: spId !== null },
  );

  if (spId === null || !settings.data) return null;

  return <SpSettingsForm key={settings.data.data.id} id={spId} settings={settings.data.data} />;
}

function SpSettingsForm({ id, settings }: { readonly id: number; readonly settings: SpSettings }) {
  const t = useTranslations('profile.serviceProvider');
  const [trades, setTrades] = useState<string[]>(settings.trades);
  const [zones, setZones] = useState(settings.intervention_zones.join(', '));
  const [hourlyRate, setHourlyRate] = useState(settings.hourly_rate !== null ? String(settings.hourly_rate) : '');
  const [visitFee, setVisitFee] = useState(settings.visit_fee !== null ? String(settings.visit_fee) : '');
  const [availability, setAvailability] = useState<AvailabilityState>(() => stateFromSlots(settings.available_slots));

  return (
    <section className="space-y-6 rounded-2xl bg-card p-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <SettingBlock id={id} title={t('trades')} payload={{ trades }}>
        <TradesMultiSelect value={trades} onChange={setTrades} />
      </SettingBlock>

      <SettingBlock
        id={id}
        title={t('zones')}
        payload={{ intervention_zones: zones.split(',').map((z) => z.trim()).filter(Boolean) }}
      >
        <Input
          id="sp-profile-zones"
          aria-label={t('zones')}
          value={zones}
          placeholder={t('zonesPlaceholder')}
          onChange={(e) => setZones(e.target.value)}
        />
      </SettingBlock>

      <SettingBlock
        id={id}
        title={t('rates')}
        payload={{
          hourly_rate: hourlyRate === '' ? null : Number(hourlyRate),
          visit_fee: visitFee === '' ? null : Number(visitFee),
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="sp-profile-hourly" className="mb-1 block text-xs font-semibold text-muted-foreground">
              {t('hourlyRate')}
            </label>
            <Input id="sp-profile-hourly" type="number" min={0} value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} />
          </div>
          <div>
            <label htmlFor="sp-profile-visit" className="mb-1 block text-xs font-semibold text-muted-foreground">
              {t('visitFee')}
            </label>
            <Input id="sp-profile-visit" type="number" min={0} value={visitFee} onChange={(e) => setVisitFee(e.target.value)} />
          </div>
        </div>
      </SettingBlock>

      <SettingBlock
        id={id}
        title={t('availability')}
        path="availability"
        payload={{ available_slots: slotsFromState(availability) }}
      >
        <AvailabilityGrid value={availability} onChange={setAvailability} />
      </SettingBlock>
    </section>
  );
}

/** Un réglage, son bouton, son retour : un échec se voit et la saisie reste. */
function SettingBlock({
  id,
  title,
  payload,
  path = 'trades',
  children,
}: {
  readonly id: number;
  readonly title: string;
  readonly payload: TradesPatch | { available_slots: AvailabilitySlot[] };
  readonly path?: 'trades' | 'availability';
  readonly children: React.ReactNode;
}) {
  const t = useTranslations('profile.serviceProvider');
  const messageErreur = useMessageErreurApi();
  const [saved, setSaved] = useState(false);
  const mutation = useApiMutation<unknown, typeof payload>(
    { path: `/api/me/profiles/${id}/${path}`, method: 'PATCH' },
    { invalidate: [settingsKey(id)] },
  );

  return (
    <div className="space-y-2 border-t border-border pt-4 first-of-type:border-t-0 first-of-type:pt-0">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          disabled={mutation.isPending}
          onClick={() => {
            setSaved(false);
            mutation.mutate(payload, { onSuccess: () => setSaved(true) });
          }}
        >
          {mutation.isPending ? t('saving') : t('save')}
        </Button>
        {saved ? <span role="status" className="text-xs text-muted-foreground">{t('saved')}</span> : null}
        {mutation.isError ? (
          <span role="alert" className="text-xs text-destructive">{messageErreur(mutation.error, t('failed'))}</span>
        ) : null}
      </div>
    </div>
  );
}
