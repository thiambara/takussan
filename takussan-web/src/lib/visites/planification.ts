import { decalerJour, jourDeLApi } from '@/lib/jour-de-l-api';
import { FUSEAU_DES_VISITES } from '@/lib/visites/heure-de-dakar';

/**
 * TCK-2586 — les règles pures de la feuille « Planifier une visite » : les jours proposés en
 * pastilles, le sort de chaque créneau rendu par `GET /api/property-visits/slots`, et le libellé du
 * bouton qui redit le choix.
 *
 * Dakar est à UTC+0 toute l'année : le jour de Dakar EST le jour de l'API (`jourDeLApi`, P230.05),
 * et jamais celui du navigateur — à Paris, entre minuit et une heure, le navigateur a un jour
 * d'avance.
 */

/** Le délai de prévenance du serveur (`VisitSchedulingService::SLOT_LEAD_MINUTES`). */
export const DELAI_DE_PREVENANCE_MINUTES = 30;

/** Aujourd'hui, demain et les trois jours suivants : les pastilles de « Quel jour ? ». */
export function joursProposes(maintenant: Date = new Date()): readonly string[] {
  const aujourdhui = jourDeLApi(maintenant);
  return [0, 1, 2, 3, 4].map((n) => decalerJour(aujourdhui, n));
}

/** Le jour `AAAA-MM-JJ` à midi UTC : une date que tout fuseau proche lit le même jour. */
function midi(jour: string): Date {
  return new Date(`${jour}T12:00:00Z`);
}

function capitaliser(texte: string): string {
  return texte.charAt(0).toLocaleUpperCase() + texte.slice(1);
}

/** « Jeu. 12 » : la pastille d'un jour au-delà de demain. */
export function etiquetteDuJour(jour: string, locale: string): string {
  const jourDeSemaine = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: FUSEAU_DES_VISITES }).format(midi(jour));
  return `${capitaliser(jourDeSemaine)} ${Number(jour.slice(8, 10))}`;
}

/** « jeu. 12 nov. » : le jour dans le bouton qui redit le choix. */
export function jourEnClair(jour: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: FUSEAU_DES_VISITES,
  }).format(midi(jour));
}

/** « Jeudi 12 novembre » : le jour du récapitulatif de succès. */
export function jourEnToutesLettres(jour: string, locale: string): string {
  return capitaliser(
    new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: FUSEAU_DES_VISITES }).format(midi(jour)),
  );
}

export interface CreneauDuServeur {
  /** L'instant UTC du début (`AAAA-MM-JJTHH:MM:SSZ`). */
  readonly start: string;
  /** L'heure murale de Dakar, `HH:MM`. */
  readonly label: string;
  readonly available: boolean;
}

export type SortDuCreneau = 'libre' | 'pris';

export interface CreneauPropose {
  readonly start: string;
  readonly label: string;
  readonly sort: SortDuCreneau;
}

/**
 * Le serveur rend `available: false` pour deux raisons qu'il ne distingue pas : le créneau est pris
 * (une visite confirmée du bien ou de l'agent), ou il part dans moins de trente minutes. La feuille
 * les sépare : une heure passée — ou dans le délai de prévenance — n'est PAS proposée ; une heure
 * prise est montrée, barrée, et ne se choisit pas.
 */
export function creneauxProposes(
  creneaux: readonly CreneauDuServeur[],
  maintenant: Date = new Date(),
): readonly CreneauPropose[] {
  const auPlusTot = maintenant.getTime() + DELAI_DE_PREVENANCE_MINUTES * 60_000;
  return creneaux
    .filter((c) => Date.parse(c.start) >= auPlusTot)
    .map((c) => ({ start: c.start, label: c.label, sort: c.available ? 'libre' : 'pris' }));
}
