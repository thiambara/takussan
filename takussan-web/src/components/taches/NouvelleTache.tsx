'use client';

import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { AGENT_CRM_QUERY_KEY, searchTaskables } from '@/lib/queries/agent-crm';
import { useCreerTache, type TacheDeLaPage } from '@/lib/queries/taches';
import { echeanceDeLaDate, echeanceDuChoix, type JourDEcheance } from '@/lib/taches/taches';
import type { AgencyStaffMember, TaskableOption } from '@/types/agent-crm';
import { cn } from '@/lib/utils';
import { ChoixDansUneListe } from './ChoixDansUneListe';

type Genre = 'customer' | 'property';
type Echeance = JourDEcheance | 'date';

export interface EtatDEnvoi {
  readonly pret: boolean;
  readonly enCours: boolean;
  readonly echeance: Echeance;
}

export interface Rattachement {
  readonly type: Genre;
  readonly id: number;
  readonly label: string;
}

const PASTILLE = 'inline-flex h-11 flex-none items-center justify-center whitespace-nowrap rounded-full border px-4 text-sm font-medium has-focus-visible:ring-3 has-focus-visible:ring-ring cursor-pointer';
const ACTIVE = 'border-foreground bg-foreground text-background';
const REPOS = 'border-border bg-card text-foreground hover:bg-muted';

export const ID_FORMULAIRE_NOUVELLE_TACHE = 'nouvelle-tache';

interface NouvelleTacheProps {
  readonly maintenant: Date;
  readonly moi: number | null;
  readonly nomDeMoi: string | null;
  readonly membres: readonly AgencyStaffMember[];
  /** Le rattachement prérempli (on vient d'une fiche, d'une visite ou d'une demande). */
  readonly rattachement?: Rattachement | null;
  readonly onCreee: (tache: TacheDeLaPage) => void;
  /** Le libellé du bouton d'envoi suit l'échéance choisie (« Créer la tâche · demain »). */
  readonly onEtat?: (etat: EtatDEnvoi) => void;
}

/**
 * « Nouvelle tâche » (maquette `FormulaireTache`) : le titre, l'échéance en pastilles (Aujourd'hui ·
 * Demain · Lundi · Date…, et « + Heure »), le client ou le bien à qui la rattacher (recherche dès deux
 * caractères, huit résultats, « Changer »), à qui l'assigner. Sans heure, l'échéance est 09:00 à
 * Dakar, comme un report. Le bouton d'envoi est dans le pied (`form=`), actif avec un titre et une cible.
 */
export function NouvelleTache({ maintenant, moi, nomDeMoi, membres, rattachement, onCreee, onEtat }: NouvelleTacheProps) {
  const t = useTranslations('taches.nouvelle');
  const { token } = useAuth();
  const messageErreur = useMessageErreurApi();
  const creer = useCreerTache();
  const idTitre = useId();
  const idAssigne = useId();
  const idHeure = useId();
  const [titre, setTitre] = useState('');
  const [echeance, setEcheance] = useState<Echeance>('demain');
  const [heure, setHeure] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [genre, setGenre] = useState<Genre>(rattachement?.type ?? 'customer');
  const [cible, setCible] = useState<TaskableOption | null>(rattachement ? { id: rattachement.id, label: rattachement.label } : null);
  const [recherche, setRecherche] = useState('');
  const [differee, setDifferee] = useState('');
  const [assigne, setAssigne] = useState<number | null>(moi);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    const minuteur = setTimeout(() => setDifferee(recherche.trim()), 250);
    return () => clearTimeout(minuteur);
  }, [recherche]);

  const options = useQuery({
    queryKey: AGENT_CRM_QUERY_KEY.taskables(genre, differee),
    queryFn: () => searchTaskables(token ?? '', genre, differee),
    enabled: !!token && differee.length >= 2 && cible === null,
    staleTime: 30_000,
  });

  const instant = echeance === 'date' ? echeanceDeLaDate(date) : echeanceDuChoix(echeance, heure, maintenant);
  const pret = titre.trim() !== '' && cible !== null && (echeance !== 'date' || instant !== null);

  useEffect(() => {
    onEtat?.({ pret, enCours: creer.isPending, echeance });
  }, [onEtat, pret, creer.isPending, echeance]);

  const choixDAssigne = [...(moi !== null ? [{ id: moi, name: nomDeMoi ? t('moiNomme', { nom: nomDeMoi }) : t('moi') }] : []), ...membres.filter((m) => m.id !== moi)];

  return (
    <form
      id={ID_FORMULAIRE_NOUVELLE_TACHE}
      className="space-y-5 pt-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (!pret || cible === null) return;
        setErreur(null);
        creer.mutate(
          { title: titre.trim(), due_at: instant, taskable: { type: genre, id: cible.id }, assigned_to_id: assigne !== null && assigne !== moi ? assigne : null },
          { onSuccess: (r) => onCreee(r.data), onError: (er) => setErreur(messageErreur(er, t('echec'))) },
        );
      }}
    >
      <div>
        <label htmlFor={idTitre} className="mb-1.5 block text-sm font-medium">
          {t('titre')}
        </label>
        <Input id={idTitre} value={titre} onChange={(e) => setTitre(e.target.value)} maxLength={255} placeholder={t('titreExemple')} />
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t('echeance')}</legend>
        <div className="flex flex-wrap gap-2">
          {(['aujourdhui', 'demain', 'lundi', 'date'] as const).map((e) => (
            <label key={e} className={cn(PASTILLE, echeance === e ? ACTIVE : REPOS)}>
              <input type="radio" name="echeance" value={e} checked={echeance === e} onChange={() => setEcheance(e)} className="sr-only" />
              {t(`jour.${e}`)}
            </label>
          ))}
          {echeance !== 'date' && heure === null ? (
            <button type="button" onClick={() => setHeure('09:00')} className={cn(PASTILLE, REPOS, 'border-dashed text-muted-foreground')}>
              {t('ajouterUneHeure')}
            </button>
          ) : null}
        </div>
        {echeance === 'date' ? (
          <div className="mt-3">
            <DateTimePicker value={date} onValueChange={setDate} />
          </div>
        ) : heure !== null ? (
          <div className="mt-3 flex items-center gap-2">
            <label htmlFor={idHeure} className="text-sm text-muted-foreground">
              {t('heure')}
            </label>
            <Input id={idHeure} type="time" value={heure} onChange={(e) => setHeure(e.target.value || null)} className="w-32" />
          </div>
        ) : null}
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">{t('rattacheeA')}</legend>
        {cible ? (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
            {genre === 'customer' ? (
              <UserRound className="size-5 flex-none text-encre-douce" strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <Building2 className="size-5 flex-none text-encre-douce" strokeWidth={1.75} aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-corps font-medium">{cible.label}</span>
              <span className="block text-ui text-muted-foreground">{t(rattachement && rattachement.id === cible.id ? `prerempli.${genre}` : `genre.${genre}`)}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setCible(null);
                setRecherche('');
              }}
              className="h-11 rounded-md px-2 text-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring"
            >
              {t('changer')}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div role="radiogroup" aria-label={t('rattacheeA')} className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {(['customer', 'property'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  role="radio"
                  aria-checked={genre === g}
                  onClick={() => {
                    setGenre(g);
                    setRecherche('');
                  }}
                  className={cn('h-10 rounded-md px-4 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring', genre === g ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                >
                  {t(`un.${g}`)}
                </button>
              ))}
            </div>
            <Input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder={t(`chercher.${genre}`)} aria-label={t(`chercher.${genre}`)} />
            {(options.data ?? []).length > 0 ? (
              <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                {(options.data ?? []).map((o) => (
                  <li key={o.id}>
                    <button type="button" onClick={() => setCible(o)} className="min-h-11 w-full px-3 text-left text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring">
                      {o.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </fieldset>

      {choixDAssigne.length > 1 ? (
        <div>
          <label htmlFor={idAssigne} className="mb-1.5 block text-sm font-medium">
            {t('assigneeA')}
          </label>
          <ChoixDansUneListe
            id={idAssigne}
            valeur={String(assigne ?? '')}
            options={choixDAssigne.map((m) => ({ value: String(m.id), label: m.name }))}
            onChange={(v) => setAssigne(Number.parseInt(v, 10))}
          />
        </div>
      ) : null}

      {erreur ? (
        <p role="alert" className="text-sm text-destructive">
          {erreur}
        </p>
      ) : null}
    </form>
  );
}

/** Le bouton d'envoi du pied : « Créer la tâche · demain ». */
export function EnvoiDeNouvelleTache({ etat }: { readonly etat: EtatDEnvoi }) {
  const t = useTranslations('taches.nouvelle');
  return (
    <Button type="submit" form={ID_FORMULAIRE_NOUVELLE_TACHE} size="lg" className="w-full xl:ml-auto xl:flex xl:w-auto" disabled={!etat.pret || etat.enCours}>
      {etat.echeance === 'date' ? t('creer') : t('creerPour', { jour: t(`pour.${etat.echeance}`) })}
    </Button>
  );
}
