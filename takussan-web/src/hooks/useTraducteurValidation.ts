'use client';

import { useTranslations } from 'next-intl';

import type { Traducteur } from '@/lib/schemas/messages';

/**
 * Le traducteur à la RACINE du dictionnaire, sous la signature minimale que consomment les
 * fonctions de `src/lib/schemas/messages.ts`.
 *
 * ⚠️ **Racine, et non un espace de noms** : les clés portées par les schémas sont des chemins
 * absolus (`validation.tag.nameRequired`). Un composant qui a déjà un `useTranslations('admin.tags')`
 * sous la main ne peut donc PAS s'en servir pour traduire une erreur de schéma — il lui faut
 * celui-ci, en plus.
 *
 * TCK-1194 (P104.01) — module à part, sans react-hook-form ni zod : `TagsManager` le prenait à
 * `useApiForm.ts` et chargeait react-hook-form pour ces deux lignes. `useApiForm.ts` le réexporte.
 *
 * Existe pour que les trois écrans qui rendent un message de schéma sans passer par
 * react-hook-form n'aient pas à recopier le cast — le recopier, c'est se donner l'occasion de le
 * faire à moitié.
 */
export function useTraducteurValidation(): Traducteur {
  return useTranslations() as unknown as Traducteur;
}
