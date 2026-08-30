import { AlertCircle, AlertTriangle, ArrowDown, Circle, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { StatusBadge, type StatusTone } from '@/components/console/StatusBadge';
import { cn } from '@/lib/utils';
import type { MaintenancePriority } from '@/types/maintenance';

interface MaintenancePriorityBadgeProps {
  readonly priority: MaintenancePriority;
  readonly className?: string;
}

/**
 * La priorité d'une demande de maintenance — ABSORBÉE par `StatusBadge` (TCK-484).
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE A ÉTÉ ABSORBÉE, ALORS QUE LES TROIS AUTRES FAMILLES NE L'ONT PAS ÉTÉ
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Le cliquet C de `scripts/check-status-badge-unique.mjs` la retenait au motif qu'elle *« porte
 * une variante `dark:` explicite que `StatusBadge` n'a pas »*. **C'était le motif le plus faible
 * des cinq, et la mesure l'a retourné :** cette variante `dark:` était la seule chose que ce
 * fichier faisait de plus, et elle était FAUSSE.
 *
 *   normal: 'bg-muted text-foreground … dark:bg-foreground dark:text-muted-foreground'
 *
 * En thème sombre, `--foreground` est la crème #fcf9f3 et `--muted-foreground` le taupe #b8aa97 :
 * la pastille rendait **2,16:1**, un texte clair sur un fond clair, sur les deux surfaces de ses
 * écrans. Les trois autres `dark:` étaient soit des recopies exactes de leur valeur claire
 * (`urgent`, `low` : sans effet), soit un ajustement d'alpha (`high`). *La seule justification de
 * l'exception était l'inversion qui la cassait.*
 *
 * Et le vocabulaire, lui, tombe exactement : quatre priorités, quatre des cinq tons du DS —
 * `urgent` → `danger`, `high` → `attention`, `normal` → `neutral`, `low` → `info`. Il n'y a rien
 * ici que `StatusBadge` ne sache dire. Ce fichier ne décide donc plus aucune couleur : il traduit
 * une priorité en TON et délègue, comme `kyc/kyc-components.tsx`.
 *
 * ⚠ **Ce qui est perdu, et assumé :** la bordure teintée (`border-destructive/30` …).
 * `StatusBadge` pose `border-transparent` — c'est une décision du DS, pas un manque, et l'icône
 * porte déjà la distinction non chromatique que la bordure n'apportait pas.
 */
const PRIORITY_TONE: Record<MaintenancePriority, StatusTone> = {
  urgent: 'danger',
  high: 'attention',
  normal: 'neutral',
  low: 'info',
};

const PRIORITY_ICON: Record<MaintenancePriority, LucideIcon> = {
  urgent: AlertTriangle,
  high: AlertCircle,
  normal: Circle,
  low: ArrowDown,
};

export function MaintenancePriorityBadge({ priority, className }: MaintenancePriorityBadgeProps) {
  const t = useTranslations('maintenance.priority');
  const Icon = PRIORITY_ICON[priority] ?? PRIORITY_ICON.normal;

  return (
    <StatusBadge
      label={t(priority)}
      tone={PRIORITY_TONE[priority] ?? 'neutral'}
      icon={<Icon className="h-3 w-3" />}
      className={cn('gap-1.5 px-2', className)}
    />
  );
}
