import { cache } from 'react';

import { fetchPropertyModerationDetail } from '@/lib/queries/property-moderation';

/**
 * TCK-2931 — la lecture de modération d'un bien à valider (`GET /api/properties/moderation/{id}`),
 * une fois par rendu : le layout en tire l'introuvable, la page la donne à l'aperçu. `cache()` de
 * React : mêmes arguments, même promesse, pour la durée d'UNE requête serveur.
 */
export const lireBienAValiderDuRendu = cache((token: string, id: number) => fetchPropertyModerationDetail(id, token));
