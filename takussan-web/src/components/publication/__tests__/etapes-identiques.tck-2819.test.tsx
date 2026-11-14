/**
 * TCK-2819 (AC1) — un seul assistant, un seul dessin : pour un studio en location au mois, `/publish`
 * (sans compte) et `/app/properties/new` (un particulier, sans frais d'agence) rendent À CHAQUE ÉTAPE
 * les mêmes champs, dans le même ordre. Étend à toutes les étapes le test de TCK-2600 (AC4), qui ne
 * lisait que les caractéristiques.
 *
 * Ce qui est lu : les libellés de champ (`label`, `legend`), les groupes nommés (`role=group|radiogroup`)
 * et les gestes d'une étape (boutons du corps, dont les pastilles et les cartes) — la zone défilante
 * seulement, ni l'en-tête, ni le pied, ni la colonne d'aperçu. Une étape copiée pour une seule entrée rougit ce test dès qu'elle
 * gagne, perd ou renomme un champ.
 *
 * Seule différence admise, et nommée : la finition connectée porte « Vos coordonnées pour les
 * intéressés » (le compte existe déjà) ; sans compte, ces coordonnées sont demandées par la feuille de
 * compte au moment de publier (TCK-2601, ADR-0093 : aucune donnée d'une personne au brouillon).
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
vi.mock('@/lib/reduire-photo', () => ({
  reduirePhoto: vi.fn(async (f: File) => f),
  reduirePhotos: vi.fn(async (fs: readonly File[]) => [...fs]),
  reduirePhotosSousPlafond: vi.fn(async (fs: readonly File[]) => [...fs]),
}));
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

/** Les champs et les gestes de l'étape affichée, dans l'ordre du document. */
function champsDeLEtape(): string[] {
  const corps = document.querySelector('[data-wizard-scroll]')!;
  return [...corps.querySelectorAll('label, legend, [role="group"][aria-label], [role="radiogroup"][aria-label], button, [role="radio"], [role="checkbox"]')]
    // Sans compte, la colonne d'aperçu vit DANS la zone défilante (cadre d'entrée, TCK-2600) : hors de l'étape.
    .filter((el) => !el.closest('aside'))
    .map((el) => `${el.tagName.toLowerCase()}:${(el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim()}`)
    .filter((x) => !x.endsWith(':'));
}

const suivant = () => screen.getByRole('button', { name: /^continuer$/i });

/** Studio, louer, Dakar, 250 000 F au mois, 2 photos : relève les six étapes, du bien au titre. */
async function parcourir(): Promise<string[][]> {
  const user = userEvent.setup();
  const etapes: string[][] = [];
  await user.click(await screen.findByRole('radio', { name: /^studio$/i }));
  await user.click(screen.getByRole('radio', { name: /^louer$/i }));
  etapes.push(champsDeLEtape());
  await user.click(suivant()); //                                  → le lieu
  await user.type(screen.getByLabelText(/ville/i), 'Dakar');
  etapes.push(champsDeLEtape());
  await user.click(suivant()); //                                  → les caractéristiques
  await screen.findByRole('heading', { level: 1, name: /parlez-nous/i });
  etapes.push(champsDeLEtape());
  await user.click(suivant()); //                                  → le prix
  await screen.findByRole('heading', { level: 1, name: /à quel prix/i });
  await user.type(screen.getByLabelText(/^loyer|^prix/i), '250000');
  etapes.push(champsDeLEtape());
  await user.click(suivant()); //                                  → les photos
  await screen.findByRole('heading', { level: 1, name: /photos/i });
  await user.upload(
    screen.getByTestId('media-dropzone-input'),
    ['salon.jpg', 'cuisine.jpg'].map((n) => new File(['x'], n, { type: 'image/jpeg' })),
  );
  await screen.findByText('2 photos sur 10');
  etapes.push(champsDeLEtape());
  await user.click(suivant()); //                                  → le titre
  await screen.findByRole('heading', { level: 1, name: /un titre/i });
  etapes.push(champsDeLEtape());
  return etapes;
}

/** Les coordonnées du compte, propres à l'entrée connectée (cf. en-tête). */
const COORDONNEES_DU_COMPTE = /coordonnées pour les intéressés|^(label|legend|button):(Téléphone|Numéro WhatsApp|WhatsApp|Courriel|E-mail)/i;

describe('TCK-2819 — les six étapes d’un studio en location au mois, avec et sans compte (AC1)', () => {
  it('à chaque étape, les mêmes champs et les mêmes gestes, dans le même ordre', async () => {
    render(withIntl(<PropertyWizard tags={[WIFI]} fraisDAgence={false} agenceDuChoixDuBailleur={null} />));
    const connecte = await parcourir();
    cleanup();

    render(
      withIntl(
        <QueryClientProvider client={new QueryClient()}>
          <PublierSansCompte brouillonLocal={() => ouvrirBrouillonLocal({ moteur: moteurEnMemoire() })} />
        </QueryClientProvider>,
      ),
    );
    const anonyme = await parcourir();

    expect(connecte).toHaveLength(6);
    expect(anonyme).toHaveLength(6);
    for (let i = 0; i < 6; i += 1) {
      const attendu = i === 5 ? connecte[i].filter((x) => !COORDONNEES_DU_COMPTE.test(x)) : connecte[i];
      expect(attendu.length, `étape ${i + 1} : rien de relevé`).toBeGreaterThan(1);
      expect(anonyme[i], `étape ${i + 1}`).toEqual(attendu);
    }
  });
});
