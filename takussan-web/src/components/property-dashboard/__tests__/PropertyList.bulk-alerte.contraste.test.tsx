/**
 * Piste P07.03 — l'erreur de la barre d'actions groupées doit être lisible.
 *
 * La barre est sombre (`bg-foreground/95`) ; l'alerte y était posée en `text-destructive`, encre
 * pensée pour un fond clair : 2,22:1 en thème clair, 2,11:1 en sombre (WCAG 2.2 §1.4.3 demande
 * 4,5:1). `check-destructive-contrast.mjs` ne lit que `bg-destructive/NN`, jamais ce fond.
 *
 * Le test rend la barre, provoque l'échec d'un lot, puis compose l'encre de l'alerte sur CHACUN
 * des fonds qu'elle peut avoir — le sien, ou celui qu'elle hérite de la barre — dans les deux
 * thèmes. Jsdom n'a pas de moteur CSS : on lit les classes du DOM rendu.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PropertyList } from '@/components/property-dashboard/PropertyList';
import {
  JETONS_CLAIR,
  JETONS_SOMBRE,
  SEUIL_AA_TEXTE,
  composer,
  contraste,
  fmt,
  fondsPossibles,
  litUtilitaireDeCouleur,
  resoudreCouleur,
  versRvb,
} from '@/test/contraste-wcag';
import { withIntl } from '@/test/intl';
import type { PaginatedResponse } from '@/types/api';
import type { PropertyListItem } from '@/types/property';

const { bulkUnpublish } = vi.hoisted(() => ({ bulkUnpublish: vi.fn() }));

vi.mock('@/hooks/useCan', () => ({
  useCan: () => ({ can: true, isLoading: false }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/app/actions/dashboard-properties', () => ({
  deletePropertyAction: vi.fn(),
  duplicatePropertyAction: vi.fn(),
  updatePropertyStatusAction: vi.fn(),
  updatePropertyVisibilityAction: vi.fn(),
  bulkAssignPropertiesAction: vi.fn(),
  bulkArchivePropertiesAction: vi.fn(),
  bulkUnpublishPropertiesAction: bulkUnpublish,
}));

const bien = (id: number): PropertyListItem => ({
  id,
  reference_number: `TK-${id}`,
  title: `Bien ${id}`,
  slug: `bien-${id}`,
  price: 100000,
  currency: 'XOF',
  type: 'apartment',
  contract_type: 'rent',
  rent_period: 'monthly',
  status: 'available',
  visibility: 'public',
  views_count: 0,
  favorites_count: 0,
  location: { quarter: null, city: 'Dakar', region: null, country: 'SN', latitude: null, longitude: null },
  bedrooms: 2,
  bathrooms: 1,
  area: 60,
  furnished: false,
  featured: false,
  main_photo_url: null,
  published_at: null,
  created_at: '2026-09-01T00:00:00Z',
} as PropertyListItem);

const page: PaginatedResponse<PropertyListItem> = {
  data: [1, 2].map(bien),
  meta: { total: 2, current_page: 1, last_page: 1, per_page: 20 },
  links: { first: null, last: null, prev: null, next: null },
} as PaginatedResponse<PropertyListItem>;

const THEMES = [
  ['clair', JETONS_CLAIR],
  ['sombre', JETONS_SOMBRE],
] as const;

describe('PropertyList — l’erreur de la barre d’actions groupées (P07.03)', () => {
  it('tient 4,5:1 sur chacun de ses fonds, dans les deux thèmes', async () => {
    bulkUnpublish.mockResolvedValueOnce({ ok: false, message: 'Lot refusé' });
    const user = userEvent.setup();
    render(withIntl(<PropertyList page={page} />));

    await user.click(screen.getByRole('checkbox', { name: 'Sélectionner tous les biens' }));
    const barre = screen.getByRole('region', { name: 'Actions groupées' });
    await user.click(within(barre).getByRole('button', { name: /Dépublier/ }));
    const alerte = await within(barre).findByRole('alert');
    expect(alerte).toHaveTextContent('Lot refusé');

    const encres = Array.from(alerte.classList)
      .map((c) => litUtilitaireDeCouleur(c, 'text'))
      .filter((u): u is NonNullable<typeof u> => u !== null && u.variante === '');
    expect(encres, 'une seule encre de repos sur l’alerte').toHaveLength(1);
    const encre = encres[0];

    const sousLeSeuil: string[] = [];
    for (const [theme, jetons] of THEMES) {
      const fonds = fondsPossibles(alerte, jetons);
      expect(fonds.length).toBeGreaterThan(0);
      for (const fond of fonds) {
        const brute = versRvb(resoudreCouleur(encre.jeton, jetons));
        const posee = encre.alpha === 1 ? brute : composer(brute, versRvb(fond.hex), encre.alpha);
        const ratio = contraste(posee, fond.hex);
        if (ratio < SEUIL_AA_TEXTE) {
          sousLeSeuil.push(`${theme}, text-${encre.jeton} sur ${fond.provenance} (${fond.etat}) : ${fmt(ratio)}`);
        }
      }
    }
    expect(sousLeSeuil).toEqual([]);
  });
});
