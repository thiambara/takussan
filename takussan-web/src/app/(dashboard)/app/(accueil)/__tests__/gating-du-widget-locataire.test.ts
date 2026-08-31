import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isTenant } from '@/lib/roles';

/**
 * TCK-492 / AC5 — le widget de check-list locataire (TCK-266) se monte pour un
 * locataire.
 *
 * ⚠ **Ce que ce fichier prouve, et ce qu'il ne prouve pas.** La page d'accueil
 * du tableau de bord est un composant serveur `async` qui va chercher ses KPI :
 * la monter dans vitest reviendrait à monter la moitié du BFF, et le test
 * mesurerait alors les mocks. Ce qui est vérifié ici, c'est la CONDITION de
 * montage lue dans le fichier, plus le comportement du prédicat qu'elle
 * emploie. La troisième moitié de la preuve est côté back —
 * `DerivedRolesTest::test_un_bail_en_cours_ajoute_tenant_et_sa_fin_le_retire`
 * établit que l'API émet bien `tenant`.
 *
 * Les trois ensemble tiennent la chaîne. Aucune seule ne la tient — et le dire
 * vaut mieux que de cocher un critère avec un test qui regarde ailleurs.
 */
const PAGE = join(dirname(fileURLToPath(import.meta.url)), '..', 'page.tsx');

describe('AC5 — la check-list locataire est bien conditionnée au rôle tenant', () => {
  it('la page monte le widget derrière isTenant, et non derrière isCustomer', () => {
    const source = readFileSync(PAGE, 'utf8');

    expect(source, `page introuvable ou vide : ${PAGE}`).toContain(
      '<TenantOnboardingChecklistWidget />',
    );
    expect(source).toContain('isTenant(user.roles) ? <TenantOnboardingChecklistWidget /> : null');

    // `isCustomer` est devenu vrai pour tout compte authentifié : l'employer ici
    // monterait le widget — et sa requête de baux — pour l'agence entière.
    expect(source).not.toContain('isCustomer(user.roles) ? <TenantOnboardingChecklistWidget />');
  });

  it('et le prédicat distingue bien un locataire d’un simple compte', () => {
    expect(isTenant(['customer', 'tenant'])).toBe(true);
    expect(isTenant(['customer'])).toBe(false);
    expect(isTenant(['agency_admin', 'owner', 'customer'])).toBe(false);
  });
});
