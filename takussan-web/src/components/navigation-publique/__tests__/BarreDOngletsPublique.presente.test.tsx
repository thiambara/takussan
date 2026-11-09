/**
 * TCK-2568 — `presente` : la page qui la déclare a la barre d'onglets même sous un chemin qui ne la
 * porte pas (le bien retiré, sous `/properties/<slug>`). Sans elle, la barre suit le chemin.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

import { withIntl } from '@/test/intl';

vi.mock('next/navigation', () => ({
  usePathname: () => '/fr/properties/studio-loue',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null, isLoading: false }) }));

const { BarreDOngletsPublique } = await import('../BarreDOngletsPublique');

describe('BarreDOngletsPublique — la surcharge de la page (TCK-2568)', () => {
  it('sous le chemin d’une fiche, sans surcharge : absente', () => {
    const { container } = render(withIntl(<BarreDOngletsPublique />));
    expect(container.querySelector('[data-barre-onglets-publique]')).toBeNull();
  });

  it('presente : la barre est là, ses cinq cases aussi', () => {
    const { container } = render(withIntl(<BarreDOngletsPublique presente />));
    const barre = container.querySelector('[data-barre-onglets-publique]');
    expect(barre).not.toBeNull();
    expect(barre!.querySelectorAll('a')).toHaveLength(5);
  });
});
