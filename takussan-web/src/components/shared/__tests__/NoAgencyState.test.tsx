import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { AccesAdminProvider } from '@/lib/access/acces-admin-contexte';
import type { AccesAdmin } from '@/lib/access/pages-admin';
import { NoAgencyState } from '../NoAgencyState';

/** TCK-633 (lot B, AC1) — le CTA de l'état « sans agence » mène à une page qui s'ouvre. */
function rendre(acces: AccesAdmin | null) {
  const ui = <NoAgencyState title="Titre" />;
  return render(withIntl(acces ? <AccesAdminProvider acces={acces}>{ui}</AccesAdminProvider> : ui));
}

describe('<NoAgencyState> (TCK-633)', () => {
  it('avec fournisseur : le CTA mène à la première page accessible', () => {
    rendre({ chemins: ['/admin/agency'], espaceIndividuel: true });
    expect(screen.getByRole('link', { name: "Aller à l'administration" })).toHaveAttribute('href', '/admin/agency');
  });

  it('aucune page accessible : pas de CTA', () => {
    rendre({ chemins: [], espaceIndividuel: false });
    expect(screen.queryByRole('link')).toBeNull();
  });

  it("sans fournisseur : le lien d'avant, vers /admin", () => {
    rendre(null);
    expect(screen.getByRole('link', { name: "Aller à l'administration" })).toHaveAttribute('href', '/admin');
  });
});
