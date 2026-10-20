import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { PropertyListItem } from '@/types/property';
import { PropertyRowActions } from '../PropertyRowActions';

/**
 * TCK-1035 (piste P68.08) — sur `/app/properties`, chaque ligne portait un bouton « Plus
 * d'actions » au nom identique : 20 fois le même nom dans la liste des boutons, sans le bien visé.
 * Le nom porte désormais le titre du bien, comme les « Ouvrir » de TCK-912 ; le bouton reste une
 * icône, aucun texte visible ne change.
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
vi.mock('@/hooks/useCan', () => ({ useCan: () => ({ can: true, isLoading: false }) }));

const bien = (id: number, title: string) =>
  ({ id, title, slug: `bien-${id}`, status: 'available', visibility: 'public' }) as unknown as PropertyListItem;

describe('<PropertyRowActions> — nom du menu de ligne', () => {
  it.each([
    ['fr', 'Plus d’actions — Studio à Ouakam', 'Plus d’actions — Villa aux Almadies'],
    ['en', 'More actions — Studio à Ouakam', 'More actions — Villa aux Almadies'],
  ] as const)('en %s, chaque ligne nomme son bien', (locale, premier, second) => {
    render(withIntl(
      <>
        <PropertyRowActions property={bien(1, 'Studio à Ouakam')} />
        <PropertyRowActions property={bien(2, 'Villa aux Almadies')} />
      </>,
      locale,
    ));

    expect(screen.getByRole('button', { name: premier })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: second })).toBeInTheDocument();
  });
});
