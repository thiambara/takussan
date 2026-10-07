import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import fr from '@/messages/fr.json';
import { useCan } from '@/hooks/useCan';
import { withIntl } from '@/test/intl';
import type { PropertyDetail, PropertyListItem } from '@/types/property';
import { PropertyHeaderActions } from '../PropertyHeaderActions';
import { PropertyRowActions } from '../PropertyRowActions';

/**
 * TCK-587 (ADR-0031 §3, AC14 volet bien) — les menus d'un bien ne proposent que ce que le
 * serveur accorde.
 *
 * Le bailleur dont le bien vient d'être PROPOSÉ à l'agence (brouillon privé) se voyait offrir
 * « Publier », « Disponible » et « Supprimer » : trois 403 depuis ce ticket
 * (`properties.publish`, `properties.delete`). Le personnel qui les tient les garde.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/app/actions/dashboard-properties', () => ({
  deletePropertyAction: vi.fn(),
  duplicatePropertyAction: vi.fn(),
  updatePropertyStatusAction: vi.fn(),
  updatePropertyVisibilityAction: vi.fn(),
}));
vi.mock('@/components/documents/AddDocumentButton', () => ({ AddDocumentButton: () => null }));
vi.mock('@/hooks/useCan', () => ({ useCan: vi.fn() }));

const A = fr.property.dashboard.actions;
const STATUT = fr.property.status;

const BIEN = {
  id: 47,
  title: 'Studio à Ouakam',
  slug: 'studio-ouakam',
  status: 'draft',
  visibility: 'private',
} as const;

function tenant(capacites: readonly string[]) {
  vi.mocked(useCan).mockImplementation((capability) => ({
    can: capacites.includes(capability),
    isLoading: false,
  }));
}

async function entrees(user: ReturnType<typeof userEvent.setup>): Promise<string[]> {
  await user.click(screen.getByRole('button', { name: A.more }));
  return (await screen.findAllByRole('menuitem')).map((el) => el.textContent ?? '');
}

const MENUS = {
  'ligne de la liste': () => <PropertyRowActions property={BIEN as unknown as PropertyListItem} />,
  'en-tête de la fiche': () => <PropertyHeaderActions property={BIEN as unknown as PropertyDetail} />,
};

describe.each(Object.entries(MENUS))('menu « %s » (TCK-587)', (_nom, menu) => {
  beforeEach(() => {
    vi.mocked(useCan).mockReset();
  });

  it('le bailleur sans properties.publish ni properties.delete ne se voit offrir ni publication ni suppression', async () => {
    tenant(['properties.update_own']);
    const user = userEvent.setup();
    render(withIntl(menu()));

    const items = await entrees(user);
    expect(items).not.toContain(A.publish);
    expect(items).not.toContain(A.unpublish);
    expect(items).not.toContain(STATUT.available);
    expect(items).not.toContain(STATUT.published);
    expect(items.some((i) => i.includes(A.delete))).toBe(false);
    // Ce qui relève de `update` reste offert.
    expect(items).toContain(STATUT.rented);
  });

  it('le personnel qui tient les deux capacités les garde', async () => {
    tenant(['properties.publish', 'properties.delete', 'properties.update_any']);
    const user = userEvent.setup();
    render(withIntl(menu()));

    const items = await entrees(user);
    expect(items).toContain(A.publish);
    expect(items).toContain(STATUT.available);
    expect(items.some((i) => i.includes(A.delete))).toBe(true);
  });
});
