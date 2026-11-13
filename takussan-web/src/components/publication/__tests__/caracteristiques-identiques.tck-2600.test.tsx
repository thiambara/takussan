/**
 * TCK-2600 (AC4) — pour un studio en location, l'étape des caractéristiques montre EXACTEMENT les
 * champs que montre `/app/properties/new` : on compare les libellés rendus des deux assistants,
 * menés par le même chemin. Les deux partagent les étapes (`AssistantDePublication`) ; ce test
 * rougit le jour où l'un des deux gagne ou perd un champ.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { moteurEnMemoire, ouvrirBrouillonLocal } from '@/lib/publication/brouillon-local';
import type { Tag } from '@/types/tag';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/publish',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/property-form/useReferentielGeo', () => import('@/test/doublure-referentiel-geo'));
vi.mock('@/components/map/LocationPickerMapLoader', () => ({ LocationPickerMapLoader: () => <div data-testid="carte" /> }));
vi.mock('@/components/providers/UserLocationProvider', () => ({ useUserLocation: () => ({ location: null, loading: false }) }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));
vi.mock('@/lib/queries/referentiel-public', () => ({
  useEquipementsApprouves: () => ({ data: { data: [{ id: 7, name: 'WiFi', slug: 'wifi' }] } }),
}));
vi.mock('@/hooks/useWizardDraft', () => ({
  useWizardDraft: () => ({
    isLoading: false,
    isSaving: false,
    error: null,
    draft: null,
    save: vi.fn(),
    flush: vi.fn(async () => ({ ok: true, ecrit: false })),
    clear: vi.fn(async () => true),
  }),
}));
vi.mock('@/app/actions/dashboard-properties', () => ({
  createPropertyAction: vi.fn(),
  setPropertyTagsAction: vi.fn(),
  uploadPropertyPhotosAction: vi.fn(),
}));
vi.mock('@/app/actions/publish-property', () => ({ publishPropertyAction: vi.fn() }));
vi.mock('@/app/actions/property-contacts', () => ({ replacePropertyContactsAction: vi.fn() }));

import { PropertyWizard } from '@/components/property-form/PropertyWizard';
import { PublierSansCompte } from '../PublierSansCompte';

afterEach(() => cleanup());

const WIFI: Tag = { id: 7, name: 'WiFi', slug: 'wifi', type: 'amenity', icon: null, color: null, description: null, status: 'approved' };

/**
 * Studio, louer, Dakar → l'étape des caractéristiques ; rend les libellés de ses champs, dans
 * l'ordre, puis les équipements que propose la liste (le catalogue public côté anonyme).
 */
async function libellesDesCaracteristiques(): Promise<string[]> {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('radio', { name: /^studio$/i }));
  await user.click(screen.getByRole('radio', { name: /^louer$/i }));
  await user.click(screen.getByRole('button', { name: /^continuer$/i }));
  await user.type(screen.getByLabelText(/ville/i), 'Dakar');
  await user.click(screen.getByRole('button', { name: /^continuer$/i }));
  await screen.findByRole('heading', { level: 1, name: /parlez-nous/i });
  const corps = document.querySelector('[data-wizard-scroll]')!;
  const champs = [...corps.querySelectorAll('label, legend, [role="group"][aria-label], [role="radiogroup"][aria-label]')]
    .map((el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  await user.click(screen.getByLabelText(/équipements/i));
  const equipements = (await screen.findAllByRole('option')).map((o) => `option:${o.textContent?.trim()}`);
  return [...champs, ...equipements];
}

describe('les caractéristiques d’un studio en location, avec et sans compte (AC4)', () => {
  it('les mêmes libellés, dans le même ordre', async () => {
    render(withIntl(<PropertyWizard tags={[WIFI]} fraisDAgence agenceDuChoixDuBailleur={null} />));
    const connecte = await libellesDesCaracteristiques();
    cleanup();

    render(
      withIntl(
        <QueryClientProvider client={new QueryClient()}>
          <PublierSansCompte brouillonLocal={() => ouvrirBrouillonLocal({ moteur: moteurEnMemoire() })} />
        </QueryClientProvider>,
      ),
    );
    const anonyme = await libellesDesCaracteristiques();

    expect(connecte.length).toBeGreaterThan(5);
    expect(anonyme).toEqual(connecte);
  });
});
