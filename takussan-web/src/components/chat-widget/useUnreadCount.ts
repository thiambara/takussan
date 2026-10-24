'use client';

import { usePathname } from 'next/navigation';

import {
  CADENCE_NON_LUS_HORS_MESSAGERIE_MS,
  CADENCE_NON_LUS_MESSAGERIE_MS,
  useNonLusTotal,
} from '@/lib/queries/conversations-list';
import { useAuth } from '@/context/AuthContext';

/**
 * TCK-274 — The global unread badge value. TCK-1768 (P136.01) : read by a narrow
 * request of its own (`useNonLusTotal` : one row, no `include`), every 30 s outside
 * `/app/messages` and every 10 s inside it.
 *
 * Rules:
 *   - `meta.unread_total`, counted by the API over the WHOLE list (TCK-1387),
 *     muted conversations excluded (they still ring on the page but should
 *     not pull attention from the floating badge)
 *   - return 0 while loading or for anonymous visitors
 *
 * TCK-377 — `enabled` : la barre latérale de `/app` lit ce compteur pour la pastille de
 * « Messagerie », et ne doit armer AUCUN sondage quand l'entrée n'est pas rendue. Le défaut
 * reste `true` — `ChatWidget`, monté globalement, appelle ce hook sans argument. La clé de requête
 * étant la même, la barre latérale ne coûte aucune requête supplémentaire : elle lit le cache que
 * le widget alimente.
 */
export function useUnreadCount(options: { enabled?: boolean } = {}): number {
  const enabled = options.enabled ?? true;
  const { user } = useAuth();
  const dansLaMessagerie = (usePathname() ?? '').startsWith('/app/messages');
  const { data, isLoading } = useNonLusTotal({
    enabled,
    refetchInterval: dansLaMessagerie ? CADENCE_NON_LUS_MESSAGERIE_MS : CADENCE_NON_LUS_HORS_MESSAGERIE_MS,
  });

  // TCK-1387 (P135.02) — le total vient de l'API (`meta.unread_total`), compté sur toute la liste
  // hors fils en sourdine : additionner les `unread_count` de la page ignorait les fils au-delà
  // des 30 premiers.
  if (!enabled || isLoading || !user) return 0;
  return data?.meta?.unread_total ?? 0;
}
