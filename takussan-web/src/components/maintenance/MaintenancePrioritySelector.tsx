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
    colorClass: 'text-red-600 dark:text-red-400',
    activeClass: 'border-red-500 bg-red-50 dark:bg-red-900/20 ring-1 ring-red-500',
  },
  {
    value: 'high',
    icon: AlertCircle,
    colorClass: 'text-orange-600 dark:text-orange-400',
    activeClass: 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 ring-1 ring-orange-500',
  },
  {
    value: 'normal',
    icon: Circle,
    colorClass: 'text-slate-600 dark:text-slate-400',
    activeClass: 'border-slate-500 bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-500',
  },
  {
    value: 'low',
    icon: ArrowDown,
    colorClass: 'text-blue-600 dark:text-blue-400',
    activeClass: 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500',
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
