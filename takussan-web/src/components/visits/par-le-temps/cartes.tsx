'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronDown, ChevronRight, Footprints, Hourglass, KeyRound, Layers, ThumbsDown, ThumbsUp, Video } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Vignette } from '@/components/visits/planification/PiecesDeLaPlanification';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { initiales } from '@/lib/fiche-publique';
import { ecartAuDebut, jourADakar } from '@/lib/visites/par-le-temps';
import { etiquetteDuJour } from '@/lib/visites/planification';
import { decalerJour } from '@/lib/jour-de-l-api';
import type { Verdict } from '@/lib/visites/compte-rendu';
import { cn } from '@/lib/utils';
import type { PropertyVisit, VisitType } from '@/types/visit';

import {
  Adresse,
  bienEtQuartier,
  CARTE,
  GesteItineraire,
  GestesDuVisiteur,
  type EtatDesHeures,
  type HeureProposee,
  nomDuVisiteur,
  TuileDate,
  useDureeEnClair,
  useHeuresProposees,
} from './pieces';

/** Les gestes d'une carte : la page les porte (mutations, navigation, retours). `null` : lecture seule. */
export interface GestesDesCartes {
  readonly onConfirmer: (v: PropertyVisit, heure: HeureProposee) => void;
  readonly onVerdict: (v: PropertyVisit, verdict: Verdict) => void;
  readonly onAbsent: (v: PropertyVisit) => void;
  /** La visite dont un geste est en cours. */
  readonly enCours: number | null;
}

function useLecture(v: PropertyVisit) {
  const t = useTranslations('visits.parLeTemps');
  const tVisits = useTranslations('visits');
  const nom = nomDuVisiteur(v) ?? t('visiteur');
  const n = v.visitor_display?.visits_on_property ?? null;
  return {
    nom,
    rang: n ? t('rang', { n }) : null,
    bien: bienEtQuartier(v, tVisits('fallbackTitle', { id: String(v.id) })),
    titre: v.property?.title?.trim() || tVisits('fallbackTitle', { id: String(v.id) }),
  };
}

function Monogramme({ nom }: { readonly nom: string }) {
  return (
    <span className="inline-flex size-10 flex-none items-center justify-center rounded-full bg-secondary text-sm font-semibold text-primary-deep" aria-hidden="true">
      {initiales(nom)}
    </span>
  );
}

const ICONES_DE_TYPE: Record<VisitType, typeof Footprints> = { in_person: Footprints, virtual: Video, self_guided: KeyRound, hybrid: Layers };

export function TypeDeVisite({ type, className }: { readonly type: VisitType; readonly className?: string }) {
  const t = useTranslations('visits');
  const I = ICONES_DE_TYPE[type];
  return (
    <span className={cn('inline-flex flex-none items-center gap-1 text-ui whitespace-nowrap text-muted-foreground', className)}>
      <I className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
      {t(`type.${type}`)}
    </span>
  );
}

/* ───────────────────────────── Aujourd'hui ───────────────────────────── */

/** La prochaine visite : la seule carte à photo de l'écran, et le seul bouton plein (« Itinéraire »). */
export function CarteProchaine({ v, maintenant }: { readonly v: PropertyVisit; readonly maintenant: Date }) {
  const t = useTranslations('visits.parLeTemps');
  const tVisits = useTranslations('visits');
  const f = useFormatteurs();
  const duree = useDureeEnClair();
  const l = useLecture(v);
  const ecart = v.scheduled_at ? ecartAuDebut(v.scheduled_at, maintenant) : null;
  return (
    <article data-slot="carte-prochaine" className={cn(CARTE, 'overflow-hidden shadow-carte-levee')}>
      <Link href={`/app/visits/${v.id}`} className="relative block h-32 bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring" aria-label={l.titre}>
        {v.property?.cover_url ? <Image src={v.property.cover_url} alt="" fill sizes="(width >= 48rem) 40rem, 100vw" className="object-cover" /> : null}
        {ecart ? (
          <span className="absolute top-3 left-3 inline-flex h-7 items-center gap-1.5 rounded-full bg-card px-2.5 text-ui font-semibold text-foreground">
            <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
            {t(ecart.sens, { duree: duree(ecart.minutes) })}
          </span>
        ) : null}
      </Link>
      <div className="p-4">
        <div className="flex items-baseline gap-3">
          <p className="font-display text-affiche-40 leading-none font-semibold tracking-titre tabular-nums text-foreground">{f.heure(v.scheduled_at)}</p>
          <p className="text-sm text-muted-foreground">
            {duree(v.duration_minutes ?? 30)} · {tVisits(`type.${v.type ?? 'in_person'}`).toLocaleLowerCase()}
          </p>
        </div>
        <p className="mt-3 text-titre-court leading-snug font-semibold text-foreground">
          <Link href={`/app/visits/${v.id}`} className="outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring">
            {l.titre}
          </Link>
        </p>
        <Adresse v={v} className="mt-1" />

        <div className="mt-4 flex items-center gap-3 border-t border-border/70 pt-4">
          <Monogramme nom={l.nom} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-corps font-semibold text-foreground">{l.nom}</p>
            {l.rang ? <p className="truncate text-sm text-muted-foreground">{l.rang}</p> : null}
          </div>
          <GestesDuVisiteur v={v} nom={l.nom} bien={l.titre} />
        </div>

        <GesteItineraire v={v} plein className="mt-4 w-full" />
      </div>
    </article>
  );
}

/** Une autre visite du jour : la même lecture (heure, bien, adresse, visiteur), en plus bas. */
export function CarteDuJour({ v }: { readonly v: PropertyVisit }) {
  const f = useFormatteurs();
  const duree = useDureeEnClair();
  const l = useLecture(v);
  return (
    <article data-slot="carte-du-jour" className={cn(CARTE, 'p-4')}>
      <div className="flex gap-3">
        <div className="w-15 flex-none">
          <p className="font-display text-affiche-22 leading-none font-semibold tracking-titre tabular-nums text-foreground">{f.heure(v.scheduled_at)}</p>
          <p className="mt-1.5 text-ui text-muted-foreground">{duree(v.duration_minutes ?? 30)}</p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base leading-snug font-semibold text-foreground">
            <Link href={`/app/visits/${v.id}`} className="outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring">
              {l.titre}
            </Link>
          </p>
          <Adresse v={v} className="mt-0.5" />
          <p className="mt-1.5 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{l.nom}</span>
            {l.rang ? ` · ${l.rang}` : null}
          </p>
        </div>
      </div>
      <div className="mt-3.5 flex gap-2">
        <GesteItineraire v={v} className="flex-1" />
        <GestesDuVisiteur v={v} nom={l.nom} bien={l.titre} />
      </div>
    </article>
  );
}

/* ───────────────────────────── À clore ───────────────────────────── */

const VERDICTS: readonly { readonly verdict: Verdict; readonly icone: typeof ThumbsUp }[] = [
  { verdict: 'interested', icone: ThumbsUp },
  { verdict: 'thinking', icone: Hourglass },
  { verdict: 'not_interested', icone: ThumbsDown },
];

/** « hier à 16:00 », « aujourd'hui à 10:57 », « 3 nov. à 09:30 ». */
function useQuandRelatif() {
  const t = useTranslations('visits.parLeTemps');
  const f = useFormatteurs();
  return (iso: string, maintenant: Date) => {
    const jour = jourADakar(new Date(iso));
    const aujourdhui = jourADakar(maintenant);
    const nomDuJour =
      jour === aujourdhui ? t('jourRelatif.today') : jour === decalerJour(aujourdhui, -1) ? t('jourRelatif.yesterday') : f.jourMois(iso, maintenant);
    return t('quandRelatif', { jour: nomDuJour, heure: f.heure(iso) });
  };
}

/**
 * À clore : le verdict se donne depuis la liste (décision 2a de TCK-2587) — Intéressé, À réfléchir,
 * Pas intéressé ; « n'est pas venu » pour une visite confirmée dont l'heure est passée (une visite
 * déjà terminée sans compte rendu ne se déclare plus absente) ; « Compte rendu › » ouvre la fiche.
 */
export function CarteAClore({ v, maintenant, gestes }: { readonly v: PropertyVisit; readonly maintenant: Date; readonly gestes: GestesDesCartes | null }) {
  const t = useTranslations('visits.parLeTemps');
  const tCr = useTranslations('compteRendu');
  const quand = useQuandRelatif();
  const l = useLecture(v);
  const prenom = (v.customer?.first_name?.trim() || l.nom.split(/\s+/)[0]) ?? '';
  const enCours = gestes?.enCours === v.id;
  return (
    <article data-slot="carte-a-clore" className="rounded-2xl bg-secondary/70 p-4">
      <div className="flex items-center gap-3">
        <Vignette src={v.property?.cover_url} className="size-12 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-corps leading-snug font-semibold text-foreground">{l.bien}</p>
          <p className="text-sm text-encre-douce">
            {l.nom}
            {v.scheduled_at ? ` · ${quand(v.scheduled_at, maintenant)}` : null}
          </p>
        </div>
      </div>
      {gestes ? (
        <>
          <p className="mt-4 text-corps font-medium text-foreground">{tCr('question')}</p>
          <div className="mt-2.5 grid grid-cols-3 gap-2">
            {VERDICTS.map(({ verdict, icone: I }) => (
              <button
                key={verdict}
                type="button"
                disabled={enCours}
                onClick={() => gestes.onVerdict(v, verdict)}
                data-verdict={verdict}
                className="flex h-17 flex-col items-center justify-center gap-1.5 rounded-xl bg-card text-ui font-medium text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-60"
              >
                <I className="size-5 text-encre-douce" strokeWidth={1.75} aria-hidden="true" />
                {tCr(`verdicts.${verdict}`)}
              </button>
            ))}
          </div>
          <div className="-mb-2 mt-1 flex items-center justify-between">
            {v.status === 'confirmed' ? (
              <button
                type="button"
                disabled={enCours}
                onClick={() => gestes.onAbsent(v)}
                className="inline-flex h-11 items-center rounded-md text-sm font-medium text-encre-douce outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-60"
              >
                {prenom ? t('pasVenu', { prenom }) : t('pasVenuSansNom')}
              </button>
            ) : (
              <span />
            )}
            <Link
              href={`/app/visits/${v.id}?etape=compte-rendu`}
              className="inline-flex h-11 items-center gap-0.5 rounded-md text-sm font-medium text-primary-deep outline-none focus-visible:ring-3 focus-visible:ring-ring"
            >
              {t('compteRendu')}
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </>
      ) : null}
    </article>
  );
}

/* ───────────────────────────── À confirmer ───────────────────────────── */

/** « Mer. 11 » → tuile « MER. » / « 11 ». */
export function useTuileDuJour() {
  const f = useFormatteurs();
  return (iso: string) => {
    const [nom, quantieme] = etiquetteDuJour(jourADakar(new Date(iso)), f.locale).split(' ');
    return { nom, quantieme };
  };
}

/** Une demande : la date en tuile, la tranche ou l'heure, et « Confirmer » sur la carte même. */
export function CarteDemande({ v, gestes }: { readonly v: PropertyVisit; readonly gestes: GestesDesCartes | null }) {
  const t = useTranslations('visits.parLeTemps');
  const f = useFormatteurs();
  const duree = useDureeEnClair();
  const tuile = useTuileDuJour();
  const l = useLecture(v);
  const proposees = useHeuresProposees(v, (iso) => f.heure(iso), gestes !== null);
  const tranche = v.preferred_window ?? null;
  const date = v.scheduled_at ? tuile(v.scheduled_at) : null;
  const enCours = gestes?.enCours === v.id;
  return (
    <li data-slot="carte-demande" className={CARTE}>
      <div className="flex gap-3 p-4 pb-3.5">
        {date ? <TuileDate {...date} /> : null}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm">
            {tranche ? (
              <span className="font-semibold text-warning">{t('heureAFixer', { tranche: t(`tranches.${tranche}`) })}</span>
            ) : (
              <>
                <span className="font-semibold tabular-nums text-foreground">{f.heure(v.scheduled_at)}</span>
                <span className="text-muted-foreground">{duree(v.duration_minutes ?? 30)}</span>
              </>
            )}
            {v.type && v.type !== 'in_person' ? <TypeDeVisite type={v.type} className="ml-auto" /> : null}
          </p>
          <p className="mt-1 text-base leading-snug font-semibold text-foreground">
            <Link href={`/app/visits/${v.id}`} className="outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring">
              {l.bien}
            </Link>
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {l.nom}
            {l.rang ? ` · ${l.rang}` : null}
          </p>
        </div>
      </div>
      {v.notes?.trim() ? (
        <p className="mx-4 mb-3.5 border-l-2 border-primary/40 pl-3 text-sm leading-relaxed text-encre-douce">« {v.notes.trim()} »</p>
      ) : null}
      {gestes ? (
        <div className="flex items-center border-t border-border/70 py-2 pr-2.5 pl-2">
          <Link
            href={`/app/visits/${v.id}?heure=autre`}
            className="inline-flex h-11 items-center rounded-md px-2 text-sm font-medium text-encre-douce outline-none focus-visible:ring-3 focus-visible:ring-ring"
          >
            {t('autreHeure')}
          </Link>
          <ConfirmerALHeure v={v} proposees={proposees.heures} etat={proposees.etat} enCours={enCours} onConfirmer={gestes.onConfirmer} />
        </div>
      ) : null}
    </li>
  );
}

/**
 * « Confirmer 15:00 » : l'heure proposée en un geste ; pour une tranche, le chevron ouvre les autres
 * heures libres. Sans heure libre dans la tranche, rien ne se confirme ici : « Autre heure ».
 */
export function ConfirmerALHeure({
  v,
  proposees,
  etat,
  enCours,
  onConfirmer,
  taille = 'carte',
}: {
  readonly v: PropertyVisit;
  readonly proposees: readonly HeureProposee[];
  readonly etat: EtatDesHeures;
  readonly enCours: boolean;
  readonly onConfirmer: (v: PropertyVisit, heure: HeureProposee) => void;
  readonly taille?: 'carte' | 'table';
}) {
  const t = useTranslations('visits.parLeTemps');
  const [ouvert, setOuvert] = useState(false);
  const premiere = proposees[0] ?? null;
  const autres = proposees.slice(1);
  const pilule =
    taille === 'carte'
      ? 'ml-auto inline-flex h-11 items-stretch overflow-hidden rounded-lg bg-primary/10 text-sm font-semibold text-primary-deep'
      : 'inline-flex h-8 items-stretch overflow-hidden rounded-lg border border-border bg-card text-sm font-medium text-foreground';
  if (etat === 'agent-indisponible') {
    // Suivi du lot A : l'agent de la visite est parti ou suspendu — dit, sans heures de repli.
    return (
      <span role="status" data-slot="agent-indisponible" className={cn(taille === 'carte' ? 'ml-auto min-w-0 px-2 text-right' : '', 'text-ui font-medium text-warning')}>
        {t('agentIndisponible')}
      </span>
    );
  }
  if (etat === 'aucune' || (etat === 'charge' && !premiere)) {
    return <span className={cn(taille === 'carte' ? 'ml-auto px-2' : '', 'text-ui text-muted-foreground')}>{t('aucuneHeureLibre')}</span>;
  }
  return (
    <span className={pilule} data-slot="confirmer-a-l-heure">
      <button
        type="button"
        disabled={!premiere || enCours}
        onClick={() => premiere && onConfirmer(v, premiere)}
        className={cn(
          'inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-60',
          taille === 'carte' ? 'pr-2 pl-3.5' : 'px-3',
          autres.length === 0 && (taille === 'carte' ? 'pr-3.5' : 'pr-3'),
        )}
      >
        {taille === 'carte' ? <Check className="size-4" aria-hidden="true" /> : null}
        {premiere ? t('confirmerA', { heure: premiere.label }) : t('confirmer')}
      </button>
      {autres.length > 0 ? (
        <Popover open={ouvert} onOpenChange={setOuvert}>
          <PopoverTrigger
            aria-label={t('autresHeures')}
            disabled={enCours}
            className={cn('inline-flex items-center outline-none focus-visible:ring-3 focus-visible:ring-ring', taille === 'carte' ? 'pr-3 pl-0.5' : 'pr-2 pl-0.5')}
          >
            <ChevronDown className="size-4 opacity-70" aria-hidden="true" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-48 p-1">
            <p className="px-2.5 py-1.5 text-ui text-muted-foreground">{t('autresHeures')}</p>
            {autres.map((h) => (
              <button
                key={h.label}
                type="button"
                onClick={() => {
                  setOuvert(false);
                  onConfirmer(v, h);
                }}
                className="flex min-h-9 w-full items-center rounded-md px-2.5 text-left text-sm tabular-nums outline-none hover:bg-muted focus-visible:bg-muted"
              >
                {t('confirmerA', { heure: h.label })}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      ) : null}
    </span>
  );
}

/* ───────────────────────────── Plus tard ───────────────────────────── */

export function LignePlusTard({ v }: { readonly v: PropertyVisit }) {
  const f = useFormatteurs();
  const tuile = useTuileDuJour();
  const l = useLecture(v);
  const quartier = v.property?.address?.neighborhood?.trim();
  return (
    <li>
      <Link href={`/app/visits/${v.id}`} className="flex items-center gap-3 px-4 py-3 outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset">
        {v.scheduled_at ? <TuileDate {...tuile(v.scheduled_at)} /> : null}
        <div className="min-w-0 flex-1">
          <p className="text-corps leading-snug font-semibold text-foreground">
            <span className="tabular-nums">{f.heure(v.scheduled_at)}</span> <span className="font-medium">· {l.titre}</span>
          </p>
          <p className="mt-0.5 text-sm leading-snug text-muted-foreground">
            {[quartier, [l.nom, l.rang].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
          </p>
        </div>
        <ChevronRight className="size-5 flex-none text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}
