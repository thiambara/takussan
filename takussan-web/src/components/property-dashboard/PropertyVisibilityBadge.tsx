import { Globe, Lock } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Badge } from '@/components/ui/badge';
import { PROPERTY_ENUM_NAMESPACES } from '@/components/property-form/options';
import { cn } from '@/lib/utils';

interface Props {
  readonly visibility: string | null;
  readonly className?: string;
}

/**
 * Composant SERVEUR — son seul appelant est `app/(dashboard)/app/properties/[id]/page.tsx`, qui
 * est lui-même serveur. `getTranslations` évite d'ouvrir une frontière client pour un badge de
 * deux mots ; le passer en `'use client'` embarquerait le composant, ses icônes et le provider
 * dans le bundle sans rien apporter.
 */
export async function PropertyVisibilityBadge({ visibility, className }: Props) {
  if (!visibility) return null;
  const t = await getTranslations(PROPERTY_ENUM_NAMESPACES.visibilityScope);
  const isPublic = visibility === 'public';
  const Icon = isPublic ? Globe : Lock;
  return (
    <Badge variant="outline" className={cn('gap-1.5', className)}>
      <Icon aria-hidden="true" />
      {t(isPublic ? 'public' : 'private')}
    </Badge>
  );
}
