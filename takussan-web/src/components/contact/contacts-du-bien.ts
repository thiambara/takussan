import { apiRequest } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';

import type { ContactSurPlace } from './ContactsSurPlace';

/**
 * TCK-633 (lot C) — une ligne de `GET /api/properties/{id}/contacts`, dans l'ordre de `position`.
 * `PUT …/contacts` rend la même liste, telle qu'écrite (TCK-1777).
 */
export interface LigneDeContact {
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
  return versEditeur(res?.data);
}

/** Les lignes que l'API rend (lecture ou remplacement), à la forme de l'éditeur. */
export function versEditeur(lignes: readonly LigneDeContact[] | undefined): ContactSurPlace[] {
  return (Array.isArray(lignes) ? lignes : []).map((c) => ({
    label: c.label ?? '',
    phone: c.phone,
    has_whatsapp: c.has_whatsapp === true,
  }));
}
