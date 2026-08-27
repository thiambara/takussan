import type { ReportPeriod } from '@/types/super-admin';

/**
 * La FENÊTRE d'un rapport — raccourci (`3m` / `6m` / `12m`) ou plage libre (TCK-361).
 *
 * Les deux bornes vont ensemble : l'API refuse une borne seule (`required_with` croisé), car une
 * borne isolée ferait retomber le service sur `period` en silence, servant une série qui n'est
 * pas celle qu'on a demandée.
 */
export type FenetreRapport = {
  period: ReportPeriod;
  startsAt?: string;
  endsAt?: string;
};

/** Vrai quand la fenêtre est une plage libre — ce que `period` seul ne peut pas décrire. */
export function estPlageLibre(fenetre: FenetreRapport): boolean {
  return Boolean(fenetre.startsAt && fenetre.endsAt);
}

/**
 * Paramètres de requête d'une fenêtre. Ce sont EXACTEMENT ceux que l'export reçoit — c'est ce qui
 * fait que le fichier téléchargé correspond à ce qui est à l'écran (AC5).
 */
export function parametresFenetre(fenetre: FenetreRapport): Record<string, string> {
  return estPlageLibre(fenetre)
    ? { starts_at: fenetre.startsAt!, ends_at: fenetre.endsAt! }
    : { period: fenetre.period };
}

type BorneDeSerie = { starts_at: string; ends_at: string };

/** Granularité d'un bucket — la même énumération que celle de l'API (`granularity=`). */
export type GranulariteRapport = 'day' | 'week' | 'month';

/**
 * Fenêtre PRÉCÉDENTE, déduite des bornes que l'API vient de rendre.
 *
 * ⚠ Elle se déduit de la RÉPONSE, jamais du raccourci demandé. `period=12m` ne dit pas quelles
 * dates le serveur a retenues : `bucketsFor` ancre la fenêtre sur son propre `Carbon::now()`, borne
 * les buckets à `endOfDay`, et plafonne à 60 buckets. Recalculer ces dates côté client, c'est
 * inventer une fenêtre voisine de celle qui a réellement été mesurée — et une comparaison décalée
 * d'un jour ne se voit pas à l'écran.
 *
 * ⚠⚠ **Le décalage se compte en BUCKETS, pas en millisecondes**, et c'est la seule forme qui
 * aligne les deux séries. Une fenêtre « de même durée, immédiatement antérieure » traverse les
 * bornes de mois : sur 2026-03-01 → 2026-04-30 (61 jours), elle rendrait 2025-12-30 → 2026-02-28,
 * que le serveur découperait en TROIS buckets mensuels là où la principale en a deux. La
 * comparaison s'aligne par index : deux longueurs différentes la décalent d'un cran, en silence.
 *
 * ⚠⚠⚠ **La GRANULARITÉ est un paramètre, et elle est OBLIGATOIRE.** Elle a d'abord été une
 * précondition écrite en commentaire (« des buckets MENSUELS ») — c'est-à-dire rien : trois buckets
 * JOURNALIERS (2026-03-10/11/12) rendaient `2025-12-01 → 2026-02-28`, soit trois MOIS au lieu de
 * trois jours, une comparaison fausse d'un facteur 30, sans qu'aucune erreur ne soit levée.
 * L'appelant ne pouvait pas se tromper *ce jour-là* parce que les deux passaient `month` ; le jour
 * où un sélecteur de granularité s'ouvre, rien n'aurait rougi. *Une précondition que le typage
 * n'exprime pas n'est pas une précondition, c'est un vœu.*
 *
 * Les libellés de buckets diffèrent donc de la série principale, par construction : c'est ce qu'un
 * graphique de comparaison montre.
 */
export function fenetrePrecedente(
  rows: BorneDeSerie[],
  granularite: GranulariteRapport,
): { starts_at: string; ends_at: string } | null {
  if (rows.length === 0) return null;

  // Lecture TEXTUELLE de `YYYY-MM-DD`, et non `new Date(...)` : les bornes sont émises en
  // `Africa/Dakar`, et les relire dans le fuseau du navigateur peut reculer d'un jour — donc d'un
  // MOIS quand la borne est un premier du mois, ce qu'elle est en granularité mensuelle.
  const premier = /^(\d{4})-(\d{2})-(\d{2})/.exec(rows[0].starts_at);
  if (!premier) return null;

  const annee = Number(premier[1]);
  const mois = Number(premier[2]); // 1-12
  const jour = Number(premier[3]);

  if (granularite === 'month') {
    // `day = 0` rend le DERNIER jour du mois précédent — la veille du premier bucket affiché.
    return {
      starts_at: enDate(new Date(annee, mois - 1 - rows.length, 1)),
      ends_at: enDate(new Date(annee, mois - 1, 0)),
    };
  }

  // Jour et semaine se comptent en jours, et `Date` reporte tout seul les débordements de mois.
  const joursParBucket = granularite === 'week' ? 7 : 1;

  return {
    starts_at: enDate(new Date(annee, mois - 1, jour - rows.length * joursParBucket)),
    ends_at: enDate(new Date(annee, mois - 1, jour - 1)),
  };
}

/** `YYYY-MM-DD` en heure LOCALE — `toISOString()` bascule en UTC et peut reculer d'un jour. */
export function enDate(date: Date): string {
  const mois = String(date.getMonth() + 1).padStart(2, '0');
  const jour = String(date.getDate()).padStart(2, '0');

  return `${date.getFullYear()}-${mois}-${jour}`;
}
