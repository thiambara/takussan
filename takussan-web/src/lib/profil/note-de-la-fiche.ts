import { cache } from 'react';

import { apiFetch } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';
import { isAgent } from '@/lib/roles';
import { profilDAgent, type FaitsDuSommaire } from './sommaire';

/** La note moyenne des avis reçus, telle que la fiche publique de l'agent la rend. */
export interface NoteDeLaFiche {
  readonly moyenne: number;
  readonly nombre: number;
}

/**
 * TCK-2635 (AC5) — la note de « Mes avis » et du sommaire est CELLE DE LA FICHE PUBLIQUE de l'agent
 * (`GET /api/public/agents/{slug}`, la requête que fait sa page publique) :
 * les avis d'un compte ne rendent pas de moyenne, et une moyenne calculée sur une page chargée en
 * serait une autre. Sans fiche publique (pas de `public_slug`), sans avis, ou fiche illisible : `null`,
 * et rien ne s'affiche — jamais un zéro.
 */
export async function noteDeLaFiche(
  { user, profils }: FaitsDuSommaire,
  locale: string,
): Promise<NoteDeLaFiche | null> {
  if (!isAgent(user.roles)) return null;
  const slug = profilDAgent(profils)?.public_slug;
  if (!slug) return null;
  const avis = await avisDeLaFiche(slug, locale);
  if (!avis || avis.count === 0 || avis.average === null) return null;
  return { moyenne: avis.average, nombre: avis.count };
}

/**
 * La même requête que `getAgent` (`lib/queries/public-agent.ts`), sans l'importer : ce module-là tire
 * les types de la fiche publique (`components/public/…`) dans le graphe de `/app`. Une fiche
 * illisible ou absente rend `null` — la note se tait, la page s'affiche.
 */
const avisDeLaFiche = cache(
  async (slug: string, locale: string): Promise<{ average: number | null; count: number } | null> => {
    try {
      const res = await apiFetch<{ data: { reviews?: { average: number | null; count: number } } }>(
        cheminApi`/public/agents/${slug}`,
        undefined,
        { locale },
      );
      return res.data.reviews ?? null;
    } catch {
      return null;
    }
  },
);
