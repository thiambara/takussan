'use client';

import { useId, useState } from 'react';
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
import { PiedDEnregistrement } from '@/components/profile/sommaire/PiedDEnregistrement';
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
 * mêmes contrôles que l'assistant d'inscription. Ils ne s'éditaient que
 * dans l'assistant, et `PATCH …/trades` effaçait les métiers à chaque édition des zones : l'API
 * n'écrit plus que les clés présentes. Enregistrés UN PAR UN jusqu'à TCK-2635 : un seul bouton depuis.
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

/** Les zones telles que la saisie les envoie : séparées par des virgules, sans vide. */
function zonesSaisies(saisie: string): string[] {
  return saisie.split(',').map((z) => z.trim()).filter(Boolean);
}

function memesListes(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

/** Un tarif saisi tel que l'API le reçoit : vide = `null`. */
function tarif(saisie: string): number | null {
  return saisie === '' ? null : Number(saisie);
}

function tarifEnregistre(valeur: number | string | null): number | null {
  return valeur === null ? null : Number(valeur);
}

/**
 * TCK-2635 — UN formulaire, UN « Enregistrer » (il y en avait un par réglage, quatre à l'écran) :
 * les mêmes contrôles, et à l'enregistrement les mêmes routes — `PATCH …/trades` ne reçoit que les
 * clés modifiées (métiers, zones, tarifs ; l'API n'écrit que les clés présentes), `PATCH
 * …/availability` part seulement si les disponibilités ont changé.
 */
function SpSettingsForm({ id, settings }: { readonly id: number; readonly settings: SpSettings }) {
  const t = useTranslations('profile.serviceProvider');
  const idFormulaire = useId();
  const messageErreur = useMessageErreurApi();
  const [trades, setTrades] = useState<string[]>(settings.trades);
  const [zones, setZones] = useState(settings.intervention_zones.join(', '));
  const [hourlyRate, setHourlyRate] = useState(settings.hourly_rate !== null ? String(settings.hourly_rate) : '');
  const [visitFee, setVisitFee] = useState(settings.visit_fee !== null ? String(settings.visit_fee) : '');
  const [availability, setAvailability] = useState<AvailabilityState>(() => stateFromSlots(settings.available_slots));
  const [saved, setSaved] = useState(false);

  const metiers = useApiMutation<unknown, TradesPatch>(
    { path: `/api/me/profiles/${id}/trades`, method: 'PATCH' },
    { invalidate: [settingsKey(id)] },
  );
  const disponibilites = useApiMutation<unknown, { available_slots: AvailabilitySlot[] }>(
    { path: `/api/me/profiles/${id}/availability`, method: 'PATCH' },
    { invalidate: [settingsKey(id)] },
  );

  const creneaux = slotsFromState(availability);
  const patch: TradesPatch = {};
  if (!memesListes(trades, settings.trades)) patch.trades = trades;
  if (!memesListes(zonesSaisies(zones), settings.intervention_zones)) patch.intervention_zones = zonesSaisies(zones);
  const tarifsModifies =
    tarif(hourlyRate) !== tarifEnregistre(settings.hourly_rate) || tarif(visitFee) !== tarifEnregistre(settings.visit_fee);
  if (tarifsModifies) {
    patch.hourly_rate = tarif(hourlyRate);
    patch.visit_fee = tarif(visitFee);
  }
  const disponibilitesModifiees =
    JSON.stringify(creneaux) !== JSON.stringify(slotsFromState(stateFromSlots(settings.available_slots)));
  const modifications =
    Number('trades' in patch) + Number('intervention_zones' in patch) + Number(tarifsModifies) + Number(disponibilitesModifiees);
  const enCours = metiers.isPending || disponibilites.isPending;
  const erreur = metiers.error ?? disponibilites.error;

  async function enregistrer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaved(false);
    metiers.reset();
    disponibilites.reset();
    try {
      if (Object.keys(patch).length > 0) await metiers.mutateAsync(patch);
      if (disponibilitesModifiees) await disponibilites.mutateAsync({ available_slots: creneaux });
      setSaved(true);
    } catch {
      // L'échec se lit sur la mutation (`erreur`) ; la saisie reste.
    }
  }

  return (
    // TCK-2635 — à nu sous le titre de la section (« Profil professionnel » et son aide) ; le titre de la
    // carte d'avant reste pour l'assistance.
    <section aria-label={t('title')}>
      <form id={idFormulaire} onSubmit={(e) => void enregistrer(e)} className="space-y-6">
        <SettingBlock title={t('trades')}>
          <TradesMultiSelect value={trades} onChange={setTrades} />
        </SettingBlock>

        <SettingBlock title={t('zones')}>
          <Input
            id="sp-profile-zones"
            aria-label={t('zones')}
            value={zones}
            placeholder={t('zonesPlaceholder')}
            onChange={(e) => setZones(e.target.value)}
          />
        </SettingBlock>

        <SettingBlock title={t('rates')}>
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

        <SettingBlock title={t('availability')}>
          <AvailabilityGrid value={availability} onChange={setAvailability} />
        </SettingBlock>

        <PiedDEnregistrement
          modifications={modifications}
          bouton={
            <Button type="submit" form={idFormulaire} disabled={enCours || modifications === 0}>
              {enCours ? t('saving') : t('save')}
            </Button>
          }
        >
          {saved && modifications === 0 ? <span role="status" className="text-xs text-muted-foreground">{t('saved')}</span> : null}
          {erreur ? <span role="alert" className="text-xs text-destructive">{messageErreur(erreur, t('failed'))}</span> : null}
        </PiedDEnregistrement>
      </form>
    </section>
  );
}

/** Un réglage et son titre ; l'enregistrement est celui du formulaire entier. */
function SettingBlock({ title, children }: { readonly title: string; readonly children: React.ReactNode }) {
  return (
    <div className="space-y-2 border-t border-border pt-4 first-of-type:border-t-0 first-of-type:pt-0">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}
