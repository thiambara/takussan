import { getTranslations } from 'next-intl/server';

import { Badge, type badgeVariants } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { PROPERTY_ENUM_NAMESPACES } from '@/components/property-form/options';
import { propertyStatusValues } from '@/lib/schemas/property';
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
    className: 'border-muted text-muted-foreground',
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

/**
 * Les statuts que `property.status` sait nommer : les valeurs de l'enum backend, plus les trois
 * états de modération qui n'en font pas partie.
 *
 * Ce Set REMPLACE la table `FALLBACK_LABELS` et il en reproduit exactement le domaine — c'est ce
 * qui garantit le repli d'origine (`?? status`) pour un statut inconnu. Sans lui, `t(status)`
 * rendrait le chemin de la clé au lieu de la valeur brute reçue de l'API.
 */
const STATUTS_NOMMES = new Set<string>([
  ...propertyStatusValues,
  'published',
  'pending_review',
  'rejected',
]);

interface Props {
  readonly status: string | null;
  readonly statusLabel?: string | null;
  readonly className?: string;
}

/**
 * Composant SERVEUR — son seul appelant est `app/(dashboard)/app/properties/[id]/page.tsx`, qui
 * est lui-même serveur (cf. `PropertyVisibilityBadge`). La liste du tableau de bord, elle, a son
 * propre badge client dans `PropertyList`.
 */
export async function PropertyStatusBadge({ status, statusLabel, className }: Props) {
  if (!status) return null;
  const t = await getTranslations(PROPERTY_ENUM_NAMESPACES.status);
  const config = VARIANT[status] ?? { variant: 'outline' as BadgeVariant };
  const label = statusLabel ?? (STATUTS_NOMMES.has(status) ? t(status) : status);
  return (
    <Badge variant={config.variant} className={cn(config.className, className)}>
      {label}
    </Badge>
  );
}
