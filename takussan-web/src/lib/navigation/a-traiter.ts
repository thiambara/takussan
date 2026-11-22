import type { NavCounterKey } from './types';

/**
 * TCK-2479 (ADR-0089 §5), TCK-2489 (ADR-0090 §3) — ce qui attend la personne : une fonction pure des
 * entrées RENDUES, des compteurs et de la priorité du persona.
 *
 * - Elle ne lit que les entrées que la barre rend, non cadenassées : exactement celles dont le
 *   compteur est sondé (`countersToPoll`, TCK-377). Elle ne demande aucun compteur de plus.
 * - `priorites` est une LISTE BLANCHE et un ORDRE : un compteur que le persona ne cite pas garde son
 *   badge dans le menu, mais n'est pas « à traiter » pour lui (les visites d'un client attendent
 *   l'agence, pas lui).
 * - 0 vaut « rien à traiter » : le chargement et l'erreur arrivent ici déjà ramenés à 0.
 * - Elle ne touche pas au menu : aucune entrée ne change de place selon un compteur.
 */
export interface EntreeComptee {
  readonly href: string;
  readonly counterKey?: NavCounterKey;
  readonly hrefATraiter?: string;
  readonly locked?: boolean;
}

/**
 * TCK-2489 (ADR-0090 §3) — une ligne du bloc « Aujourd'hui », qui remplace la bande de pastilles :
 * libellée par l'action (`nav.sidebar.aujourdhui.lignes.<cle>` : « Messages non lus »…), avec son
 * nombre. Le libellé est une donnée du RENDU : le modèle ne porte que la clé.
 */
export interface LigneAujourdhui {
  readonly cle: NavCounterKey;
  readonly nombre: number;
  /** La page filtrée sur ce qui attend (`hrefATraiter`), sinon la page de l'entrée. */
  readonly href: string;
}

/**
 * Les lignes « Aujourd'hui » : pour chaque clé de `priorites`, DANS CET ORDRE, une ligne si une
 * entrée rendue et non cadenassée la porte ET que son compte est > 0. Toutes, sans coupe : le bloc
 * disparaît quand la liste est vide (tout à zéro). Mêmes règles que la bande « À traiter » de TCK-2479
 * (retirée en TCK-2490), moins sa coupe à quatre pastilles.
 */
export function lignesAujourdhui(
  entrees: readonly EntreeComptee[],
  comptes: Readonly<Partial<Record<NavCounterKey, number>>>,
  priorites: readonly NavCounterKey[],
): readonly LigneAujourdhui[] {
  const lignes: LigneAujourdhui[] = [];
  for (const cle of priorites) {
    const entree = entrees.find((e) => e.counterKey === cle && !e.locked);
    const nombre = comptes[cle] ?? 0;
    if (!entree || !(nombre > 0)) continue;
    lignes.push({ cle, nombre, href: entree.hrefATraiter ?? entree.href });
  }
  return lignes;
}

