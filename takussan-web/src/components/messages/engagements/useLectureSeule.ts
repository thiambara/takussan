'use client';

import { useSyncExternalStore } from 'react';

import { relaisImpersonationActif } from '@/lib/impersonation';

const AUCUN_ABONNEMENT = () => () => undefined;

/**
 * TCK-2972 — sous impersonation, aucun geste d'engagement ne s'affiche (l'API les refuserait par
 * `EnforceImpersonationReadOnly`, sans que les `abilities` de la projection le disent). Même témoin que
 * la boîte (`MessagesPage`, TCK-2968) : le cookie du navigateur ; le serveur rend « lecture seule », le
 * client corrige à l'hydratation.
 */
export function useLectureSeule(): boolean {
  return useSyncExternalStore(AUCUN_ABONNEMENT, relaisImpersonationActif, () => true);
}
