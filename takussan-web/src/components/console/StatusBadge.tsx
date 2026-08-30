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
 * Les classes de chaque ton — **le seul endroit du dépôt où la couleur d'un statut est décidée**.
 *
 * Elles ne citent que des jetons publiés par `globals.css` (`--muted`, `--success`, `--warning`,
 * `--destructive`, `--secondary`). Aucune couleur Tailwind brute : au 2026-08-26, la
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
 */
const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  success: 'bg-success/10 text-success',
  attention: 'bg-warning/12 text-warning',
  danger: 'bg-destructive/10 text-destructive',
  info: 'bg-secondary text-secondary-foreground',
};

/**
 * L'UNIQUE pastille de statut de la console, bâtie sur `<Badge>`.
 *
 * Elle ne connaît AUCUN statut métier : c'est l'appelant qui fait correspondre son vocabulaire
 * (`pending`, `flagged`, `available`, …) à un ton. Le contraire aurait fait de ce fichier une
 * table de tous les statuts du produit — et le premier statut ajouté ailleurs y aurait manqué en
 * silence.
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
