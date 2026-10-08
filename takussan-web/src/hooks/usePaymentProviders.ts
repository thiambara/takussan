'use client';

import { useMemo } from 'react';
import { useApiQuery } from '@/hooks/useApiQuery';
import { cheminApi } from '@/lib/chemin-api';
import type { GatewayPaymentType, GatewayProvider } from '@/hooks/useInitiatePayment';

const KNOWN_PROVIDERS: readonly GatewayProvider[] = ['wave', 'orange_money', 'lemon_squeezy'];

/**
 * Les fournisseurs que CE paiement peut utiliser, tels que le serveur les juge (TCK-602,
 * ADR-0051 §3) : intégration active couvrant l'agence (repli global compris), pilote, identifiants
 * remplis, devise acceptée. Même autorisation que l'initiation : le locataire qui paie la lit.
 *
 * Avant TCK-602, le hook lisait `GET /api/integrations`, réservé à l'admin d'agence : le locataire
 * recevait 403 et le sélecteur proposait TOUS les fournisseurs de la devise, y compris ceux que
 * son agence n'a pas — l'initiation cassait au clic. Le serveur dit désormais lesquels.
 *
 * `paymentId` nul ou invalide : aucune requête, liste vide. Une erreur de lecture aussi : un
 * payeur qui ne peut pas lire la liste ne peut pas non plus initier (même politique).
 */
export function usePaymentProviders(paymentType: GatewayPaymentType, paymentId: number | null | undefined) {
  const valide = typeof paymentId === 'number' && Number.isSafeInteger(paymentId) && paymentId > 0;
  const query = useApiQuery<{ data: { providers: string[] } }>(
    ['payments', 'gateway-providers', paymentType, valide ? paymentId : null] as const,
    cheminApi`/api/${paymentType}/${valide ? paymentId : 0}/providers`,
    { enabled: valide },
  );

  const providers = useMemo<readonly GatewayProvider[]>(() => {
    const brut = query.data?.data.providers ?? [];
    return brut.filter((p): p is GatewayProvider => (KNOWN_PROVIDERS as readonly string[]).includes(p));
  }, [query.data]);

  return { providers, isLoading: query.isLoading };
}
