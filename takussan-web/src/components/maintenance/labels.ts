/**
 * Tons (classes Tailwind) des enums de maintenance, et la table de décision d'un devis.
 *
 * ⚠ **Les LIBELLÉS ont quitté ce module (TCK-292, lot I).** Ils vivent sous
 * `maintenance.status.*`, `maintenance.priority.*`, `maintenance.category.*` et
 * `maintenance.quote.decisions.*` dans `src/messages/{fr,en,wo}.json`. Ce qui reste ici ne
 * dépend d'aucune langue : des couleurs, et une fonction qui rend une CLÉ — patron « la donnée
 * transporte la clé, le rendu la résout » posé par TCK-286.
 *
 * `src/lib/__tests__/agent-fr-regressions.test.ts` gardait « aucune valeur d'enum technique ne
 * s'affiche » en lisant `MAINTENANCE_PRIORITY_LABEL`. La garde n'a pas disparu : elle s'exerce
 * désormais sur `maintenance.priority` du dictionnaire, devenu la source du libellé — mêmes
 * chaînes attendues, au caractère près.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUE `console/StatusBadge` NE SAIT PAS FAIRE POUR CE MODULE — TCK-484
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Onze statuts, et le DS n'en publie que cinq — mais ce n'est pas le compte qui tranche, c'est
 * ce qu'un des six regroupements VEUT DIRE.** Les cinq tons de `StatusBadge` disent l'issue d'une
 * chose : rien à signaler, en cours, réussi, à traiter, échoué. Une demande `quote_requested` ou
 * `quote_submitted` n'est aucune des cinq : elle n'est ni « en cours » (personne ne travaille) ni
 * « à traiter » par le demandeur (la balle est chez le prestataire, puis chez le bailleur) — c'est
 * une SUSPENSION du cycle, un aiguillage vers un second cycle qui a ses propres statuts. Le DS
 * n'a pas de ton pour ça, et lui en ajouter un pour ce seul domaine ferait de `StatusBadge` la
 * table des statuts du produit, ce que son docblock refuse. `--primary` marque donc cette
 * parenthèse, comme il marque la visite au calendrier et la sortie de bien à l'inventaire.
 *
 * ⚠ **La table des PRIORITÉS est partie, et elle était morte ET fausse — TCK-484.**
 * `PRIORITY_TONE` / `maintenancePriorityBadgeClass()` n'avaient **aucun appelant** (relevé :
 * `grep -rn maintenancePriorityBadgeClass src` → la définition, et rien d'autre), pendant que
 * `MaintenancePriorityBadge.tsx` peignait les priorités depuis une table à lui. Les deux tables
 * se **contredisaient, inversées** : ici `low` était gris et `normal` bleu, là `low` était bleu et
 * `normal` gris. *Un doublon mort ne se contente pas d'être inutile : il rend faux le premier
 * endroit où l'on va lire.* Le badge délègue désormais à `StatusBadge` ; il n'y a plus de table
 * de priorités nulle part.
 *
 * ⚠ **Les aplats sont à `/10`, plus à `/15`, depuis TCK-484.** Les pastilles se posent sur
 * `bg-muted` PLEIN au survol de `MaintenanceList:140` : `bg-success/15` y rendait 4,30:1 et
 * `bg-warning/15` 4,33:1, sous AA. `/15` est l'alpha que TCK-450 avait écarté sur mesure dans la
 * console et qui n'avait jamais quitté ce fichier.
 *
 * ⚠⚠ **`--primary` n'est pas une encre** : `text-primary` échoue AA sur les surfaces de ce module
 * **à tous les alphas, `/0` compris** (3,88:1 en clair sur `bg-muted`, 3,39:1 en sombre, et
 * 4,07:1 jusque sur `bg-card` nu). Défaut de JETON, partagé avec `calendar/event-colors.ts` et
 * `inventory/labels.ts` : ticket à part, et *aucun alpha d'aplat ne le rattrape* (TCK-480).
 */

import type { MaintenanceRequest, MaintenanceStatus } from '@/types/maintenance';

/**
 * ⚠ TCK-381 — onze statuts, **cinq jetons**, et la réduction est délibérée.
 *
 * La table portait onze teintes Tailwind — `fuchsia`, `purple` et `violet` y voisinaient pour
 * trois statuts consécutifs, que personne ne peut distinguer ni nommer. Le DS ne publie pas onze
 * couleurs, et `StatusBadge` le dit depuis TCK-357 : *« un appelant qui aurait besoin d'un sixième
 * ton a probablement besoin d'une colonne, pas d'une couleur de plus. »*
 *
 * Ce qui reste distinct est ce qui porte du SENS : à faire (`--info`), au devis (`--primary`), en
 * cours (`--warning`), abouti (`--success`), refusé/annulé (`--destructive`), clos (`--muted`). Le
 * libellé, lui, est toujours à côté — ce n'est pas la grille du calendrier.
 */
const STATUS_TONE: Record<MaintenanceStatus, string> = {
  open: 'bg-info/10 text-info',
  acknowledged: 'bg-info/10 text-info',
  quote_requested: 'bg-primary/12 text-primary',
  quote_submitted: 'bg-primary/12 text-primary',
  approved: 'bg-success/10 text-success',
  rejected: 'bg-destructive/10 text-destructive',
  assigned: 'bg-info/10 text-info',
  in_progress: 'bg-warning/10 text-warning',
  completed: 'bg-success/10 text-success',
  closed: 'bg-muted text-muted-foreground',
  cancelled: 'bg-destructive/10 text-destructive',
};

export function maintenanceStatusBadgeClass(status: MaintenanceStatus): string {
  return STATUS_TONE[status] ?? 'bg-muted text-muted-foreground';
}

/** Les cinq cas de `maintenance.quote.decisions.*`. */
export type QuoteDecisionKey =
  | 'rejected'
  | 'approved'
  | 'pending'
  | 'requested'
  | 'not_applicable';

/**
 * Rend la CLÉ de décision, jamais le libellé : le composant la résout par
 * `useTranslations('maintenance.quote.decisions')`.
 */
export function quoteDecisionKey(
  request: Pick<MaintenanceRequest, 'status'>,
): QuoteDecisionKey {
  if (request.status === 'rejected') return 'rejected';
  if (['approved', 'in_progress', 'completed', 'closed'].includes(request.status)) {
    return 'approved';
  }
  if (request.status === 'quote_submitted') return 'pending';
  if (request.status === 'quote_requested') return 'requested';
  return 'not_applicable';
}
