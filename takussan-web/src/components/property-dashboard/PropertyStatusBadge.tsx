import { Badge, type badgeVariants } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { PROPERTY_STATUS_LABELS } from '@/components/property-form/options';
import type { VariantProps } from 'class-variance-authority';

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

const VARIANT: Record<string, { variant: BadgeVariant; className?: string }> = {
  available: { variant: 'default' },
  published: { variant: 'default' },
  pending_review: {
    variant: 'outline',
    className: 'border-amber-300 bg-amber-50 text-amber-800',
  },
  pending: {
    variant: 'outline',
    className: 'border-amber-300 bg-amber-50 text-amber-800',
  },
  draft: { variant: 'outline' },
  archived: {
    variant: 'outline',
    className: 'border-app-surface-2 text-app-ink-muted',
  },
  rejected: { variant: 'destructive' },
  sold: { variant: 'secondary' },
  rented: { variant: 'secondary' },
  unavailable: {
    variant: 'outline',
    className: 'border-amber-300 bg-amber-50 text-amber-800',
  },
  under_maintenance: {
    variant: 'outline',
    className: 'border-amber-300 bg-amber-50 text-amber-800',
  },
};

const FALLBACK_LABELS: Record<string, string> = {
  ...PROPERTY_STATUS_LABELS,
  draft: 'Brouillon',
  published: 'Publié',
  archived: 'Archivé',
  pending_review: 'En revue',
  rejected: 'Refusé',
};

interface Props {
  readonly status: string | null;
  readonly statusLabel?: string | null;
  readonly className?: string;
}

export function PropertyStatusBadge({ status, statusLabel, className }: Props) {
  if (!status) return null;
  const config = VARIANT[status] ?? { variant: 'outline' as BadgeVariant };
  const label = statusLabel ?? FALLBACK_LABELS[status] ?? status;
  return (
    <Badge variant={config.variant} className={cn(config.className, className)}>
      {label}
    </Badge>
  );
}
