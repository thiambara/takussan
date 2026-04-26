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
    color: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-900',
    icon: AlertTriangle,
  },
  high: {
    color: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-900',
    icon: AlertCircle,
  },
  normal: {
    color: 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    icon: Circle,
  },
  low: {
    color: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-900',
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
