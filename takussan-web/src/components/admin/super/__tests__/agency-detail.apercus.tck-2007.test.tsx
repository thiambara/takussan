/**
 * TCK-2007 (P171.04) — les onglets « Équipe » et « Portefeuille » de la fiche d'agence de la console
 * gardent un aperçu court (10 membres, 8 biens), mais disent le total et mènent à la liste entière,
 * filtrée sur l'agence.
 *
 * Avant : la liste reçue seule, sans `meta.total` ni lien — 8 biens sous « Portefeuille » pour une
 * agence qui en porte 214.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import { AgencyPropertiesTab, AgencyTeamTab } from '../agency-detail';
import type { AdminAgencyTeamMember, AdminPropertyRow } from '@/types/super-admin';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

const biens = Array.from({ length: 8 }, (_, i) => ({
  id: i + 1, title: `Bien ${i + 1}`, reference_number: `R-${i + 1}`, status: 'published', price: 1000, currency: 'XOF',
})) as unknown as AdminPropertyRow[];
const membres = Array.from({ length: 10 }, (_, i) => ({
  id: i + 1, full_name: `Membre ${i + 1}`, email: `m${i + 1}@exemple.sn`, roles: ['agent'],
})) as unknown as AdminAgencyTeamMember[];

describe('TCK-2007 — aperçus de la fiche d’agence', () => {
  it('« Portefeuille » dit le total et mène aux biens de l’agence', () => {
    render(withIntl(<AgencyPropertiesTab properties={biens} total={214} agencyId={7} loading={false} />));
    expect(screen.getByText('214')).toBeInTheDocument();
    const lien = screen.getByRole('link', { name: fr.superAdmin.agencyDetail.seeAll });
    const url = new URL(lien.getAttribute('href') ?? '', 'http://site.test');
    expect(url.pathname).toBe('/super-admin/properties');
    expect(url.searchParams.get('filter[agency_id]')).toBe('7');
  });

  it('« Équipe » dit le total et mène aux comptes de l’agence', () => {
    render(withIntl(<AgencyTeamTab members={membres} total={37} agencyId={7} loading={false} />));
    expect(screen.getByText('37')).toBeInTheDocument();
    const lien = screen.getByRole('link', { name: fr.superAdmin.agencyDetail.seeAll });
    const url = new URL(lien.getAttribute('href') ?? '', 'http://site.test');
    expect(url.pathname).toBe('/super-admin/users');
    expect(url.searchParams.get('agency')).toBe('7');
  });
});
