import type { AppNotification } from '@/lib/notifications';

/**
 * TCK-2634 — ce que la cloche et l'historique font des lignes CHARGÉES, sans rien demander à l'API :
 * replier les répétitions, ranger par jour, dire « quand ». Fonctions pures : l'horloge est passée.
 *
 * Le repli ne touche ni le compte des non-lues (`meta`) ni la pagination de l'API : il ne regroupe que
 * ce que la page a déjà reçu.
 */

/** Une ligne seule, ou plusieurs lignes consécutives de même nature repliées en une. */
export type ElementDeLaListe =
  | { readonly type: 'seule'; readonly notification: AppNotification }
  | { readonly type: 'repli'; readonly cle: string; readonly lignes: readonly AppNotification[] };

/**
 * À partir de combien de lignes consécutives on replie. Deux lignes repliées n'épargnent qu'une ligne
 * et cachent la seconde : on les laisse lisibles.
 */
export const SEUIL_DU_REPLI = 3;

/**
 * La nature d'une ligne, pour le repli : son code ; à défaut de code (lignes d'avant TCK-2704, classes
 * qui rendent encore leur texte côté API), le titre que l'API a rendu ET le genre de sa cible — les
 * « Mise en avant terminée » d'avant `boost.ended` se replient entre elles, jamais avec les nouvelles.
 *
 * `null` : la ligne ne se replie jamais. C'est le cas d'une ligne qui attend encore un geste (à traiter
 * ET non lue) — repliée, elle perdrait son verbe sous une ligne qu'on ne déplie pas : l'agent de démo a
 * 15 « Demande de visite » consécutives, dont une non lue au milieu (relevé du 2026-11-12).
 */
export function cleDeRepli(n: AppNotification): string | null {
  if (n.a_traiter && !n.read_at) return null;
  if (n.code) return `code:${n.code}`;
  return `titre:${n.target?.kind ?? ''}:${n.title}`;
}

/** Replie les suites d'au moins `seuil` lignes consécutives de même nature ; l'ordre est gardé. */
export function replier(
  notifications: readonly AppNotification[],
  seuil: number = SEUIL_DU_REPLI,
): ElementDeLaListe[] {
  const elements: ElementDeLaListe[] = [];
  let i = 0;
  while (i < notifications.length) {
    const cle = cleDeRepli(notifications[i]);
    if (cle === null) {
      elements.push({ type: 'seule', notification: notifications[i] });
      i += 1;
      continue;
    }
    let fin = i + 1;
    while (fin < notifications.length && cleDeRepli(notifications[fin]) === cle) fin += 1;
    if (fin - i >= seuil) {
      elements.push({ type: 'repli', cle, lignes: notifications.slice(i, fin) });
    } else {
      for (let k = i; k < fin; k += 1) elements.push({ type: 'seule', notification: notifications[k] });
    }
    i = fin;
  }
  return elements;
}

/** La ligne qui date un élément : la plus récente d'un repli (l'API rend du plus récent au plus ancien). */
export function premiereLigne(element: ElementDeLaListe): AppNotification {
  return element.type === 'seule' ? element.notification : element.lignes[0];
}

export type Jour = 'aujourdhui' | 'hier' | 'semaine' | 'ancien';

/**
 * L'écart en jours de calendrier, jugé à `Africa/Dakar` — le fuseau figé du produit, UTC sans heure
 * d'été : la date ISO en UTC EST la date de Dakar (même règle que `quandDansLaListe`, TCK-2632).
 */
function ecartEnJours(iso: string, maintenant: Date): number {
  const date = new Date(iso);
  const jour = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((jour(maintenant) - jour(date)) / 86_400_000);
}

/** « Aujourd'hui », « Hier », « Cette semaine » (les cinq jours d'avant), « Plus ancien ». */
export function jourDe(iso: string, maintenant: Date): Jour {
  const ecart = ecartEnJours(iso, maintenant);
  if (ecart <= 0) return 'aujourdhui';
  if (ecart === 1) return 'hier';
  if (ecart < 7) return 'semaine';
  return 'ancien';
}

/** Les éléments rangés par jour, dans l'ordre reçu ; un repli va au jour de sa ligne la plus récente. */
export function grouperParJour(
  elements: readonly ElementDeLaListe[],
  maintenant: Date,
): { readonly jour: Jour; readonly elements: ElementDeLaListe[] }[] {
  const groupes: { jour: Jour; elements: ElementDeLaListe[] }[] = [];
  for (const element of elements) {
    const jour = jourDe(premiereLigne(element).created_at, maintenant);
    const dernier = groupes.at(-1);
    if (dernier && dernier.jour === jour) dernier.elements.push(element);
    else groupes.push({ jour, elements: [element] });
  }
  return groupes;
}

/**
 * Les mots de « quand », fournis par l'appelant (`useTextesDuQuand`) : la fonction reste pure, et
 * aucune locale n'y est figée (garde `check-locale-figee`) — les dates passent par `useFormatteurs`.
 */
export interface TextesDuQuand {
  readonly instant: string;
  readonly minutes: (n: number) => string;
  readonly heures: (n: number) => string;
  readonly hier: string;
  /** « sam. 7 nov. » (`semaine`) ou « 3 nov. », l'année en plus quand elle diffère. */
  readonly date: (instant: Date, semaine: boolean, annee: boolean) => string;
}

/**
 * « quand » d'une ligne, comme la maquette : « il y a 5 min », « il y a 2 h » aujourd'hui ; « hier » ;
 * « sam. 7 nov. » dans la semaine ; « 3 nov. » au-delà (l'année si elle diffère).
 */
export function quandRelatif(iso: string, maintenant: Date, textes: TextesDuQuand): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const ecart = ecartEnJours(iso, maintenant);
  // Un autre jour À VENIR (horloge décalée, données de démo datées après aujourd'hui) : sa date, jamais
  // « à l'instant ».
  if (ecart < 0) return textes.date(date, false, date.getUTCFullYear() !== maintenant.getUTCFullYear());
  if (ecart === 0) {
    const minutes = Math.max(0, Math.floor((maintenant.getTime() - date.getTime()) / 60_000));
    if (minutes < 1) return textes.instant;
    if (minutes < 60) return textes.minutes(minutes);
    return textes.heures(Math.floor(minutes / 60));
  }
  if (ecart === 1) return textes.hier;
  return textes.date(date, ecart < 7, date.getUTCFullYear() !== maintenant.getUTCFullYear());
}
