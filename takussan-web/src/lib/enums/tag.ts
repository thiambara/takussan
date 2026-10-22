/**
 * Les VALEURS des types d'étiquette qu'un formulaire peut créer, sans aucune dépendance —
 * TCK-1196 (P104.02), patron de TCK-744 et TCK-1039.
 *
 * ⚠ **Ce module n'importe rien, et c'est sa raison d'être.** La liste vivait dans
 * `@/lib/schemas/tag`, qui commence par `import { z } from 'zod'` : l'écran des étiquettes de la
 * console chargeait zod (64,2 Kio gzip) pour lire ce tableau au rendu. `@/lib/schemas/tag` la
 * réexporte pour le schéma. Garde :
 * `src/app/__tests__/graphe-client-de-la-console.test.ts`.
 *
 * TCK-633 (ADR-0062 §7) — `feature` en sort : la migration de la tâche 10 a fusionné ses
 * étiquettes dans `amenity`, et `StoreTagRequest` le refuse. Il reste dans `TagType`
 * (`types/tag.ts`) : un tag déjà là se lit encore.
 */
export const tagTypeValues = ['amenity', 'label', 'crm'] as const;
