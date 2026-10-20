/**
 * TCK-633 (lot C, vérification adverse) — l'onglet « Modifier » d'une annonce porte ses contacts
 * sur place : sans lui, aucune annonce existante ne pouvait en recevoir ni en corriger.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { PropertyDetail } from '@/types/property';
import { withIntl } from '@/test/intl';
import { PropertyDetailTabs } from '../PropertyDetailTabs';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('tab=edit') }));
vi.mock('@/components/property-form/PropertyForm', () => ({ PropertyForm: () => null }));
vi.mock('@/components/property-dashboard/PropertyMediaPanel', () => ({ PropertyMediaPanel: () => null }));
vi.mock('@/components/property-dashboard/PropertyOverviewPanel', () => ({ PropertyOverviewPanel: () => null }));
vi.mock('@/components/property-dashboard/PropertyCollaboratorsPanel', () => ({ PropertyCollaboratorsPanel: () => null }));
vi.mock('@/components/contact/ContactsSurPlaceDuBien', () => ({
  ContactsSurPlaceDuBien: ({ propertyId }: { propertyId: number }) => <div data-testid="contacts-du-bien">{propertyId}</div>,
}));

const bien = { id: 42, contract_type: 'sale', rent_period: null, photos: [], price_history: [] } as unknown as PropertyDetail;

describe('PropertyDetailTabs — contacts sur place (TCK-633)', () => {
  it('l’onglet « Modifier » monte les contacts sur place du bien', () => {
    render(withIntl(<PropertyDetailTabs property={bien} tags={[]} />));

    expect(screen.getByTestId('contacts-du-bien')).toHaveTextContent('42');
  });
});
