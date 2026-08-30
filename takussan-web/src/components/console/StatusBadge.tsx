import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Les tons SÉMANTIQUES, et il n'y en a que cinq.
 *
 * Le ton dit ce que le statut VEUT DIRE, jamais la couleur qu'il porte : c'est ce qui permettra à
 * TCK-358 de changer la palette sans rouvrir un seul écran. Un appelant qui aurait besoin d'un
 * sixième ton a probablement besoin d'une colonne, pas d'une couleur de plus.
 */
type StatusTone = 'neutral' | 'success' | 'attention' | 'danger' | 'info';

interface StatusBadgeProps {
  /** Libellé affiché. Déjà traduit — cf. le docblock d'`EmptyState`. */
  readonly label: ReactNode;
  readonly tone?: StatusTone;
  /** Icône lucide en `size-3`, posée avant le libellé. */
  readonly icon?: ReactNode;
  readonly className?: string;
  readonly 'data-testid'?: string;
}

/**
 * Les classes de chaque ton — la table de référence, et **le seul endroit du dépôt où la couleur
 * d'un statut de la CONSOLE est décidée**.
 *
 * ⚠ **Cette ligne disait « le seul endroit du dépôt où la couleur d'un statut est décidée », sans
 * réserve, et c'était faux** (TCK-472). Relevé du 2026-08-30, pris par une commande qui cherche
 * les DÉFINITIONS et non les importateurs — un homonyme local n'importe rien, il est invisible à
 * un relevé qui part des imports, et c'est ainsi que trois doublons ont vécu :
 *
 * ```
 * grep -rnE '^[[:space:]]*(export[[:space:]]+)?(async[[:space:]]+)?(function|const)[[:space:]]+\
 * [A-Za-z]*StatusBadge\b' src --include='*.tsx' --include='*.ts'
 * ```
 *
 * *Une affirmation fausse en tête du fichier canonique est ce qui a permis aux doublons de vivre :
 * on ne va pas chercher un second décideur quand le premier jure qu'il est seul.* La réserve
 * « de la CONSOLE » n'est donc pas une atténuation de style — c'est ce qui reste vrai après
 * mesure, et `scripts/check-status-badge-unique.mjs` la tient.
 *
 * **Ce qui n'est PAS gardé, nommément** (AC4 de TCK-472) : cinq fichiers décident encore une
 * couleur depuis une table de statuts à eux, sous un autre vocabulaire que `StatusBadge` —
 * `inventory/labels.ts`, `maintenance/labels.ts`, `maintenance/MaintenancePriorityBadge.tsx`,
 * `calendar/event-colors.ts` et `calendar/CalendarPage.tsx`. Le contrôle C de la garde les tient
 * par un cliquet à DEUX sens (aucun de plus, et aucun de moins) : ils ne peuvent ni se multiplier
 * ni disparaître en silence. Les absorber demande leur propre ticket, hors du périmètre de
 * TCK-472.
 *
 * Elles ne citent que des jetons publiés par `globals.css` (`--muted`, `--success`, `--warning`,
 * `--destructive`, `--info`). Aucune couleur Tailwind brute : au 2026-08-26, la
 * console portait huit pastilles faites main en ambre 100, émeraude 100, rouge 100, pierre 200 et
 * vert 50 — cinq familles pour quatre statuts.
 *
 * ⚠ Ces cinq classes étaient écrites ici EN TANT QUE CLASSES jusqu'au 2026-08-27, et c'est ce qui
 * a empêché ce fichier d'entrer dans le périmètre de `scripts/check-super-admin-tokens.mjs` : la
 * garde n'exclut pas les commentaires, délibérément, parce qu'un docblock qui montre une classe
 * brute est précisément la documentation périmée d'où le motif repousse. *Le récit d'une migration
 * s'écrit en toutes lettres ; sinon c'est un presse-papier.*
 *
 * `attention` empruntait `--primary` (terracotta) faute d'un jeton d'avertissement ; TCK-358 a
 * posé `--warning` dans `globals.css` et le ton l'a repris, d'une ligne, comme annoncé ici. Le
 * détour valait mieux que la couleur en dur : il s'est refermé sans rouvrir un seul écran.
 *
 * ⚠ **`success` empruntait `--accent` — l'accent de MARQUE — jusqu'au 2026-08-29, et le même
 * récit vaut mot pour mot** (TCK-450). Deux défauts, pas un, et le second ne se voit qu'en
 * mesurant :
 *
 *  · **Sémantique.** `--accent` (sage) est documenté par `docs/design-guidelines.md` comme
 *    l'accent des badges *featured*. Un ton nommé `success` rendu avec lui fait porter la même
 *    teinte à « mis en avant » (site public) et à « approuvé » (console) — et retire au produit
 *    le moyen de dire « ça a marché ». `--success` existe depuis TCK-381 exactement pour ça.
 *  · **Contraste.** `text-accent` sur `bg-accent/15` échouait AA (4,5:1, texte normal — la
 *    pastille porte du `text-xs`) sur **toutes** les surfaces réelles des deux thèmes : de 4,52:1
 *    sur `--card` en clair à 3,05:1 sur une ligne de `DataTable` sélectionnée en sombre.
 *
 * ⚠⚠ **L'aplat est à 10 %, pas à 15 %, et l'écart n'est pas cosmétique.** TCK-450 prescrivait
 * `bg-success/15`; mesuré sur les SEPT surfaces réelles (cf.
 * `__tests__/StatusBadge.contraste-tck-450.test.tsx`), `/15` tombe à **4,29:1 en clair** sur la
 * ligne sélectionnée de `kyc-queue.tsx` et `admin/super/moderation.tsx`, qui posent `bg-muted`
 * PLEIN — une surface que le ticket n'avait pas relevée. `/10` tient partout (pire cas 4,60:1),
 * et c'est aussi l'alpha que le docblock de `--success` avait mesuré dans `globals.css` : *« #3f6b45
 * sur success/10 aplati sur Lin → 5,13:1 ← le cas réel de la pastille »*. Sur un aplat de la
 * couleur du texte, **moins d'opacité = plus de contraste** : l'intuition inverse est le piège.
 *
 * ⚠ **`info` empruntait `--secondary` — le beige de chrome — jusqu'au 2026-08-30, et c'est le
 * même récit une troisième fois** (TCK-472). `--info` (#3f5a6b) existe depuis TCK-381, posé par
 * `globals.css` pour « une pastille *en cours* » ; le ton qui porte ce nom ne s'en servait pas.
 * Le défaut ne se voyait pas tant que `info` restait rare — il est devenu visible en absorbant
 * `PropertyList`, où `rented` et `sold` rendaient `bg-info/10 text-info`. Les faire passer sur
 * `bg-secondary` (#f3ead8) les aurait rendus indiscernables de `neutral` (`--muted`, #f1ece0) :
 * **deux jetons distants de trois points sur chaque canal.** Un ton de statut qu'on ne peut pas
 * distinguer du ton « rien à signaler » ne dit plus rien.
 *
 * `bg-info/10 text-info` mesure 5,36:1 au pire cas en clair et 4,90:1 en sombre sur les sept
 * surfaces réelles, contre 14,67:1 / 12,53:1 pour le beige plein — la substitution DESCEND le
 * ratio et reste au-dessus d'AA. Écrit ici parce que le chiffre qui baisse est celui qu'on doit
 * pouvoir défendre.
 *
 * ⚠⚠ **`danger` A ÉTÉ SOUS AA sur les sept surfaces, et il ne l'est plus — TCK-480.** Ce
 * paragraphe portait le relevé suivant, qu'on garde parce que c'est sa CONCLUSION qui instruit :
 * `bg-destructive/10 text-destructive` mesurait **3,41 à 3,99:1** en clair, la cause était le
 * jeton (`#e7000b`, relevé au moteur de rendu), et *aucun alpha d'aplat ne rattrape une encre
 * trop claire* — **« cela ne se corrige pas ici »**. C'était juste : le correctif est descendu
 * dans `globals.css`, pas dans cette table, et cette table n'a pas changé d'un caractère.
 *
 * Remesuré le 2026-08-30 sur les sept surfaces, après le nouveau jeton :
 * **4,93 à 5,77:1 en clair, 4,55 à 5,51:1 en sombre.**
 *
 * ⚠ Et le sombre était fautif LUI AUSSI, ce que ni TCK-472 ni le ticket du jeton n'avaient vu :
 * il passait sur `--card` et `--background`, échouait à 4,10:1 sur les lignes `bg-muted` de
 * `kyc-queue.tsx` et `moderation.tsx`. *Une surface qu'on n'a pas listée est une mesure qu'on
 * n'a pas faite* — les sept surfaces de `StatusBadge.contraste-tck-450.test.tsx` sont la liste,
 * et c'est elle qui a rattrapé le jeu de valeurs intermédiaire.
 * `scripts/check-destructive-contrast.mjs` tient le jeton et le plafond de ses aplats (/10).
 */
const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  success: 'bg-success/10 text-success',
  attention: 'bg-warning/12 text-warning',
  danger: 'bg-destructive/10 text-destructive',
  info: 'bg-info/10 text-info',
};

/**
 * L'UNIQUE pastille de statut de la console, bâtie sur `<Badge>`.
 *
 * Elle ne connaît AUCUN statut métier : c'est l'appelant qui fait correspondre son vocabulaire
 * (`pending`, `flagged`, `available`, …) à un ton. Le contraire aurait fait de ce fichier une
 * table de tous les statuts du produit — et le premier statut ajouté ailleurs y aurait manqué en
 * silence.
 *
 * ⚠ **La contrepartie de ce choix est un homonyme.** Chaque vocabulaire métier a besoin d'un
 * traducteur `statut → ton`, et trois d'entre eux se sont appelés `StatusBadge` sans être
 * celui-ci. Dans un fichier qui définit son propre `StatusBadge`, `<StatusBadge …>` résout vers le
 * local ; ni le typage ni le lint ne le signalent. La forme JUSTE est celle de
 * `kyc/kyc-components.tsx` : garder le nom, importer celui-ci sous alias, ne traduire que le
 * SENS. `scripts/check-status-badge-unique.mjs` refuse toute autre forme.
 */
export function StatusBadge({
  label,
  tone = 'neutral',
  icon,
  className,
  'data-testid': dataTestId,
}: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      data-tone={tone}
      data-testid={dataTestId}
      className={cn('h-auto gap-1 border-transparent py-0.5', TONE_CLASSES[tone], className)}
    >
      {icon}
      {label}
    </Badge>
  );
}

export type { StatusBadgeProps, StatusTone };
