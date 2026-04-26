import { cn } from '@/lib/utils';
import type { MaintenanceStatus } from '@/types/maintenance';
import {
  maintenanceStatusBadgeClass,
  MAINTENANCE_STATUS_LABEL,
} from './labels';

export { MaintenancePriorityBadge } from './MaintenancePriorityBadge';

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
