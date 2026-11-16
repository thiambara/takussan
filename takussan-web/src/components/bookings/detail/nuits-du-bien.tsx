'use client';

import { useTranslations } from 'next-intl';

import { Skeleton } from '@/components/ui/skeleton';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { decalerJour } from '@/lib/jour-de-l-api';
import { useNuitsBloqueesDuBien, useSejoursDuBien } from '@/lib/queries/nuits-du-bien';
import { cn } from '@/lib/utils';

import { grilleDuMois } from '../calendrier-des-nuits';
import { CarteDuBureau } from './pieces-du-detail';

/** L'état d'une nuit du mois, vu depuis un séjour. */
export type EtatDeLaNuit = 'ceSejour' | 'autres' | 'bloquee' | 'enAttente' | 'libre';

export interface PlageDeNuits {
  /** `AAAA-MM-JJ`, la première nuit. */
  readonly debut: string;
  /** `AAAA-MM-JJ`, exclusif : le jour du départ (ADR-0041). */
  readonly fin: string;
}

export interface NuitsDuMois {
  /** Chaque jour du mois (`AAAA-MM-JJ`) → l'état de la nuit qui commence ce jour-là. */
  readonly etats: ReadonlyMap<string, EtatDeLaNuit>;
  /** Les nuits que rien n'occupe ni n'attend (une demande en attente n'est pas libre). */
  readonly libres: number;
}

const dans = (jour: string, p: PlageDeNuits) => jour >= p.debut && jour < p.fin;

/**
 * TCK-2877 — les nuits d'un mois, sans React. Une nuit est à ce séjour, sinon à un autre séjour
 * confirmé, sinon bloquée par le bailleur, sinon attendue par une demande en attente, sinon libre.
 * Les plages sont `[début, fin)` : le jour du départ reste libre pour une arrivée (ADR-0041).
 */
export function nuitsDuMois(
  premierDuMois: string,
  ceSejour: PlageDeNuits,
  autres: readonly PlageDeNuits[],
  bloquees: readonly PlageDeNuits[],
  enAttente: readonly PlageDeNuits[],
): NuitsDuMois {
  const etats = new Map<string, EtatDeLaNuit>();
  let libres = 0;
  for (const jour of grilleDuMois(premierDuMois).cases) {
    if (jour === null) continue;
    const etat: EtatDeLaNuit = dans(jour, ceSejour)
      ? 'ceSejour'
      : autres.some((p) => dans(jour, p))
        ? 'autres'
        : bloquees.some((p) => dans(jour, p))
          ? 'bloquee'
          : enAttente.some((p) => dans(jour, p))
            ? 'enAttente'
            : 'libre';
    if (etat === 'libre') libres += 1;
    etats.set(jour, etat);
  }
  return { etats, libres };
}

/**
 * La forme d'une case (maquette `CalendrierNuits`) : ce séjour en plein, les autres en teinte (la
 * teinte du primaire : l'accent est réservé aux badges *featured*), une nuit bloquée barrée, une
 * demande en attente hachurée.
 */
const CASE_DE_LA_NUIT: Readonly<Record<EtatDeLaNuit, string>> = {
  ceSejour: 'bg-primary font-semibold text-primary-foreground',
  autres: 'bg-primary/15',
  bloquee: 'bg-primary/15 line-through opacity-70',
  enAttente: 'border border-dashed border-foreground/30 bg-muted opacity-80',
  libre: '',
};

/** Un lundi quelconque : nommer les jours de la semaine dans la langue de la page. */
const UN_LUNDI = '2026-11-02';

/**
 * TCK-2877 — « Nuits du bien · novembre » (maquette `app-reservations` a, e5, bureau) : le mois de
 * l'arrivée, ce séjour en plein, les autres séjours confirmés en teinte, les demandes en attente
 * hachurées, et les nuits libres comptées. Lecture seule : décider se fait sur la fiche de chacune.
 */
export function NuitsDuBien({
  bookingId,
  propertyId,
  debut,
  fin,
}: {
  readonly bookingId: number;
  readonly propertyId: number;
  readonly debut: string;
  readonly fin: string;
}) {
  const t = useTranslations('bookings.fiche.nuitsDuBien');
  const f = useFormatteurs();
  const premier = `${debut.slice(0, 7)}-01`;
  const grille = grilleDuMois(premier);
  const lendemainDuMois = decalerJour(grille.cases[grille.cases.length - 1]!, 1);
  const sejours = useSejoursDuBien(propertyId);
  const bloquees = useNuitsBloqueesDuBien(propertyId, premier, lendemainDuMois);
  const mois = f.date(premier, { dateStyle: undefined, month: 'long' });

  const plage = (b: { start_date?: string | null; end_date?: string | null }): PlageDeNuits | null =>
    b.start_date && b.end_date ? { debut: b.start_date.slice(0, 10), fin: b.end_date.slice(0, 10) } : null;
  const autres = (sejours.data?.data ?? []).filter((b) => b.id !== bookingId);
  const nuits = nuitsDuMois(
    premier,
    { debut, fin },
    autres.filter((b) => b.status === 'confirmed').map(plage).filter((p): p is PlageDeNuits => p !== null),
    (bloquees.data?.data ?? []).map((u) => ({ debut: u.starts_on.slice(0, 10), fin: u.ends_on.slice(0, 10) })),
    autres.filter((b) => b.status === 'pending').map(plage).filter((p): p is PlageDeNuits => p !== null),
  );
  const avecBloquees = [...nuits.etats.values()].includes('bloquee');

  return (
    <CarteDuBureau titre={t('titre', { mois })}>
      <div data-slot="nuits-du-bien" className="p-4">
        {sejours.isError ? (
          <p className="text-sm text-muted-foreground">{t('erreur')}</p>
        ) : sejours.isLoading ? (
          <Skeleton className="h-56 rounded-lg" />
        ) : (
          <>
            <div className="grid grid-cols-7 text-center text-xs font-medium text-muted-foreground" aria-hidden="true">
              {Array.from({ length: 7 }, (_, i) => (
                <span key={i} className="py-1">
                  {f.date(decalerJour(UN_LUNDI, i), { dateStyle: undefined, weekday: 'narrow' })}
                </span>
              ))}
            </div>
            <ul className="grid grid-cols-7 gap-1">
              {grille.cases.map((jour, i) => {
                if (jour === null) return <li key={`vide-${i}`} aria-hidden="true" />;
                // Une case du calendrier, pas un statut de réservation : sa forme vient de `CASE_DE_LA_NUIT`.
                const occupation = nuits.etats.get(jour) ?? 'libre';
                return (
                  <li
                    key={jour}
                    data-etat={occupation}
                    aria-label={t('jour', { jour: f.date(jour, { dateStyle: undefined, weekday: 'long', day: 'numeric', month: 'long' }), etat: occupation })}
                    className={cn('flex h-9 items-center justify-center rounded-md text-ui tabular-nums', CASE_DE_LA_NUIT[occupation])}
                  >
                    {Number(jour.slice(8, 10))}
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-ui text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-primary" aria-hidden="true" />
                {t('ceSejour')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-primary/15" aria-hidden="true" />
                {t('autres')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm border border-dashed border-foreground/40 bg-muted" aria-hidden="true" />
                {t('enAttente')}
              </span>
              {avecBloquees ? (
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-primary/15 opacity-70" aria-hidden="true" />
                  {t('bloquees')}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-ui text-muted-foreground">{t('libres', { n: nuits.libres })}</p>
          </>
        )}
      </div>
    </CarteDuBureau>
  );
}
