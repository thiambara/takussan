'use client';

import { useApiMutation } from '@/hooks/useApiQuery';
import { cheminApi } from '@/lib/chemin-api';

/**
 * TCK-2583 / TCK-2590 — un geste de contact ENREGISTRÉ au toucher, depuis la liste des clients :
 * `POST /api/customers/{id}/contacts {channel}` (204) nourrit le dernier contact de la fiche. Le
 * lien (`tel:`, `wa.me`) s'ouvre de lui-même ; l'envoi part à côté, sans le retenir. L'API le refuse
 * (403) à qui ne peut pas modifier la fiche : la liste ne l'envoie que pour le personnel.
 */
export type CanalDeContactClient = 'call' | 'whatsapp';

export function useEnregistrerContactClient() {
  return useApiMutation<void, { id: number; channel: CanalDeContactClient }>({
    path: ({ id }) => cheminApi`/api/customers/${id}/contacts`,
    method: 'POST',
    body: ({ channel }) => ({ channel }),
  });
}

/**
 * TCK-2590 — « Me désigner » : `POST /api/customers/{id}/primary-contact {user_id}` fait du lecteur le
 * référent d'une fiche qui n'en a pas. Gardé par `crm.assign` dans l'agence de la fiche
 * (`SetPrimaryContactCustomerRequest`, 403 sinon) : la liste ne l'offre qu'à qui la porte.
 */
export function useDesignerReferent() {
  return useApiMutation<unknown, { id: number; userId: number }>({
    path: ({ id }) => cheminApi`/api/customers/${id}/primary-contact`,
    method: 'POST',
    body: ({ userId }) => ({ user_id: userId }),
  });
}
