import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import type { MaintenanceStatus } from '@/types/maintenance';
import { maintenanceStatusBadgeClass } from './labels';

export { MaintenancePriorityBadge } from './MaintenancePriorityBadge';

export function MaintenanceStatusBadge({
  status,
  className,
}: {
  readonly status: MaintenanceStatus;
  readonly className?: string;
}) {
  const t = useTranslations('maintenance.status');

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        maintenanceStatusBadgeClass(status),
        className,
      )}
    >
      {t(status)}
    </span>
  );
}
