'use client';

import { useId, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2 } from 'lucide-react';

import { DAYS, slotsFromState, stateFromSlots, type AvailabilityState, type DayKey } from '@/components/service-providers/AvailabilityGrid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { spPatchAvailabilityAction, spPatchTradesAction } from '@/app/actions/service-provider-onboarding';
import type { ReglagesDuPrestataire } from '@/lib/service-provider-onboarding';
import { cn } from '@/lib/utils';

/**
 * TCK-2946 — au bureau, l'écran 2 du prestataire invité règle ses tarifs et ses créneaux sans quitter l'écran
 * (maquette `app-entree-assistants`, approche a, « Prestataire : l'intervention », bureau) : « Tarifs » (tarif
 * horaire, frais de visite, en F CFA), « Disponibilités » (Matin / Après-midi × 7 jours) et « Enregistrer mon
 * profil ». Au téléphone, seul le pied reste (« Plus tard ») : les lignes de « Complétez votre profil » mènent au
 * profil.
 *
 * Les MÊMES écritures que `/app/profile/professional` (`ProfileServiceProviderSection`, TCK-2635) : `PATCH …/trades`
 * avec les seules clés de tarif quand elles ont changé (l'API n'écrit que les clés présentes : métiers et zones
 * restent), puis `PATCH …/availability` quand les créneaux ont changé — une seule règle de validation, celle de
 * l'API ; une erreur s'écrit sous son champ.
 *
 * La grille ne montre que le matin et l'après-midi (14 cases) ; le soir déjà réglé dans le profil est GARDÉ à
 * l'envoi (l'état part des créneaux enregistrés, la grille n'en bascule que deux périodes). Un créneau hors gabarit
 * tombe, comme dans le profil (`stateFromSlots`).
 */
interface TarifsEtDisponibilitesProps {
  readonly reglages: ReglagesDuPrestataire;
  /** Ce que l'API a écrit : la liste « Complétez votre profil » se met à jour. */
  readonly onEnregistre: (reglages: ReglagesDuPrestataire) => void;
  /** « Plus tard — aller à mon espace », à côté du bouton au bureau, seul au téléphone. */
  readonly plusTard: ReactNode;
  readonly occupe: boolean;
}

const MOMENTS = ['morning', 'afternoon'] as const;

function saisieDuTarif(valeur: number | string | null): string {
  return valeur === null ? '' : String(Number(valeur));
}

/** Un tarif saisi tel que l'API le reçoit : vide = `null`. */
function tarif(saisie: string): number | null {
  return saisie.trim() === '' ? null : Number(saisie);
}

export function TarifsEtDisponibilites({ reglages, onEnregistre, plusTard, occupe }: TarifsEtDisponibilitesProps) {
  const t = useTranslations('onboarding.invite.prestataire.reglages');
  const tJour = useTranslations('serviceProviders.onboarding.availability.days');
  const id = useId();
  // Ce qui est enregistré : la référence des modifications, remplacée après chaque écriture réussie.
  const [enregistres, setEnregistres] = useState(reglages);
  const [horaire, setHoraire] = useState(saisieDuTarif(reglages.hourly_rate));
  const [visite, setVisite] = useState(saisieDuTarif(reglages.visit_fee));
  const [grille, setGrille] = useState<AvailabilityState>(() => stateFromSlots([...reglages.available_slots]));
  const [envoi, setEnvoi] = useState(false);
  const [erreurs, setErreurs] = useState<Partial<Record<'hourly_rate' | 'visit_fee' | 'available_slots' | 'general', string>>>({});
  const [enregistre, setEnregistre] = useState(false);

  const tarifsModifies =
    tarif(horaire) !== (enregistres.hourly_rate === null ? null : Number(enregistres.hourly_rate)) || tarif(visite) !== enregistres.visit_fee;
  const creneaux = slotsFromState(grille);
  const creneauxModifies = JSON.stringify(creneaux) !== JSON.stringify(slotsFromState(stateFromSlots([...enregistres.available_slots])));
  const modifie = tarifsModifies || creneauxModifies;

  function basculer(jour: DayKey, moment: (typeof MOMENTS)[number]) {
    setEnregistre(false);
    setErreurs((e) => ({ ...e, available_slots: undefined }));
    const actuels = grille[jour] ?? [];
    setGrille({ ...grille, [jour]: actuels.includes(moment) ? actuels.filter((p) => p !== moment) : [...actuels, moment] });
  }

  async function enregistrer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!modifie || envoi) return;
    setEnvoi(true);
    setErreurs({});
    setEnregistre(false);
    try {
      let suivants = enregistres;
      if (tarifsModifies) {
        const payload = { hourly_rate: tarif(horaire), visit_fee: tarif(visite) };
        const res = await spPatchTradesAction(reglages.id, payload);
        if (!res.ok) {
          const surHoraire = res.errors?.hourly_rate?.[0];
          const surVisite = res.errors?.visit_fee?.[0];
          setErreurs(surHoraire || surVisite ? { hourly_rate: surHoraire, visit_fee: surVisite } : { general: res.message });
          return;
        }
        suivants = { ...suivants, ...payload };
        setEnregistres(suivants);
        onEnregistre(suivants);
      }
      if (creneauxModifies) {
        const res = await spPatchAvailabilityAction(reglages.id, creneaux);
        if (!res.ok) {
          const surLesCreneaux = Object.entries(res.errors ?? {}).find(([cle]) => cle.startsWith('available_slots'))?.[1]?.[0];
          setErreurs(surLesCreneaux ? { available_slots: surLesCreneaux } : { general: res.message });
          return;
        }
        suivants = { ...suivants, available_slots: creneaux };
        setEnregistres(suivants);
        onEnregistre(suivants);
      }
      setEnregistre(true);
    } finally {
      setEnvoi(false);
    }
  }

  const champ = (cle: 'hourly_rate' | 'visit_fee', libelle: string, valeur: string, changer: (v: string) => void) => {
    const idChamp = `${id}-${cle}`;
    const erreur = erreurs[cle];
    return (
      <div>
        <label htmlFor={idChamp} className="mb-1.5 block text-sm font-medium">
          {libelle}
        </label>
        <div className="relative">
          <Input
            id={idChamp}
            type="number"
            inputMode="numeric"
            min={0}
            value={valeur}
            onChange={(ev) => {
              setEnregistre(false);
              setErreurs((e) => ({ ...e, [cle]: undefined }));
              changer(ev.target.value);
            }}
            aria-invalid={erreur ? true : undefined}
            aria-describedby={erreur ? `${idChamp}-erreur` : undefined}
            className="pr-16 tabular-nums"
          />
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
            {t('devise')}
          </span>
        </div>
        {erreur ? (
          <p id={`${idChamp}-erreur`} role="alert" data-erreur-du-champ={cle} className="mt-1.5 text-[0.8125rem] text-destructive">
            {erreur}
          </p>
        ) : null}
      </div>
    );
  };

  return (
    <form
      onSubmit={(e) => void enregistrer(e)}
      data-testid="tarifs-et-disponibilites"
      className="lg:mt-4 lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:p-5"
    >
      {/* Au téléphone, les lignes « Tarifs » et « Disponibilités » mènent au profil (AC3) : les champs n'y sont pas dessinés. */}
      <div className="hidden lg:block">
        <div className="flex items-baseline justify-between">
          <h3 className="text-[0.9375rem] font-semibold">{t('tarifs')}</h3>
          <span className="text-[0.8125rem] text-muted-foreground">{t('enFcfa')}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {champ('hourly_rate', t('horaire'), horaire, setHoraire)}
          {champ('visit_fee', t('visite'), visite, setVisite)}
        </div>

        <h3 id={`${id}-dispos`} className="mt-5 text-[0.9375rem] font-semibold">
          {t('disponibilites')}
        </h3>
        <div
          role="group"
          aria-labelledby={`${id}-dispos`}
          aria-describedby={erreurs.available_slots ? `${id}-dispos-erreur` : undefined}
          className="mt-3 grid grid-cols-[auto_repeat(7,minmax(0,1fr))] items-center gap-1.5 text-xs"
        >
          <span />
          {DAYS.map((jour) => (
            <span key={jour} className="text-center text-muted-foreground">
              {t(`jours.${jour}`)}
            </span>
          ))}
          {MOMENTS.map((moment) => (
            <div key={moment} className="contents">
              <span className="pr-2 text-muted-foreground">{t(`moments.${moment}`)}</span>
              {DAYS.map((jour) => {
                const libre = grille[jour]?.includes(moment) ?? false;
                return (
                  <button
                    key={jour}
                    type="button"
                    role="switch"
                    aria-checked={libre}
                    aria-label={t('creneau', { jour: tJour(jour), moment: t(`moments.${moment}`) })}
                    data-creneau={`${jour}-${moment}`}
                    disabled={envoi}
                    onClick={() => basculer(jour, moment)}
                    className={cn(
                      'flex h-8 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring',
                      libre ? 'bg-success/15 text-success' : 'bg-muted text-transparent hover:bg-muted/70',
                    )}
                  >
                    <Check className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        {erreurs.available_slots ? (
          <p id={`${id}-dispos-erreur`} role="alert" data-erreur-du-champ="available_slots" className="mt-1.5 text-[0.8125rem] text-destructive">
            {erreurs.available_slots}
          </p>
        ) : null}
        {erreurs.general ? (
          <p role="alert" className="mt-3 text-[0.8125rem] text-destructive">
            {erreurs.general}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-3 lg:mt-5 lg:justify-start">
        <Button type="submit" variant="sombre" disabled={!modifie || envoi || occupe} className="hidden h-11 rounded-full px-5 lg:inline-flex">
          {envoi ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {envoi ? t('enregistrement') : t('enregistrer')}
        </Button>
        {plusTard}
        {enregistre && !modifie ? (
          <span role="status" className="hidden text-[0.8125rem] text-muted-foreground lg:inline">
            {t('enregistre')}
          </span>
        ) : null}
      </div>
    </form>
  );
}
