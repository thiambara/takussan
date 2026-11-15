'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useLocale } from 'next-intl';

import { useAuth } from '@/context/AuthContext';
import { apiRequest, buildQueryString } from '@/lib/api';
import { cheminApi, requete } from '@/lib/chemin-api';
import { filtresDeLHistorique, paymentsQueryKeys, type PaymentHistoryResponse, type UsePaymentsHistoryParams } from '@/lib/queries/payments';
import type { PaymentHistoryRow } from '@/types/invoice';

/** L'API plafonne `per_page` à 100 (`PaymentController::history`). */
export const PLAFOND_DE_LA_FILE = 100;

/**
 * Les échéances à relancer, lues AU MOMENT DU GESTE sous la règle *Impayé* de l'écran (TCK-2660 :
 * `days_late_min ≥ 1`, le plus en retard d'abord, nommées), au plafond de l'API. Seules les échéances
 * de BAIL se relancent (la règle de `useEcheancesAffichees`) : une réservation n'y entre jamais.
 *
 * TCK-2775 — venue de `lib/queries/accueil.ts` : l'écran Impayés la lit quand son adresse demande la
 * relance (`?relance=file`, `?relance=<échéance>`), et l'accueil n'y touche plus. `bail` restreint la
 * lecture aux échéances d'UN bail (`filter[entity_type]=lease`) : une échéance nommée par la fiche du
 * bail se retrouve alors au-delà des 100 plus en retard de l'agence.
 *
 * `tronquee` : l'API en compte plus que le plafond n'en rend (`meta.total` au-delà de la page lue).
 */
export function useLireLesEcheancesARelancer() {
  const queryClient = useQueryClient();
  const locale = useLocale();
  const { token } = useAuth();
  return async ({ bail }: { readonly bail?: number } = {}): Promise<{ readonly rows: PaymentHistoryRow[]; readonly tronquee: boolean }> => {
    const params = {
      days_late_min: 1,
      sort: '-days_late',
      include: ['payer', 'property', 'landlord', 'reminders'],
      ...(bail ? { entity_type: 'lease' as const, entity_id: bail } : {}),
      page: 1,
      per_page: PLAFOND_DE_LA_FILE,
    } satisfies UsePaymentsHistoryParams;
    const qs = buildQueryString({ filter: filtresDeLHistorique(params), include: [...params.include], page: 1, per_page: params.per_page, sort: params.sort });
    const reponse = await queryClient.fetchQuery({
      queryKey: paymentsQueryKeys.history(params),
      queryFn: () => apiRequest<PaymentHistoryResponse>(cheminApi`/api/payments/history${requete(qs)}`, { token: token ?? undefined, locale }),
      staleTime: 0,
    });
    return { rows: reponse.data.filter((row) => row.source === 'lease'), tronquee: reponse.meta.total > reponse.data.length };
  };
}
