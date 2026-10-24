/**
 * TCK-2009 (P171.08) — l'historique des interventions d'un bien (`docs/features.md` § 1.8, « P1 ·
 * Consulter l'historique des interventions par bien ») est branché sur la fiche du bien, onglet
 * « Historique », et se pagine comme `MaintenanceList`.
 *
 * Avant : `MaintenanceHistoryByProperty` n'avait aucun appelant, et ne rendait qu'une page.
 * Le lecteur est bouchonné et pagine comme l'API : 15 par défaut, `meta.last_page`.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PropertyDetail } from '@/types/property';
import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import { PropertyDetailTabs } from '@/components/property-dashboard/PropertyDetailTabs';
import { MaintenanceHistoryByProperty } from '../MaintenanceHistoryByProperty';

const lus = vi.hoisted(() => [] as Array<{ propertyId: number | null; page?: number }>);
const interventions = Array.from({ length: 16 }, (_, i) => ({
  id: i + 1, title: `Fuite ${i + 1}`, category: 'plumbing', priority: 'normal', status: 'open',
  created_at: '2026-10-01T09:00:00Z', completed_at: null,
}));

vi.mock('@/lib/queries/maintenance', () => ({
  useMaintenanceHistoryForProperty: (propertyId: number | null, params?: { page?: number; per_page?: number }) => {
    lus.push({ propertyId, page: params?.page });
    const perPage = params?.per_page ?? 15;
    const page = params?.page ?? 1;
    return {
      data: {
        data: interventions.slice((page - 1) * perPage, page * perPage),
        meta: { current_page: page, last_page: Math.ceil(interventions.length / perPage), per_page: perPage, total: interventions.length },
      },
      isLoading: false, isError: false, isSuccess: true, isPending: false, status: 'success', error: null, refetch: vi.fn(),
    };
  },
}));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('tab=history') }));
vi.mock('@/components/property-form/PropertyForm', () => ({ PropertyForm: () => null }));
vi.mock('@/components/property-dashboard/PropertyMediaPanel', () => ({ PropertyMediaPanel: () => null }));
vi.mock('@/components/property-dashboard/PropertyOverviewPanel', () => ({ PropertyOverviewPanel: () => null }));
vi.mock('@/components/property-dashboard/PropertyCollaboratorsPanel', () => ({ PropertyCollaboratorsPanel: () => null }));
vi.mock('@/components/contact/ContactsSurPlaceDuBien', () => ({ ContactsSurPlaceDuBien: () => null }));

const bien = { id: 42, contract_type: 'sale', rent_period: null, photos: [], price_history: [] } as unknown as PropertyDetail;

describe('TCK-2009 — l’historique des interventions sur la fiche du bien', () => {
  beforeEach(() => {
    lus.length = 0;
  });

  it('l’onglet « Historique » de la fiche monte les interventions du bien', async () => {
    render(withIntl(<PropertyDetailTabs property={bien} tags={[]} />));
    expect(await screen.findByRole('heading', { name: fr.maintenance.history.title })).toBeInTheDocument();
    expect(screen.getByText('Fuite 1')).toBeInTheDocument();
    expect(lus.every((l) => l.propertyId === 42)).toBe(true);
  });

  it('se pagine : la 16ᵉ intervention s’atteint par « Suivant »', () => {
    render(withIntl(<MaintenanceHistoryByProperty propertyId={42} />));
    expect(screen.queryByText('Fuite 16')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: fr.maintenance.list.next }));
    expect(screen.getByText('Fuite 16')).toBeInTheDocument();
  });
});
