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
    activeClass: 'border-foreground/40 bg-muted ring-1 ring-foreground/20',
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
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-2 lg:grid-cols-4', className)}>
      {PRIORITIES.map((priority) => {
        const Icon = priority.icon;
        const isActive = value === priority.value;

        return (
          <label
            key={priority.value}
            className={cn(
              // `hover:bg-accent` peignait la carte en sauge PLEIN au survol — l'accent est réservé
              // aux mises en avant (TCK-450) et les icônes colorées s'y noyaient.
              'relative flex min-h-11 cursor-pointer flex-col items-center justify-between rounded-lg border-2 bg-popover p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
              isActive ? priority.activeClass : 'border-border hover:bg-muted',
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
            <Icon className={cn('mb-3 size-6', priority.colorClass)} aria-hidden="true" />
            <span className={cn('text-sm', isActive ? 'font-semibold' : 'font-medium')}>
              {t(priority.value)}
            </span>
          </label>
        );
      })}
    </div>
  );
}
