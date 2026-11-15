import { apiRequest, buildQueryString } from '@/lib/api';
import { cheminApi, requete } from '@/lib/chemin-api';
import { nomAffichable } from '@/lib/identite';
import type { Pour } from '@/lib/taches/lien-nouvelle-tache';

/**
 * TCK-2857 — le libellé du client ou du bien d'où l'on vient (`?pour=customer:12`), relu côté
 * serveur avec les seules colonnes du libellé : l'URL ne porte jamais le nom. Une lecture refusée ou
 * absente (403, 404, panne) rend `null` : le formulaire s'ouvre sans préremplissage, rien ne casse.
 */
export async function rattachementDeLaFiche(token: string, pour: Pour): Promise<{ type: Pour['type']; id: number; label: string } | null> {
  try {
    if (pour.type === 'customer') {
      const qs = buildQueryString({ fields: { customers: ['id', 'first_name', 'last_name', 'email', 'phone'] } });
      const r = await apiRequest<{ data: { id: number; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null } }>(
        cheminApi`/api/customers/${pour.id}${requete(qs)}`,
        { token },
      );
      return { type: 'customer', id: pour.id, label: nomAffichable(r.data) };
    }
    const qs = buildQueryString({ fields: { properties: ['id', 'title'] } });
    const r = await apiRequest<{ data: { id: number; title: string } }>(cheminApi`/api/properties/${pour.id}${requete(qs)}`, { token });
    return { type: 'property', id: pour.id, label: r.data.title };
  } catch {
    return null;
  }
}
