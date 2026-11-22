import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';

const nav = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: nav.replace }) }));

import { RenvoiVersLaFiche } from '../RenvoiVersLaFiche';

/** TCK-2602 — le renvoi vers la fiche se fait côté client (pas de `redirect()` sous un repli, TCK-426). */
describe('RenvoiVersLaFiche', () => {
  it('remplace l’adresse par la fiche, et garde un lien visible en attendant', () => {
    render(withIntl(<RenvoiVersLaFiche href="/app/properties/42" />));
    expect(nav.replace).toHaveBeenCalledWith('/app/properties/42');
    expect(screen.getByRole('link', { name: 'Ouvrir la fiche du bien' }).getAttribute('href')).toBe('/app/properties/42');
  });
});
