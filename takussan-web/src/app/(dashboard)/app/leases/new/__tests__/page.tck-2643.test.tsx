import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * TCK-2643 — « Rien ne se perd » de la page `/app/leases/new` : l'état « sans agence » (TCK-115) et
 * « Annuler », qui ramène à la fiche du bien quand on en vient, sinon à la liste des baux. Les entrées
 * `?property=`, `?customer=` et `?booking_id=` passent au formulaire, lues comme un entier positif.
 */
const { ME, FORMULAIRE } = vi.hoisted(() => ({
  ME: { user: { id: '1', roles: ['agent'] as string[], agency_id: 'ag-1' as string | null } },
  FORMULAIRE: vi.fn((_props: Record<string, unknown>) => null),
}));

vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => ME.user }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => Object.assign((k: string) => k, { rich: (k: string) => k }),
}));
vi.mock('@/components/console', () => ({
  PageHeader: ({ actions }: { actions?: React.ReactNode }) => <div data-testid="page-header">{actions}</div>,
}));
vi.mock('@/components/shared/NoAgencyState', () => ({ NoAgencyState: () => <div data-testid="no-agency" /> }));
vi.mock('@/components/leases/CreateLeaseForm', () => ({
  CreateLeaseForm: (props: Record<string, unknown>) => {
    FORMULAIRE(props);
    return <div data-testid="formulaire" />;
  },
}));

import Page from '../page';

const rendre = async (parametres: Record<string, string> = {}) =>
  render(await Page({ searchParams: Promise.resolve(parametres) }));

beforeEach(() => {
  ME.user = { id: '1', roles: ['agent'], agency_id: 'ag-1' };
  FORMULAIRE.mockClear();
});

describe('/app/leases/new — rien ne se perd (TCK-2643)', () => {
  it('un super-admin sans agence voit l’état « sans agence », pas le formulaire', async () => {
    ME.user = { id: '1', roles: ['super_admin'], agency_id: null };
    await rendre();

    expect(screen.getByTestId('no-agency')).toBeInTheDocument();
    expect(screen.queryByTestId('formulaire')).toBeNull();
  });

  it('« Annuler » ramène à la fiche du bien quand on en vient, et les entrées passent au formulaire', async () => {
    await rendre({ property: '13', customer: '3', booking_id: 'abc' });

    expect(screen.getByRole('link', { name: 'actions.cancel' })).toHaveAttribute('href', '/app/properties/13');
    expect(FORMULAIRE).toHaveBeenCalledWith(
      expect.objectContaining({ propertyId: 13, customerId: 3, bookingId: undefined, personnel: true, retour: '/app/properties/13' }),
    );
  });

  it('sans bien, « Annuler » ramène à la liste des baux', async () => {
    await rendre({ booking_id: '7' });

    expect(screen.getByRole('link', { name: 'actions.cancel' })).toHaveAttribute('href', '/app/leases');
    expect(FORMULAIRE).toHaveBeenCalledWith(expect.objectContaining({ bookingId: 7, propertyId: undefined }));
  });
});
