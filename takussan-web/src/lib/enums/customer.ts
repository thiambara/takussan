/**
 * Les VALEURS des énumérations de client (CRM), sans aucune dépendance — TCK-1039 (P70.02).
 *
 * ⚠ **Ce module n'importe rien, et c'est sa raison d'être** (le patron de `./property.ts`,
 * TCK-744). Ces listes vivaient dans `@/lib/schemas/customer`, qui commence par
 * `import { z } from 'zod'` : la liste des clients de la console chargeait zod (64 Kio gzip) pour
 * traduire un statut. Un composant d'affichage importe ICI ; `@/lib/schemas/customer` les
 * réexporte pour les formulaires. Garde :
 * `src/app/(dashboard)/__tests__/zod-hors-des-ecrans-de-lecture.test.ts`.
 */

export const customerStatusValues = [
  'active',
  'inactive',
  'blocked',
  'deleted',
] as const;

export const pipelineStageValues = [
  'lead',
  'prospect',
  'qualified',
  'negotiating',
  'converted',
  'lost',
] as const;

export const idTypeValues = ['id_card', 'passport', 'driving_license'] as const;
