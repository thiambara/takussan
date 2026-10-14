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
    rendre({ chemins: ['/app/agency'], espaceIndividuel: true });
    expect(screen.getByRole('link', { name: "Aller à l'administration" })).toHaveAttribute('href', '/app/agency');
  });

  it('aucune page accessible : pas de CTA', () => {
    rendre({ chemins: [], espaceIndividuel: false });
    expect(screen.queryByRole('link')).toBeNull();
  });

  // TCK-647 — l'ancien tableau de bord de la console n'est plus une page : un lien deviné
  // mènerait à un 404.
  it('sans fournisseur : pas de CTA plutôt qu’un lien deviné', () => {
    rendre(null);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
