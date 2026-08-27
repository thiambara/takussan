import { AlertCircle, AlertTriangle, ArrowDown, Circle, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { MaintenancePriority } from '@/types/maintenance';

interface MaintenancePrioritySelectorProps {
  readonly value: MaintenancePriority;
  readonly onChange: (value: MaintenancePriority) => void;
  readonly className?: string;
  readonly disabled?: boolean;
}

interface PriorityOption {
  value: MaintenancePriority;
  icon: LucideIcon;
  colorClass: string;
  activeClass: string;
}

const PRIORITIES: readonly PriorityOption[] = [
  {
    value: 'urgent',
    icon: AlertTriangle,
    colorClass: 'text-destructive dark:text-destructive',
    activeClass: 'border-destructive/30 bg-destructive/10 dark:bg-destructive/20 ring-1 ring-destructive/30',
  },
  {
    value: 'high',
    icon: AlertCircle,
    colorClass: 'text-warning dark:text-warning',
    activeClass: 'border-warning/30 bg-warning/10 dark:bg-warning/20 ring-1 ring-warning/30',
  },
  {
    value: 'normal',
    icon: Circle,
    colorClass: 'text-muted-foreground dark:text-muted-foreground',
    activeClass: 'border-border bg-muted/50 dark:bg-foreground ring-1 ring-border',
  },
  {
    value: 'low',
    icon: ArrowDown,
    colorClass: 'text-info dark:text-info',
    activeClass: 'border-info/30 bg-info/10 dark:bg-info/20 ring-1 ring-info/30',
  },
] as const;

export function MaintenancePrioritySelector({
  value,
  onChange,
  className,
  disabled = false,
}: MaintenancePrioritySelectorProps) {
  const t = useTranslations('maintenance.priority');

  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-4', className)}>
      {PRIORITIES.map((priority) => {
        const Icon = priority.icon;
        const isActive = value === priority.value;

        return (
          <label
            key={priority.value}
            className={cn(
              'relative flex cursor-pointer flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground',
              isActive ? priority.activeClass : 'border-border',
              disabled && 'cursor-not-allowed opacity-50'
            )}
          >
            <input
              type="radio"
              name="maintenance-priority"
              value={priority.value}
              className="sr-only"
              checked={isActive}
              onChange={() => !disabled && onChange(priority.value)}
              disabled={disabled}
            />
            <Icon className={cn('mb-3 h-6 w-6', priority.colorClass)} />
            <span className="text-sm font-medium">{t(priority.value)}</span>
          </label>
        );
      })}
    </div>
  );
}
