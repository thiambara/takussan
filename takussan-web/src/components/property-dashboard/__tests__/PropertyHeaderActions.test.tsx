import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PropertyHeaderActions } from '@/components/property-dashboard/PropertyHeaderActions';
import { updatePropertyVisibilityAction } from '@/app/actions/dashboard-properties';
import { withIntl } from '@/test/intl';
import type { PropertyDetail } from '@/types/property';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

// TCK-587 — les menus d'un bien lisent `properties.publish` et `properties.delete` ; ce fichier
// éprouve autre chose, sous un membre qui les tient. Le cloisonnement a son propre fichier
// (`PropertyActions.capacites.test.tsx`).
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: true, isLoading: false }) }));

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

  // TCK-597 (§8) — l'agence modère : publier rend `pending_review`, et l'écran le dit au lieu
  // d'annoncer « Bien publié ».
  it.each([
    ['pending_review', /envoyé pour validation à l'administrateur de l'agence/i],
    ['available', /^Bien publié\.$/],
  ])('publier un bien qui revient %s', async (status, attendu) => {
    vi.mocked(updatePropertyVisibilityAction).mockResolvedValue({
      ok: true,
      data: { id: 47, status, visibility: status === 'available' ? 'public' : 'private' } as unknown as PropertyDetail,
    });
    const user = userEvent.setup();
    const property = { id: 47, title: 'Studio', slug: 'studio', status: 'draft', visibility: 'private' } as unknown as PropertyDetail;

    render(withIntl(<PropertyHeaderActions property={property} />));
    await user.click(screen.getByRole('button', { name: 'Plus d’actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Publier' }));

    expect(await screen.findByRole('status')).toHaveTextContent(attendu);
  });
});
