import { AlertCircle, AlertTriangle, ArrowDown, Circle, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { MaintenancePriority } from '@/types/maintenance';

interface MaintenancePriorityBadgeProps {
  readonly priority: MaintenancePriority;
  readonly className?: string;
}

const PRIORITY_CONFIG: Record<MaintenancePriority, { color: string; icon: LucideIcon }> = {
  urgent: {
    color: 'bg-destructive/10 text-destructive border-destructive/30 dark:bg-destructive/10 dark:text-destructive dark:border-destructive/30',
    icon: AlertTriangle,
  },
  high: {
    color: 'bg-warning/15 text-warning border-warning/30 dark:bg-warning/10 dark:text-warning dark:border-warning/30',
    icon: AlertCircle,
  },
  normal: {
    color: 'bg-muted text-foreground border-border dark:bg-foreground dark:text-muted-foreground dark:border-border',
    icon: Circle,
  },
  low: {
    color: 'bg-info/10 text-info border-info/30 dark:bg-info/10 dark:text-info dark:border-info/30',
    icon: ArrowDown,
  },
};

export function MaintenancePriorityBadge({ priority, className }: MaintenancePriorityBadgeProps) {
  const t = useTranslations('maintenance.priority');
  const config = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.normal;
  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={cn('flex w-fit items-center gap-1.5 px-2 py-0.5 whitespace-nowrap', config.color, className)}
    >
      <Icon className="h-3 w-3" />
      <span>{t(priority)}</span>
    </Badge>
  );
}
