import { getTranslations } from 'next-intl/server';

import { StatusBadge } from '@/components/console';
import { PROPERTY_ENUM_NAMESPACES } from '@/components/property-form/options';

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
  // TCK-2639 — la pastille neutre de la maquette `app-biens` a-2 (« Privé »), sans icône : la
  // visibilité est un état, pas un geste.
  return <StatusBadge tone="neutral" label={t(visibility === 'public' ? 'public' : 'private')} className={className} />;
}
