/**
 * TCK-586, AC10 — le type d'une relation client s'affiche par un libellé traduit.
 *
 * L'onglet affichait `relationship_type.replace('_', ' / ')` — « owner / tenant » dans toutes les
 * langues (principe n°5 : le front possède le texte affiché). Une valeur que le front ne connaît
 * pas s'affiche par un libellé neutre, jamais par son code.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { CustomerDetail, CustomerRelationship } from '@/types/customer';
import { withIntl } from '@/test/intl';
import { CustomerDetailTabs } from '../CustomerDetailTabs';

vi.mock('@/components/customer-form', () => ({ CustomerForm: () => null }));
vi.mock('../CustomerNotesTimeline', () => ({ CustomerNotesTimeline: () => null }));
vi.mock('../CustomerDocumentsPanel', () => ({ CustomerDocumentsPanel: () => null }));

function relation(id: number, relationship_type: string): CustomerRelationship {
  return {
    id,
    user_id: 1,
    customer_id: 1,
    relationship_type,
    is_primary: false,
    status: 'active',
    start_date: '2026-01-01T00:00:00Z',
    end_date: null,
    notes: null,
  } as CustomerRelationship;
}

async function ongletRelations(relationships: CustomerRelationship[]) {
  render(withIntl(
    <CustomerDetailTabs
      customer={{ id: 1 } as CustomerDetail}
      notes={[]}
      documents={[]}
      relationships={relationships}
    />,
  ));
  await userEvent.setup().click(screen.getByRole('tab', { name: /Relations/ }));
}

describe('CustomerDetailTabs — onglet relations', () => {
  it('affiche le libellé français d’une relation owner_tenant, pas son code', async () => {
    await ongletRelations([relation(1, 'owner_tenant')]);

    expect(screen.getByText('Bailleur / locataire')).toBeInTheDocument();
    expect(screen.queryByText(/owner \/ tenant/)).not.toBeInTheDocument();
  });

  it('affiche un libellé neutre pour une valeur inconnue, jamais son code', async () => {
    await ongletRelations([relation(2, 'broker_client')]);

    expect(screen.getByText('Autre relation')).toBeInTheDocument();
    expect(screen.queryByText(/broker/)).not.toBeInTheDocument();
  });
});
