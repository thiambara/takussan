'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { decalerJour } from '@/lib/jour-de-l-api';
import { cn } from '@/lib/utils';
import {
  dansLeSejour,
  jourSelectionnable,
  moisAPartirDe,
  nuitPrise,
  type ContexteDuCalendrier,
  type MoisDuCalendrier,
  type SelectionDeNuits,
} from './calendrier-des-nuits';

/** Douze mois : la fenêtre que `availability` rend par défaut (aujourd'hui → +12 mois). */
export const MOIS_DU_CALENDRIER = 12;

/** Un lundi quelconque, pour nommer les jours de la semaine dans la langue de la page. */
const UN_LUNDI = '2026-11-02';

/**
 * Le nom complet de chaque jour (« mardi 1 décembre 2026 »), une fois par langue : le calendrier en
 * peint ~365, et chaque `Intl.DateTimeFormat` se construit — à chaque toucher, sur un téléphone modeste.
 */
const NOMS_DES_JOURS = new Map<string, string>();
function nomDuJour(fmt: ReturnType<typeof useFormatteurs>, jour: string): string {
  const cle = `${fmt.locale}|${jour}`;
  let nom = NOMS_DES_JOURS.get(cle);
  if (nom === undefined) {
    nom = fmt.date(jour, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    NOMS_DES_JOURS.set(cle, nom);
  }
  return nom;
}

interface CalendrierDesNuitsProps {
  readonly selection: SelectionDeNuits;
  readonly contexte: ContexteDuCalendrier;
  readonly onChoisir: (jour: string) => void;
  /**
   * `defilement` : les douze mois l'un sous l'autre (téléphone, plein écran). `pages` : deux mois
   * côte à côte et des flèches (bureau).
   */
  readonly disposition: 'defilement' | 'pages';
  /** Les nuits prises ne sont pas encore connues : rien n'est barré, et rien ne le prétend. */
  readonly enAttente?: boolean;
}

/**
 * TCK-2510 — le calendrier des nuits : les nuits prises barrées et non sélectionnables (sauf comme
 * départ, le jour où un autre séjour arrive), la plage choisie en fond. Les règles vivent dans
 * `calendrier-des-nuits.ts` ; ce composant ne fait que les peindre.
 */
export function CalendrierDesNuits({ selection, contexte, onChoisir, disposition, enAttente = false }: CalendrierDesNuitsProps) {
  const t = useTranslations('bookings.tunnel.calendar');
  const [page, setPage] = useState(0);
  const tous = moisAPartirDe(contexte.aujourdhui, MOIS_DU_CALENDRIER);

  if (disposition === 'defilement') {
    return (
      <div className="space-y-8">
        {tous.map((mois) => (
          <Mois key={mois.cle} mois={mois} selection={selection} contexte={contexte} onChoisir={onChoisir} enAttente={enAttente} />
        ))}
      </div>
    );
  }

  const visibles = tous.slice(page, page + 2);
  return (
    <div className="relative">
      <div className="absolute inset-x-0 top-0 flex justify-between">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          aria-label={t('previous')}
          className="inline-flex size-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:text-muted-foreground disabled:hover:bg-transparent"
        >
          <ChevronLeft className="size-5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => setPage((p) => Math.min(MOIS_DU_CALENDRIER - 2, p + 1))}
          disabled={page >= MOIS_DU_CALENDRIER - 2}
          aria-label={t('next')}
          className="inline-flex size-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:text-muted-foreground disabled:hover:bg-transparent"
        >
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-10">
        {visibles.map((mois) => (
          <Mois
            key={mois.cle}
            mois={mois}
            selection={selection}
            contexte={contexte}
            onChoisir={onChoisir}
            enAttente={enAttente}
            centre
          />
        ))}
      </div>
    </div>
  );
}

interface MoisProps {
  readonly mois: MoisDuCalendrier;
  readonly selection: SelectionDeNuits;
  readonly contexte: ContexteDuCalendrier;
  readonly onChoisir: (jour: string) => void;
  readonly enAttente: boolean;
  readonly centre?: boolean;
}

function Mois({ mois, selection, contexte, onChoisir, enAttente, centre = false }: MoisProps) {
  const t = useTranslations('bookings.tunnel.calendar');
  const fmt = useFormatteurs();
  const nom = fmt.date(mois.premier, { month: 'long', year: 'numeric' });
  const joursDeSemaine = Array.from({ length: 7 }, (_, i) => {
    const jour = decalerJour(UN_LUNDI, i);
    return { court: fmt.date(jour, { weekday: 'narrow' }), long: fmt.date(jour, { weekday: 'long' }) };
  });

  return (
    <section aria-label={nom}>
      <h3 className={cn('font-display text-[17px] font-semibold capitalize leading-11', centre ? 'text-center' : 'px-1')}>{nom}</h3>
      <div className="mt-1 grid grid-cols-7 text-center text-xs text-muted-foreground" aria-hidden>
        {joursDeSemaine.map((j) => (
          <span key={j.long} className="py-1">
            {j.court}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {mois.cases.map((jour, i) => {
          if (jour === null) return <span key={`vide-${i}`} />;
          const pris = !enAttente && nuitPrise(jour, contexte.plages);
          const arrivee = jour === selection.arrivee;
          const depart = jour === selection.depart;
          const dedans = dansLeSejour(jour, selection);
          const plage = selection.arrivee !== null && selection.depart !== null;
          const selectionnable = jourSelectionnable(selection, jour, contexte);
          const libelle = [
            nomDuJour(fmt, jour),
            pris ? t('taken') : null,
            arrivee ? t('arrival') : null,
            depart ? t('departure') : null,
          ]
            .filter(Boolean)
            .join(', ');
          return (
            <span
              key={jour}
              className={cn(
                'relative flex h-11 items-center justify-center',
                dedans && 'bg-secondary',
                plage && arrivee && 'bg-[linear-gradient(to_right,transparent_50%,var(--secondary)_50%)]',
                plage && depart && 'bg-[linear-gradient(to_left,transparent_50%,var(--secondary)_50%)]',
              )}
            >
              <button
                type="button"
                disabled={!selectionnable}
                onClick={() => onChoisir(jour)}
                aria-label={libelle}
                aria-pressed={arrivee || depart}
                data-jour={jour}
                data-pris={pris ? '' : undefined}
                className={cn(
                  'inline-flex size-11 items-center justify-center rounded-full text-[15px] tabular-nums transition-colors',
                  'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring',
                  selectionnable && !arrivee && !depart && 'hover:ring-1 hover:ring-foreground',
                  // Barré : la nuit est prise. Un départ possible ce jour-là reste barré mais actif.
                  pris && !arrivee && !depart && 'text-muted-foreground line-through decoration-1',
                  // Éteint (passé, ou hors des départs possibles) : l'encre atténuée PLEINE — une encre
                  // translucide tombait sous le seuil de contraste (encre-sans-alpha, surface-publique).
                  !selectionnable && !pris && 'text-muted-foreground',
                  // EN DERNIER : `twMerge` (et le lecteur de `surface-publique.contraste`) garde la
                  // dernière encre de la famille — le disque choisi l'emporte sur toute encre atténuée.
                  (arrivee || depart) && 'bg-foreground font-semibold text-background',
                )}
              >
                {Number.parseInt(jour.slice(8), 10)}
              </button>
            </span>
          );
        })}
      </div>
    </section>
  );
}
