import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PropertyHeaderActions } from '@/components/property-dashboard/PropertyHeaderActions';
import { withIntl } from '@/test/intl';
import type { PropertyDetail } from '@/types/property';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/app/actions/dashboard-properties', () => ({
  deletePropertyAction: vi.fn(),
  duplicatePropertyAction: vi.fn(),
  updatePropertyStatusAction: vi.fn(),
  updatePropertyVisibilityAction: vi.fn(),
}));

vi.mock('@/components/documents/AddDocumentButton', () => ({
  AddDocumentButton: () => null,
}));

/**
 * Revue design 2026-09-16 — les six entrées du menu d'en-tête passaient leur action par
 * `onSelect`, que `Menu.Item` de base-ui ne connaît pas : aucune ne faisait rien. Ce test rougit
 * si l'une d'elles y retourne (vérifié par ablation : `onSelect` sur « Supprimer » → pas de
 * dialogue).
 */
describe('PropertyHeaderActions', () => {
  it('« Supprimer » du menu ouvre le dialogue de confirmation', async () => {
    const user = userEvent.setup();
    const property = {
      id: 47,
      title: 'Studio à Ouakam',
      slug: 'studio-ouakam',
      status: 'available',
      visibility: 'private',
    } as unknown as PropertyDetail;

    render(withIntl(<PropertyHeaderActions property={property} />));

    await user.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Supprimer' }));

    expect(await screen.findByRole('dialog', { name: 'Supprimer ce bien ?' })).toBeInTheDocument();
  });
});
