import { decalerJour, jourDeLApi } from '@/lib/jour-de-l-api';

/**
 * TCK-2881 — le jour qu'un demandeur a écrit dans sa demande (« Une visite samedi est-elle
 * possible ? »), pour présélectionner « Quel jour ? » de la feuille « Proposer une visite ».
 *
 * Une extraction simple et explicable, sans appel ni IA (décision du ticket) : le PREMIER mot de jour
 * trouvé dans le message — par sa position, pas par l'ordre de la liste —, en français ou en anglais
 * quelle que soit la langue de l'interface (c'est le client qui a écrit). Un nom de jour se résout à sa
 * prochaine occurrence dans les 7 jours, AUJOURD'HUI COMPRIS (« samedi » lu un samedi = ce samedi) ;
 * « aujourd'hui » / « today » = aujourd'hui, « demain » / « tomorrow » = demain, « après-demain » =
 * dans deux jours (sans quoi le « demain » d'« après-demain » serait lu à tort).
 *
 * Le jour se calcule sur le jour de l'API (Dakar est à UTC+0, P230.05), jamais sur `getDay()` du
 * navigateur.
 */

/** Les noms de jour, indexés comme `getUTCDay()` (0 = dimanche). */
const SEMAINE: Readonly<Record<string, number>> = {
  dimanche: 0,
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/** Les jours relatifs : leur décalage depuis aujourd'hui. */
const RELATIFS: Readonly<Record<string, number>> = {
  "aujourd'hui": 0,
  today: 0,
  'après-demain': 2,
  demain: 1,
  tomorrow: 1,
};

// « après-demain » avant « demain » : à la même position, l'alternative la plus longue gagne.
const MOTIF = new RegExp(
  `(?<![\\p{L}\\p{N}-])(aujourd['’]hui|après-demain|${[...Object.keys(SEMAINE), 'demain', 'today', 'tomorrow'].join('|')})(?![\\p{L}\\p{N}])`,
  'iu',
);

export interface JourDuMessage {
  /** Le jour `AAAA-MM-JJ` (Dakar). */
  readonly jour: string;
  /** Le mot tel qu'il se cite (« samedi »), en minuscules. */
  readonly mot: string;
}

export function jourDuMessage(message: string | null | undefined, maintenant: Date = new Date()): JourDuMessage | null {
  if (!message) return null;
  const trouve = MOTIF.exec(message);
  if (!trouve) return null;
  const mot = trouve[1].toLocaleLowerCase('fr');
  const cle = mot.replace('’', "'");
  const aujourdhui = jourDeLApi(maintenant);
  if (cle in RELATIFS) return { jour: decalerJour(aujourdhui, RELATIFS[cle]), mot };
  const cible = SEMAINE[cle];
  if (cible === undefined) return null;
  const jourDeSemaine = new Date(`${aujourdhui}T12:00:00Z`).getUTCDay();
  return { jour: decalerJour(aujourdhui, (cible - jourDeSemaine + 7) % 7), mot };
}
