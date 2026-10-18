/**
 * TCK-917 (P13.10) — le code mort du front reste retiré, et `formatCurrency` n'a qu'un sens.
 *
 * Mesuré le 2026-10-18 par un résolveur d'imports (tests exclus) : ces fichiers n'avaient aucun
 * importeur, et ces exports aucun appelant, pas même un test. Ce test ne cherche pas le code mort
 * en général (ce serait une garde neuve) : il empêche celui-ci de revenir.
 *
 * `Money`, `useAgencyCurrency` et `ShareButton` n'ont pas d'importeur non plus, mais chacun a son
 * test : retirer un test est fermé à l'agent qui a écrit celui-ci (ADR-0066). Ils restent, au
 * porteur de trancher.
 *
 * Deux `formatCurrency` homonymes coexistaient : `lib/format.ts` prend une LANGUE en second
 * argument, `lib/format/currency.ts` une DEVISE. `formatCurrency(prix, 'fr')` écrit au mauvais
 * module rendait `150 000 F CFA` par le repli sur XOF, sans erreur de type (`string`) : la confusion
 * ne se voyait qu'avec une devise étrangère. Le second s'appelle désormais `formatMontant`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RACINE_SRC, sourcesDe } from '@/test/analyse-statique';

const FICHIERS_RETIRES = [
  'hooks/useRequireAuth.ts',
  'components/shared/StubPlaceholder.tsx',
  'components/property/index.ts',
  'types/common.ts',
  'types/payment.ts',
];

/** `[fichier, export]` : le fichier vit, l'export sans appelant n'y est plus. */
const EXPORTS_RETIRES: ReadonlyArray<readonly [string, string]> = [
  ['app/actions/profiles.ts', 'switchActiveProfileAction'],
  ['lib/wizard-drafts.ts', 'fetchWizardDraft'],
  ['lib/wizard-drafts.ts', 'upsertWizardDraft'],
  ['lib/wizard-drafts.ts', 'deleteWizardDraft'],
  ['lib/queries/leases.ts', 'useUpdateLease'],
  ['lib/queries/leases.ts', 'useRefundDeposit'],
  ['lib/queries/leases.ts', 'useConfirmEarlyTermination'],
  ['lib/queries/agency-members.ts', 'fetchAgencyMembers'],
  ['lib/queries/agency-members.ts', 'updateAgencyMemberRole'],
  ['lib/queries/agency-roles.ts', 'useAgencyRole'],
  ['lib/queries/capabilities.ts', 'isPlatformReserved'],
  ['lib/queries/customers.ts', 'CUSTOMER_DOCUMENT_ACCEPT'],
  ['lib/queries/documents.ts', 'useDocument'],
  ['lib/queries/favorites.ts', 'useInvalidateFavorites'],
  ['lib/queries/inventory.ts', 'useInventoriesForProperty'],
  ['lib/queries/inventory.ts', 'useUpdateInventory'],
  ['lib/schemas/search.ts', 'contractTypeSchema'],
  ['lib/schemas/search.ts', 'rentPeriodSchema'],
  ['lib/schemas/search.ts', 'sortSchema'],
  ['lib/service-provider-onboarding.ts', 'uploadSpKyc'],
  ['lib/impersonation-serveur.ts', 'jetonDImpersonation'],
  ['lib/calendar-date.ts', 'endOfMonth'],
  ['lib/calendar-date.ts', 'WeekdayKey'],
  ['i18n/hooks.ts', 'useFormatNumber'],
  ['hooks/useSearch.ts', 'IGNORED_KEYS'],
  ['components/ui/field-density.ts', 'FIELD_DENSITY_ATTRIBUTE'],
  ['components/payments/constants.ts', 'PaymentMethod'],
  ['types/agency-role.ts', 'DeleteRoleConflict'],
  ['types/api.ts', 'ApiErrorBody'],
  ['types/customer.ts', 'PaginatedCustomers'],
];

const declare = (texte: string, nom: string) =>
  new RegExp(
    `export\\s+(?:async\\s+)?(?:function\\*?|const|let|class|interface|type|enum)\\s+${nom}\\b`,
  ).test(texte);

describe('TCK-917 — le code mort du front ne revient pas', () => {
  it.each(FICHIERS_RETIRES)('%s est retiré', (fichier) => {
    expect(existsSync(join(RACINE_SRC, fichier))).toBe(false);
  });

  it.each(EXPORTS_RETIRES)('%s ne déclare plus %s', (fichier, nom) => {
    const texte = readFileSync(join(RACINE_SRC, fichier), 'utf8');
    expect(declare(texte, nom)).toBe(false);
  });
});

describe('TCK-917 — un seul formatCurrency', () => {
  it('seul lib/format.ts déclare formatCurrency', () => {
    const declarants = sourcesDe(RACINE_SRC)
      .filter((f) => !/\.test\.tsx?$/.test(f))
      .filter((f) => declare(readFileSync(f, 'utf8'), 'formatCurrency'))
      .map((f) => f.slice(RACINE_SRC.length + 1));
    expect(declarants).toEqual(['lib/format.ts']);
  });

  it('aucun module n’importe formatCurrency de lib/format/currency', () => {
    const fautifs = sourcesDe(RACINE_SRC).filter((f) =>
      /import\s*\{[^}]*\bformatCurrency\b[^}]*\}\s*from\s*['"](?:@\/lib\/format\/currency|\.\/format\/currency|\.\/currency)['"]/.test(
        readFileSync(f, 'utf8'),
      ),
    );
    expect(fautifs).toEqual([]);
  });
});
