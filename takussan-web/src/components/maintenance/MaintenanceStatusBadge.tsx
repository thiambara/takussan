import { cn } from '@/lib/utils';
import type { MaintenancePriority, MaintenanceStatus } from '@/types/maintenance';
import {
  maintenancePriorityBadgeClass,
  maintenanceStatusBadgeClass,
  MAINTENANCE_PRIORITY_LABEL,
  MAINTENANCE_STATUS_LABEL,
} from './labels';

export function MaintenanceStatusBadge({
  status,
  className,
}: {
  readonly status: MaintenanceStatus;
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        maintenanceStatusBadgeClass(status),
        className,
      )}
    >
      {MAINTENANCE_STATUS_LABEL[status]}
    </span>
  );
}

export function MaintenancePriorityBadge({
  priority,
  className,
}: {
  readonly priority: MaintenancePriority;
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        maintenancePriorityBadgeClass(priority),
        className,
      )}
    >
      {MAINTENANCE_PRIORITY_LABEL[priority]}
    </span>
  );
}
