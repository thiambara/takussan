import { apiRequest } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';

import type { ContactSurPlace } from './ContactsSurPlace';

/** TCK-633 (lot C) — une ligne de `GET /api/properties/{id}/contacts`, dans l'ordre de `position`. */
interface LigneDeContact {
  readonly id: number;
  readonly label: string | null;
  readonly phone: string;
  readonly has_whatsapp: boolean;
  readonly position: number;
}

export const CONTACTS_DU_BIEN_QUERY_KEY = {
  list: (propertyId: number) => ['property', propertyId, 'contacts'] as const,
};

/** Les contacts sur place d'un bien, à la forme que l'éditeur ({@link ContactSurPlace}) manipule. */
export async function lireContactsDuBien(token: string, propertyId: number): Promise<ContactSurPlace[]> {
  const res = await apiRequest<{ data?: LigneDeContact[] }>(cheminApi`/api/properties/${propertyId}/contacts`, { token });
  return (Array.isArray(res?.data) ? res.data : []).map((c) => ({
    label: c.label ?? '',
    phone: c.phone,
    has_whatsapp: c.has_whatsapp === true,
  }));
}
