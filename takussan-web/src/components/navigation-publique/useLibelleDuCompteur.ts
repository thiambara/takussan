'use client';

import { useTranslations } from 'next-intl';
import { COMPTEURS_DE_MODERATION } from '@/components/layout/useCompteursDuMenu';
import type { NavCounterKey } from '@/lib/navigation/types';

/**
 * Le libellé accessible d'un compteur du menu, pour les TROIS lecteurs du site public (la barre,
 * « Moi », « Mon espace ») — un seul endroit, parce que la branche de modération a divergé une fois :
 * « Moi » lisait `nav.sidebar.counters.<clé>` pour tous les compteurs, et `reviewModeration` /
 * `propertyModeration` n'y existent pas (ils vivent sous `nav.admin.pendingBadge`). Un admin
 * d'agence qui avait un avis à modérer voyait « Moi » tomber sur MISSING_MESSAGE (revue de TCK-2493).
 */
export function useLibelleDuCompteur(): (cle: NavCounterKey, count: number) => string {
  const tSidebar = useTranslations('nav.sidebar');
  const tAdmin = useTranslations('nav.admin');
  return (cle, count) =>
    COMPTEURS_DE_MODERATION.has(cle) ? tAdmin('pendingBadge', { count }) : tSidebar(`counters.${cle}`, { count });
}
