import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { avecGestes } from '@/test/habilitations';
import { withIntl } from '@/test/intl';
import type { AdminAgencyDetail } from '@/types/super-admin';
import { AgencyDetailHeader, AgencyModerationActionsMenu } from '../agency-detail';

const AGENCE = {
  id: 12,
  name: 'Dakar Immo',
  slug: 'dakar-immo',
  status: 'suspended',
  is_verified: true,
  verified_at: '2026-05-01T10:00:00+00:00',
  primary_admin_id: null,
  license_number: null,
  email: null,
  phone: null,
  logo_url: null,
  properties_count: 3,
  members_count: 2,
  created_at: '2026-01-15T10:00:00+00:00',
  last_activity_at: null,
  website: null,
  description: null,
  commission_rate: null,
  currency: 'XOF',
  founded_at: null,
  public_url: '/agences/dakar-immo',
  primary_admin: null,
  address: null,
  suspension: { reason: 'Plaintes répétées de locataires.', suspended_at: '2026-10-02T09:00:00+00:00' },
} as unknown as AdminAgencyDetail;

function rendre(noeud: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={queryClient}>{avecGestes(noeud)}</QueryClientProvider>));
}

/** TCK-600 (ADR-0048) — une agence suspendue l'affiche, motif et date compris ; une seule sortie. */
describe('fiche d’une agence suspendue', () => {
  it('affiche le motif et la date de la suspension', () => {
    rendre(<AgencyDetailHeader agency={AGENCE} />);
    const bloc = screen.getByTestId('agency-suspension');
    expect(bloc).toHaveTextContent('Suspendue le 2 oct. 2026');
    expect(bloc).toHaveTextContent('Motif : Plaintes répétées de locataires.');
  });

  it('rien hors suspension', () => {
    rendre(<AgencyDetailHeader agency={{ ...AGENCE, status: 'active', suspension: null }} />);
    expect(screen.queryByTestId('agency-suspension')).toBeNull();
  });

  it('ne propose que « Lever la suspension »', () => {
    const { container } = rendre(<AgencyModerationActionsMenu agency={AGENCE} />);
    const section = container.querySelector('section')!;
    expect(within(section).getAllByRole('button').map((b) => b.textContent?.trim())).toEqual(['Lever la suspension']);
  });
});
