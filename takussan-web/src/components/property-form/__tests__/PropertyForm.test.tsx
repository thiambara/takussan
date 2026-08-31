import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';

import messages from '@/messages/fr.json';
import { PropertyForm } from '../PropertyForm';
import type { Tag } from '@/types/tag';
import type { PropertyDetail } from '@/types/property';

// ── Server actions ──────────────────────────────────────────────────────────
//
// TCK-464 — `PropertyForm` ne sert plus que `mode="edit"` : la création vit désormais dans
// `PropertyWizard` (voir `PropertyWizard.test.tsx`). Seules les deux actions que l'édition
// appelle réellement sont mockées ici.

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@/app/actions/dashboard-properties', () => ({
  updatePropertyAction: vi.fn(),
  setPropertyTagsAction: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => routerMocks,
}));

// LocationPickerMapLoader is a dynamic import that touches Leaflet/window — stub it
vi.mock('@/components/map/LocationPickerMapLoader', () => ({
  LocationPickerMapLoader: () => <div data-testid="location-picker-map" />,
}));

import {
  setPropertyTagsAction,
  updatePropertyAction,
} from '@/app/actions/dashboard-properties';

// ── Helpers ─────────────────────────────────────────────────────────────────

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="fr" messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

/** Un bien minimal, apte à la maison — sert aux assertions qui ne portent pas sur la matrice. */
function maison(patch: Record<string, unknown> = {}): PropertyDetail {
  return {
    id: 7,
    title: 'Villa Almadies',
    type: 'house',
    contract_type: 'sale',
    price: 85_000_000,
    currency: 'XOF',
    location: { city: 'Dakar' },
    tags: [],
    ...patch,
  } as never;
}

function renderForm(property: PropertyDetail, tags: Tag[] = []) {
  return render(<PropertyForm mode="edit" property={property} tags={tags} />, { wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updatePropertyAction).mockResolvedValue({
    ok: true,
    data: { id: 7 } as never,
  });
  vi.mocked(setPropertyTagsAction).mockResolvedValue({ ok: true });
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PropertyForm — edit mode', () => {
  it('renders all required sections and no photo section', () => {
    renderForm(maison());
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toContain('Informations générales');
    expect(headings).toContain('Prix');
    expect(headings).toContain('Localisation');
    expect(headings).toContain('Caractéristiques');
    expect(headings).toContain('Description');
    // La création possédait sa propre section Photos ; l'édition passe par
    // `PropertyMediaPanel`, monté ailleurs (cf. `PropertyDetailTabs`).
    expect(headings).not.toContain('Photos');
  });

  it('shows the address and GPS section', () => {
    renderForm(maison());
    expect(screen.getByLabelText(/rue \/ adresse/i)).toBeDefined();
    expect(screen.getByLabelText(/code postal/i)).toBeDefined();
    expect(screen.getByLabelText(/pays/i)).toBeDefined();
    expect(screen.getByTestId('location-picker-map')).toBeDefined();
  });

  it('shows year_built and parking_spaces in characteristics for a habitable property', () => {
    renderForm(maison());
    expect(screen.getByLabelText(/année de construction/i)).toBeDefined();
    expect(screen.getByLabelText(/places de parking/i)).toBeDefined();
  });

  it('shows tags section when tags are provided', () => {
    const tags = [
      { id: 1, name: 'Piscine', slug: 'piscine', type: 'amenity' as const, icon: null, color: null, description: null },
      { id: 2, name: 'Parking', slug: 'parking', type: 'amenity' as const, icon: null, color: null, description: null },
    ];
    renderForm(maison(), tags);
    expect(screen.getByText('Équipements')).toBeDefined();
    expect(screen.getByText('Piscine')).toBeDefined();
    expect(screen.getByText('Parking')).toBeDefined();
  });

  it('does not show tags section when no tags provided', () => {
    renderForm(maison(), []);
    expect(screen.queryByText('Équipements')).toBeNull();
  });

  it('submits and calls updatePropertyAction with the property id and no tag_ids in the body', async () => {
    const user = userEvent.setup();
    renderForm(maison());
    await user.click(screen.getByRole('button', { name: /enregistrer les modifications/i }));
    await waitFor(() => {
      expect(updatePropertyAction).toHaveBeenCalledOnce();
      const [id, payload] = vi.mocked(updatePropertyAction).mock.calls[0] as [
        number,
        Record<string, unknown>,
      ];
      expect(id).toBe(7);
      expect(payload.title).toBe('Villa Almadies');
      expect('tag_ids' in payload).toBe(false);
    });
  });

  it('shows validation error when city is cleared', async () => {
    const user = userEvent.setup();
    renderForm(maison());
    await user.clear(screen.getByLabelText(/ville/i));
    await user.click(screen.getByRole('button', { name: /enregistrer les modifications/i }));
    await waitFor(() => {
      expect(screen.getByText(/la ville est requise/i)).toBeDefined();
    });
    expect(updatePropertyAction).not.toHaveBeenCalled();
  });

  it('keeps entered values and stays on the form when the update fails', async () => {
    vi.mocked(updatePropertyAction).mockResolvedValue({
      ok: false,
      status: 500,
      message: 'Mise à jour impossible.',
    });
    const user = userEvent.setup();
    renderForm(maison());
    await user.clear(screen.getByLabelText(/titre/i));
    await user.type(screen.getByLabelText(/titre/i), 'Villa modifiée');
    await user.click(screen.getByRole('button', { name: /enregistrer les modifications/i }));

    expect(await screen.findByText('Mise à jour impossible.')).toBeDefined();
    expect(routerMocks.push).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/titre/i)).toHaveValue('Villa modifiée');
  });

  it('shows description character counter', () => {
    renderForm(maison({ description: null }));
    expect(screen.getByText(/0 \/ 10 000 caractères/i)).toBeDefined();
  });
});

describe('adresse — champ vidé exprès contre champ jamais touché (TCK-464)', () => {
  it('un champ vidé exprès part explicitement à `null` dans le bloc address', async () => {
    const user = userEvent.setup();
    renderForm(maison({ location: { city: 'Dakar', street: '12 Rue des Baobabs' } }));

    await user.clear(screen.getByLabelText(/rue \/ adresse/i));
    await user.click(screen.getByRole('button', { name: /enregistrer les modifications/i }));

    await waitFor(() => {
      expect(updatePropertyAction).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ address: expect.objectContaining({ street: null }) }),
      );
    });
  });

  it('un champ resté intact — jamais soumis vide, jamais touché — est OMIS, pas nullifié', async () => {
    const user = userEvent.setup();
    renderForm(maison({ location: { city: 'Dakar', street: '12 Rue des Baobabs' } }));

    // On ne touche à rien qui concerne l'adresse : seul le titre change.
    await user.clear(screen.getByLabelText(/titre/i));
    await user.type(screen.getByLabelText(/titre/i), 'Villa Almadies (rénovée)');
    await user.click(screen.getByRole('button', { name: /enregistrer les modifications/i }));

    await waitFor(() => {
      expect(updatePropertyAction).toHaveBeenCalledOnce();
    });
    const [, payload] = vi.mocked(updatePropertyAction).mock.calls[0] as [
      number,
      { address?: Record<string, unknown> },
    ];
    // `street` est rempli et jamais touché : il doit traverser tel quel, jamais `null`.
    expect(payload.address?.street).toBe('12 Rue des Baobabs');
  });

  it('un champ jamais rempli ET jamais touché reste ABSENT du bloc address (pas nullifié)', async () => {
    const user = userEvent.setup();
    // `region`/`street`/`postal_code`/`country` n'ont jamais eu de valeur : l'utilisateur ne les
    // voit jamais remplis, ne les touche pas. `city` reste seule dans le bloc — elle est requise,
    // donc TOUJOURS présente, ce qui est le témoin qu'`address` lui-même n'est pas vide.
    renderForm(maison({ location: { city: 'Dakar' } }));

    await user.click(screen.getByRole('button', { name: /enregistrer les modifications/i }));

    await waitFor(() => {
      expect(updatePropertyAction).toHaveBeenCalledOnce();
    });
    const [, payload] = vi.mocked(updatePropertyAction).mock.calls[0] as [
      number,
      { address?: Record<string, unknown> },
    ];
    expect(payload.address).toEqual({ city: 'Dakar' });
  });
});

describe('conditionnalité en édition (TCK-464)', () => {
  function bien(patch: Record<string, unknown> = {}) {
    return {
      id: 7, title: 'Terrain Diamniadio', type: 'land', contract_type: 'sale',
      price: 25_000_000, currency: 'XOF', title_type: 'bail',
      location: { city: 'Diamniadio' }, tags: [], ...patch,
    } as never;
  }

  it('AC2 — éditer un terrain ne demande plus ses chambres', () => {
    render(<PropertyForm mode="edit" property={bien()} tags={[]} />, { wrapper });
    expect(screen.queryByLabelText(/chambres/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/année de construction/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/statut foncier/i)).toBeInTheDocument();
  });

  it('AC5 — le statut foncier existant est pré-rempli', () => {
    render(<PropertyForm mode="edit" property={bien()} tags={[]} />, { wrapper });
    // ⚠ `FormSelect` (base-ui) rend un `<button role="combobox">`, pas un `<select>` natif : sa
    // valeur DOM (`.value`) est toujours `""`, ce que `toHaveValue()` ne distingue pas d'un champ
    // réellement vide (vérifié : le même assert échoue aussi sur un champ non pré-rempli). Le
    // libellé RENDU (« Bail », résolu par `PROPERTY_ENUM_NAMESPACES.titleType`) est l'unique
    // témoin observable du pré-remplissage pour ce composant.
    expect(screen.getByLabelText(/statut foncier/i)).toHaveTextContent('Bail');
  });

  it('AC3 — éditer un appartement demande son étage, pas ses niveaux', () => {
    render(
      <PropertyForm mode="edit" property={bien({ type: 'apartment', contract_type: 'rent' })} tags={[]} />,
      { wrapper },
    );
    expect(screen.getByLabelText(/étage/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/nombre de niveaux/i)).not.toBeInTheDocument();
  });

  it('AC1 — la ville modifiée part dans le bloc address du PUT', async () => {
    const user = userEvent.setup();
    vi.mocked(updatePropertyAction).mockResolvedValue({ ok: true, data: { id: 7 } } as never);
    render(<PropertyForm mode="edit" property={bien()} tags={[]} />, { wrapper });

    await user.clear(screen.getByLabelText(/ville/i));
    await user.type(screen.getByLabelText(/ville/i), 'Thiès');
    await user.click(screen.getByRole('button', { name: /enregistrer les modifications/i }));

    await waitFor(() => {
      expect(updatePropertyAction).toHaveBeenCalledWith(
        7, expect.objectContaining({ address: expect.objectContaining({ city: 'Thiès' }) }),
      );
    });
  });
});

describe('la matrice, lue jusqu’au bout par l’édition (TCK-488)', () => {
  const AMENITES: Tag[] = [
    { id: 1, name: 'Piscine', slug: 'piscine', type: 'amenity', icon: null, color: null, description: null },
    { id: 2, name: 'Climatisation', slug: 'clim', type: 'amenity', icon: null, color: null, description: null },
  ] as never;

  function terrain(patch: Record<string, unknown> = {}): PropertyDetail {
    return {
      id: 7, title: 'Terrain Diamniadio', type: 'land', contract_type: 'sale',
      price: 25_000_000, currency: 'XOF', location: { city: 'Diamniadio' }, tags: [], ...patch,
    } as never;
  }

  it('AC2 — un terrain ne se voit proposer aucun équipement, même quand la liste en porte', () => {
    renderForm(terrain(), AMENITES);
    expect(screen.queryByText('Équipements')).toBeNull();
    expect(screen.queryByText('Piscine')).toBeNull();
  });

  it.each(['garage', 'parking'])('AC2 — un %s non plus', (type) => {
    renderForm(terrain({ type }), AMENITES);
    expect(screen.queryByText('Équipements')).toBeNull();
  });

  it('AC2 — une maison, elle, les propose toujours', () => {
    renderForm(maison(), AMENITES);
    expect(screen.getByText('Équipements')).toBeDefined();
  });

  it('AC3 — un terrain nomme sa surface comme le parcours la nomme', () => {
    renderForm(terrain());
    expect(screen.getByLabelText(/surface du terrain/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^superficie/i)).not.toBeInTheDocument();
  });

  it('AC3 — un appartement parle de surface habitable', () => {
    renderForm(terrain({ type: 'apartment', contract_type: 'rent' }));
    expect(screen.getByLabelText(/surface habitable/i)).toBeInTheDocument();
  });

  it('AC4 — décocher le dernier équipement envoie bien la liste VIDE', async () => {
    const user = userEvent.setup();
    renderForm(maison({ tags: [{ id: 1, name: 'Piscine', slug: 'piscine', type: 'amenity' }] }), AMENITES);

    await user.click(screen.getByRole('button', { name: /piscine/i }));
    await user.click(screen.getByRole('button', { name: /enregistrer les modifications/i }));

    await waitFor(() => {
      expect(setPropertyTagsAction).toHaveBeenCalledWith(7, []);
    });
  });

  it('AC5 — un tag qui n’est pas un équipement ne part jamais dans la liste', async () => {
    const user = userEvent.setup();
    renderForm(
      maison({
        tags: [
          { id: 1, name: 'Piscine', slug: 'piscine', type: 'amenity' },
          { id: 99, name: 'Coup de cœur', slug: 'coup-de-coeur', type: 'feature' },
        ],
      }),
      AMENITES,
    );

    await user.click(screen.getByRole('button', { name: /enregistrer les modifications/i }));

    await waitFor(() => {
      expect(setPropertyTagsAction).toHaveBeenCalledWith(7, [1]);
    });
  });

  it('AC6 — un échec des équipements est affiché, et ne fait pas croire à un échec du bien', async () => {
    vi.mocked(setPropertyTagsAction).mockResolvedValue({ ok: false, status: 500, message: 'boom' });
    const user = userEvent.setup();
    renderForm(maison(), AMENITES);

    await user.click(screen.getByRole('button', { name: /piscine/i }));
    await user.click(screen.getByRole('button', { name: /enregistrer les modifications/i }));

    expect(await screen.findByText(/le bien est enregistré/i)).toBeDefined();
    // On ne quitte pas la page : c'est ici qu'on réessaie.
    expect(routerMocks.push).not.toHaveBeenCalled();
  });

  it('un terrain ne touche pas aux équipements : la matrice les déclare sans objet', async () => {
    const user = userEvent.setup();
    renderForm(terrain({ tags: [{ id: 1, name: 'Piscine', slug: 'piscine', type: 'amenity' }] }), AMENITES);

    await user.click(screen.getByRole('button', { name: /enregistrer les modifications/i }));

    await waitFor(() => {
      expect(updatePropertyAction).toHaveBeenCalledOnce();
    });
    expect(setPropertyTagsAction).not.toHaveBeenCalled();
  });
});
