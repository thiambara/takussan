/**
 * Classes de teinte du domaine « état des lieux ».
 *
 * ⚠ Les tables de LIBELLÉS français (`INVENTORY_*_LABEL`) qui vivaient ici ont été retirées par
 * TCK-292 : le texte affiché appartient au front, mais il appartient au DICTIONNAIRE, pas à un
 * module de constantes. Les libellés se résolvent désormais sous `inventory.types.*`,
 * `inventory.status.*`, `inventory.conditions.*` et `inventory.elementStates.*` — la clé étant
 * la valeur d'enum elle-même, un composant écrit `t(`status.${status}`)`.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE `console/StatusBadge` NE SAIT PAS FAIRE POUR CE MODULE — TCK-484
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Il le sait, pour les STATUTS — et c'est pourquoi ils ne sont plus ici.** `draft`,
 * `pending_signature`, `signed`, `disputed` sont un vocabulaire de statuts à quatre valeurs qui
 * tombent une par une sur quatre des cinq tons du DS. Leur table est donc partie dans
 * `INVENTORY_STATUS_TONE` (ci-dessous), qui ne décide plus AUCUNE couleur : elle traduit un
 * statut en TON, et `InventoryStatusBadge` délègue le rendu — la forme de `kyc-components.tsx`.
 * Elle y gagne au passage les alphas du DS (cf. l'avertissement en bas de ce fichier).
 *
 * **Ce qui reste ne sont pas des statuts, et c'est la raison de leur séjour ici :**
 *
 *  · `INVENTORY_TYPE_TONE` — `move_in` / `move_out` sont deux TYPES OPPOSÉS, jamais deux étapes
 *    d'un même cycle. Les cinq tons du DS sont ordonnés par ce qu'un statut VEUT DIRE (rien à
 *    signaler → en cours → réussi → à traiter → échoué) ; une entrée et une sortie ne se rangent
 *    nulle part sur cet axe. Leur donner le même ton effacerait l'opposition que la pastille
 *    existe pour porter, et leur en donner deux au hasard ferait dire à `StatusBadge` qu'une
 *    sortie de bien est un « avertissement ». `--info` et `--primary`, comme au calendrier
 *    (TCK-381).
 *
 *  · `INVENTORY_ELEMENT_STATE_TONE` — quatre CRANS de dégradation d'un objet, pas quatre statuts
 *    d'un dossier. `bon` / `usé` / `endommagé` / `manquant` forment une échelle ordonnée, et le
 *    DS n'a qu'UN jeton d'avertissement : deux des quatre crans doivent le partager. `StatusBadge`
 *    ne publie aucun moyen de dire « le même avertissement, un cran plus haut » — c'est une
 *    propriété de son contrat, pas un oubli (*« un appelant qui aurait besoin d'un sixième ton a
 *    probablement besoin d'une colonne, pas d'une couleur de plus »*).
 *
 * ⚠ **Le cran ne se fait PLUS par l'intensité de l'aplat, et c'est une mesure qui l'a tranché**
 * (TCK-484, AC2). `endommagé` portait `bg-warning/30 text-warning` — le « cran par l'intensité »
 * que ce fichier documentait. Il rend **3,36 à 3,98:1 sur les quatre surfaces des deux thèmes**,
 * sous AA partout, et aucun réglage d'alpha ne le sauve : *sur un aplat de la couleur du texte,
 * monter l'opacité DESCEND le contraste.* Le cran est donc passé sur un canal qui ne porte pas de
 * texte — une bordure pleine, seuil 3:1 (WCAG 1.4.11), mesurée à **4,65:1 contre son propre aplat
 * et davantage contre la surface**. Le libellé, lui, est toujours à côté.
 *
 * ⚠ **Les aplats sont à `/10`, plus à `/15`, depuis TCK-484.** `/15` est l'alpha que TCK-450 a
 * écarté sur mesure dans la console (4,29:1) et qui n'avait jamais quitté ce fichier. Les
 * pastilles d'état des lieux se posent sur `bg-muted` PLEIN — au survol d'`InventoryList:146`, et
 * sur CHAQUE élément d'`InventoryDetail:190` — la pire surface du dépôt pour un aplat translucide.
 *
 * ⚠⚠ **`--primary` n'est pas une encre, et `move_out` en dépend.** `text-primary` échoue AA sur
 * les surfaces de ce module **à tous les alphas, `/0` compris** (3,88:1 en clair sur `bg-muted`,
 * 3,39:1 en sombre). Défaut de JETON, pas d'écran, partagé avec `calendar/event-colors.ts` et
 * `maintenance/labels.ts` : il a son ticket, et il ne se corrige pas ici. *Aucun alpha d'aplat ne
 * rattrape une encre trop claire* (TCK-480).
 */

import type { StatusTone } from '@/components/console/StatusBadge';
import type {
  InventoryElementState,
  InventoryStatus,
  InventoryType,
} from '@/types/inventory';

/**
 * Les statuts d'état des lieux — une table de TONS, plus une table de couleurs.
 *
 * Elle ne cite aucune classe : `InventoryStatusBadge` passe le ton à `StatusBadge`, qui décide.
 * C'est la seule forme qui empêche l'alpha de dériver — la table précédente portait
 * `bg-success/15` là où le DS était passé à `/10` neuf jours plus tôt, sans que rien ne puisse
 * le dire.
 */
export const INVENTORY_STATUS_TONE: Record<InventoryStatus, StatusTone> = {
  draft: 'neutral',
  pending_signature: 'attention',
  signed: 'success',
  disputed: 'danger',
};

export function inventoryStatusTone(status: InventoryStatus): StatusTone {
  return INVENTORY_STATUS_TONE[status] ?? 'neutral';
}

/**
 * ⚠ TCK-381 — `move_in` et `move_out` sont deux TYPES opposés, jamais deux statuts : leur donner
 * le même ton aurait effacé l'opposition que la pastille existe pour porter. `--info` et
 * `--primary`, comme au calendrier.
 */
const TYPE_TONE: Record<InventoryType, string> = {
  move_in: 'bg-info/10 text-info',
  move_out: 'bg-primary/12 text-primary',
};

export function inventoryTypeBadgeClass(type: InventoryType): string {
  return TYPE_TONE[type] ?? 'bg-muted text-muted-foreground';
}

/**
 * Les quatre crans de dégradation. `usé` et `endommagé` partagent le seul jeton d'avertissement
 * du DS ; ce qui les sépare est la BORDURE, pas l'opacité — cf. l'avertissement en tête.
 */
const ELEMENT_STATE_TONE: Record<InventoryElementState, string> = {
  bon: 'bg-success/10 text-success',
  'usé': 'bg-warning/10 text-warning',
  'endommagé': 'bg-warning/10 text-warning border-warning',
  manquant: 'bg-destructive/10 text-destructive',
};

export function inventoryElementStateBadgeClass(state: InventoryElementState): string {
  return ELEMENT_STATE_TONE[state] ?? 'bg-muted text-muted-foreground';
}
