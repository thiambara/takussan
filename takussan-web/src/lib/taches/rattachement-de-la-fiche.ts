import { apiRequest } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';
import { nomAffichable } from '@/lib/identite';
import type { Pour } from '@/lib/taches/lien-nouvelle-tache';

/**
 * TCK-2857 — le libellé du client ou du bien d'où l'on vient (`?pour=customer:12`), relu côté
 * serveur (la ressource entière : un show ignore `fields`) : l’URL ne porte jamais le nom. Une lecture refusée ou
 * absente (403, 404, panne) rend `null` : le formulaire s'ouvre sans préremplissage, rien ne casse.
 */
export async function rattachementDeLaFiche(token: string, pour: Pour): Promise<{ type: Pour['type']; id: number; label: string } | null> {
  try {
    if (pour.type === 'customer') {
      // TCK-2875 — un `show` rend la ressource entière et ignore `fields[...]` (garde P60.03,
      // `show-sans-fields.garde.test.ts`, rougie par TCK-2857) : la lecture n'en envoie plus.
      const r = await apiRequest<{ data: { id: number; first_name?: string | null; last_name?: string | null; email?: string | null; phone?: string | null } }>(
        cheminApi`/api/customers/${pour.id}`,
        { token },
      );
      return { type: 'customer', id: pour.id, label: nomAffichable(r.data) };
    }
    const r = await apiRequest<{ data: { id: number; title: string } }>(cheminApi`/api/properties/${pour.id}`, { token });
    return { type: 'property', id: pour.id, label: r.data.title };
  } catch {
    return null;
  }
}
