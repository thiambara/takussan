import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { UserRole } from '@/types/user';
import { AccesAdminProvider, useAccesAdmin, useAccesAdminOuRepli } from '../acces-admin-contexte';
import type { AccesAdmin } from '../pages-admin';

function Sonde({ roles, agencyIsStandard }: { roles: UserRole[]; agencyIsStandard?: boolean }) {
  const brut = useAccesAdmin();
  const acces = useAccesAdminOuRepli({ roles, agencyIsStandard });
  return (
    <>
      <output data-testid="brut">{JSON.stringify(brut)}</output>
      <output data-testid="acces">{JSON.stringify(acces)}</output>
    </>
  );
}

const SOLO: AccesAdmin = { chemins: ['/admin/agency'], espaceIndividuel: true };

describe('AccesAdminProvider (TCK-633)', () => {
  it('fournit sa valeur, et le repli est alors ignoré', () => {
    render(
      <AccesAdminProvider acces={SOLO}>
        <Sonde roles={['super_admin']} />
      </AccesAdminProvider>,
    );
    expect(JSON.parse(screen.getByTestId('brut').textContent!)).toEqual(SOLO);
    expect(JSON.parse(screen.getByTestId('acces').textContent!)).toEqual(SOLO);
  });

  it('sans fournisseur : null, et un repli fail-closed dérivé des rôles', () => {
    render(<Sonde roles={['agency_admin']} agencyIsStandard={false} />);
    expect(screen.getByTestId('brut').textContent).toBe('null');
    // Capacités inconnues : « Abonnement » (agency.update_billing) n'y est pas.
    expect(JSON.parse(screen.getByTestId('acces').textContent!)).toEqual({
      chemins: [
        '/admin/agency',
        '/admin/agency/kyc',
        '/admin/finances',
        '/admin/finances/reconciliation',
        '/admin/settings/integrations',
      ],
      espaceIndividuel: true,
    });
  });
});
