import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { AccesAdminProvider } from '@/lib/access/acces-admin-contexte';
import type { AccesAdmin } from '@/lib/access/pages-admin';
import { DashboardEmpty } from '../DashboardEmpty';

/** TCK-633 (lot B, AC1) — l'état vide de l'accueil ne pointe que vers une page qui s'ouvre. */
function rendre(acces: AccesAdmin | null, roles: Parameters<typeof DashboardEmpty>[0]['roles']) {
  const ui = <DashboardEmpty roles={roles} />;
  return render(withIntl(acces ? <AccesAdminProvider acces={acces}>{ui}</AccesAdminProvider> : ui));
}

describe('<DashboardEmpty> (TCK-633)', () => {
  it('solo : « Ouvrir mon espace » vers sa première page', () => {
    rendre({ chemins: ['/admin/agency'], espaceIndividuel: true }, ['agency_admin']);
    expect(screen.getByRole('link', { name: 'Ouvrir mon espace' })).toHaveAttribute('href', '/admin/agency');
  });

  it("admin standard : le lien d'avant, vers /admin", () => {
    rendre({ chemins: ['/admin', '/admin/agency'], espaceIndividuel: false }, ['agency_admin']);
    expect(screen.getByRole('link', { name: "Aller à l'administration" })).toHaveAttribute('href', '/admin');
  });

  it("aucune page d'admin accessible : la variante utilisateur", () => {
    rendre({ chemins: [], espaceIndividuel: false }, ['agency_admin']);
    expect(screen.getByRole('link', { name: 'Explorer les biens' })).toHaveAttribute('href', '/properties');
  });

  it('un client, sans fournisseur : la variante utilisateur', () => {
    rendre(null, ['customer']);
    expect(screen.getByRole('link', { name: 'Explorer les biens' })).toHaveAttribute('href', '/properties');
  });
});
