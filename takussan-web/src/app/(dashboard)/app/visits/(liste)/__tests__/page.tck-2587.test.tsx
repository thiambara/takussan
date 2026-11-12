/**
 * TCK-2587 (lot C) — `/app/visits` se partage selon le profil : le personnel et le bailleur lisent
 * les visites par le temps, le client lit « Mes visites » — il n'ouvre plus sur l'onglet
 * « Demandées 0 » (AC6). Les deux vues ont leurs propres tests ; elles sont doublées ici.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());

const getMeAction = vi.fn();
vi.mock('@/app/actions/auth', () => ({ getMeAction: () => getMeAction() }));
vi.mock('@/components/visits/par-le-temps/VisitesParLeTemps', () => ({
  VisitesParLeTemps: ({ titre }: { titre: string }) => <div data-testid="par-le-temps">{titre}</div>,
}));
vi.mock('@/components/visits/client/MesVisites', () => ({
  MesVisites: ({ titre }: { titre: string }) => <div data-testid="mes-visites">{titre}</div>,
}));

import Page from '../page';

async function rendre(roles: string[]) {
  getMeAction.mockResolvedValue({ id: 1, roles, agency_id: 3 });
  render(withIntl(await Page()));
}

beforeEach(() => getMeAction.mockReset());

describe('/app/visits — la vue selon le profil', () => {
  it('le client lit « Mes visites »', async () => {
    await rendre(['customer']);
    expect(screen.getByTestId('mes-visites')).toHaveTextContent('Mes visites');
    expect(screen.queryByTestId('par-le-temps')).toBeNull();
  });

  it.each([['owner'], ['agent'], ['agency_admin']])('le profil « %s » garde les visites par le temps', async (role) => {
    await rendre([role]);
    expect(screen.getByTestId('par-le-temps')).toBeInTheDocument();
    expect(screen.queryByTestId('mes-visites')).toBeNull();
  });
});
