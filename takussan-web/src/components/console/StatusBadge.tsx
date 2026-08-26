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
 * Elles ne citent que des jetons publiés par `globals.css` (`--accent`, `--destructive`,
 * `--primary`, `--muted`, `--secondary`). Aucune couleur Tailwind brute : au 2026-08-26, la
 * console portait huit pastilles faites main en `bg-amber-100` / `bg-emerald-100` / `bg-red-100`
 * / `bg-stone-200` / `bg-green-50`, cinq familles pour quatre statuts.
 *
 * ⚠ `attention` emprunte `--primary` (terracotta) faute d'un jeton d'avertissement : le DS
 * prescrit `amber-500` mais `globals.css` ne le publie pas, et l'écrire ici rouvrirait la couleur
 * en dur que cette primitive existe pour fermer. **C'est TCK-358 qui pose le jeton**, et ce ton
 * changera d'une ligne le jour où il existe.
 */
const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  success: 'bg-accent/15 text-accent',
  attention: 'bg-primary/12 text-primary',
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
