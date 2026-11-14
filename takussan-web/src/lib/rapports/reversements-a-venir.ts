import { apiRequest, buildQueryString } from '@/lib/api';
import { cheminApi, requete } from '@/lib/chemin-api';
import { getToken } from '@/lib/session';
import type { PaginatedResponse } from '@/types/api';
import type { Payout } from '@/types/invoice';

/**
 * TCK-595 (AC4 bis) — les versements AU BAILLEUR encore à venir. Depuis TCK-594, `landlord_id` porte
 * aussi les versements nés de ses baux et destinés à d'autres (restitution de caution au locataire,
 * facture d'un prestataire) : sans `payee_role`, la carte les annonçait comme les siens. Et un
 * versement `scheduled` ou `processing` est encore à venir, pas seulement `pending`.
 *
 * TCK-1804 (P162.07) — « à venir » se lit à l'API, `filter[upcoming]` (`PayoutStatus::upcoming()`),
 * et compte aussi l'attente d'approbation : la liste écrite ici l'oubliait.
 */
export async function fetchUpcomingOwnerPayouts(ownerId: number): Promise<Payout[]> {
  const token = await getToken();
  if (!token) return [];
  const qs = buildQueryString({
    fields: {
      payouts: [
        'id',
        'reference_number',
        'landlord_id',
        'status',
        'net_amount',
        'currency',
        'scheduled_at',
        'created_at',
      ],
    },
    filter: {
      landlord_id: ownerId,
      payee_role: 'landlord',
      upcoming: 1,
    },
    sort: ['scheduled_at', '-created_at'],
    per_page: 3,
  });
  try {
    const response = await apiRequest<PaginatedResponse<Payout>>(
      cheminApi`/api/payouts${requete(qs)}`,
      { token },
    );
    return response.data;
  } catch {
    return [];
  }
}
