import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';

/**
 * TCK-997 (P15.06, P50.01, lot C) — le choix du bailleur dans l'assistant de création. Le personnel
 * d'une agence `standard` choisit, facultativement, le bailleur au nom duquel il saisit le bien :
 * le choix part en `owner_id` dans le corps de la création, et sans choix la clé est ABSENTE (le
 * bien reste celui de l'agence, Q1). Le harnais reprend celui de
 * `PropertyWizard.publication.tck-633.test.tsx`.
 */

const requete = vi.hoisted(() => ({ useQuery: vi.fn() }));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: (...a: unknown[]) => requete.useQuery(...a),
}));
// Le référentiel des villes est doublé, comme dans `PropertyWizard.test.tsx` : il est la seule autre
// lecture de l'assistant.
vi.mock('@/components/property-form/useReferentielGeo', () => import('@/test/doublure-referentiel-geo'));

const routeur = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => routeur }));

vi.mock('@/components/map/LocationPickerMapLoader', () => ({
  LocationPickerMapLoader: () => <div data-testid="carte" />,
}));

type Localisation = {
  city?: string;
  region?: string;
  country_code?: string;
  currency?: string;
} | null;

const geo = vi.hoisted(() => ({
  valeur: null as Localisation,
  loading: false,
}));
vi.mock('@/components/providers/UserLocationProvider', () => ({
  useUserLocation: () => ({ location: geo.valeur, loading: geo.loading }),
}));

const brouillon = vi.hoisted(() => ({
  etat: {
    isLoading: false,
    isSaving: false,
    error: null as Error | null,
    draft: null as { step: number; data: Record<string, unknown> | null } | null,
    save: vi.fn(),
    flush: vi.fn(),
    clear: vi.fn(),
  },
}));
vi.mock('@/hooks/useWizardDraft', () => ({ useWizardDraft: () => brouillon.etat }));

const reduction = vi.hoisted(() => ({
  reduirePhoto: vi.fn(async (f: File) => f),
  reduirePhotos: vi.fn(async (fs: readonly File[]) => [...fs]),
  reduirePhotosSousPlafond: vi.fn(async (fs: readonly File[]) => [...fs]),
}));
vi.mock('@/lib/reduire-photo', () => reduction);

vi.mock('@/app/actions/dashboard-properties', () => ({
  createPropertyAction: vi.fn(),
  setPropertyTagsAction: vi.fn(),
  updatePropertyVisibilityAction: vi.fn(),
  uploadPropertyPhotosAction: vi.fn(),
}));

const toast = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => toast }));

const pub = vi.hoisted(() => ({ publier: vi.fn(), contacts: vi.fn() }));
vi.mock('@/app/actions/publish-property', () => ({
  publishPropertyAction: (...a: unknown[]) => pub.publier(...a),
}));
vi.mock('@/app/actions/property-contacts', () => ({
  replacePropertyContactsAction: (...a: unknown[]) => pub.contacts(...a),
}));

const auth = vi.hoisted(() => ({ user: null as Record<string, unknown> | null }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: auth.user, setUser: vi.fn(), refreshUser: vi.fn() }),
}));

import { createPropertyAction, setPropertyTagsAction, uploadPropertyPhotosAction } from '@/app/actions/dashboard-properties';
import { PropertyWizard } from '../PropertyWizard';
import { ChoixDuBailleur } from '../ChoixDuBailleur';
import { avecBailleur, type PropertyCreatePayload } from '../payload';

const COMPLET = {
  title: 'Villa à Mbour', type: 'villa', contract_type: 'sale', price: 25000000,
  currency: 'XOF', city: 'Mbour', furnished: false, tag_ids: [],
};

/** Deux bailleurs actifs ; le troisième, invité sans compte, n'a pas de `user_id` à désigner. */
const BAILLEURS = {
  data: [
    { id: 501, user_id: 71, metadata: null, user: { id: 71, first_name: 'Bineta', last_name: 'Sarr', email: 'b@x.sn' } },
    { id: 502, user_id: 72, metadata: { first_name: 'Ousmane', last_name: 'Ba' }, user: { id: 72, first_name: '', last_name: '', email: '' } },
    { id: 503, user_id: null, metadata: { first_name: 'Invité', last_name: 'Sans compte' }, user: null },
  ],
};

const LIBELLE = 'Au nom de qui saisissez-vous ce bien ?';

async function allerAuBoutDepuisLePremierPas(choisir: string | null, agence: number | null = 3) {
  brouillon.etat.draft = { step: 0, data: COMPLET };
  const user = userEvent.setup();
  render(withIntl(<PropertyWizard agenceDuChoixDuBailleur={agence} />));
  await screen.findByRole('progressbar', { value: { text: 'Étape 1 sur 6' } });
  if (choisir !== null) {
    fireEvent.change(screen.getByLabelText(LIBELLE), { target: { value: choisir } });
  }
  for (let etape = 2; etape <= 6; etape++) {
    await user.click(screen.getByRole('button', { name: /^continuer$/i }));
    await screen.findByRole('progressbar', { value: { text: `Étape ${etape} sur 6` } });
  }
  await user.click(screen.getByRole('button', { name: /publier/i }));
  await waitFor(() => expect(createPropertyAction).toHaveBeenCalledTimes(1));
  return vi.mocked(createPropertyAction).mock.calls[0][0] as PropertyCreatePayload;
}

beforeEach(() => {
  vi.clearAllMocks();
  brouillon.etat.isLoading = false;
  brouillon.etat.error = null;
  brouillon.etat.flush.mockResolvedValue({ ok: true, ecrit: true });
  brouillon.etat.clear.mockResolvedValue(undefined);
  auth.user = { id: 1, first_name: 'Awa', phone: '+221770000901', phone_verified_at: '2026-10-01T00:00:00Z', terms_accepted_at: null };
  requete.useQuery.mockImplementation(() => ({ data: BAILLEURS, isLoading: false }));
  vi.mocked(createPropertyAction).mockResolvedValue({ ok: true, data: { id: 42 } } as never);
  vi.mocked(setPropertyTagsAction).mockResolvedValue({ ok: true } as never);
  vi.mocked(uploadPropertyPhotosAction).mockResolvedValue({ ok: true } as never);
  pub.publier.mockResolvedValue({ ok: true, data: { id: 42, status: 'available' } });
  pub.contacts.mockResolvedValue({ ok: true });
});

describe('avecBailleur — le corps de la création', () => {
  const corps = { title: 'x' } as unknown as PropertyCreatePayload;

  it('sans choix, la clé `owner_id` est absente', () => {
    expect(avecBailleur(corps, null)).not.toHaveProperty('owner_id');
  });

  it('le bailleur choisi part en `owner_id`', () => {
    expect(avecBailleur(corps, 71)).toEqual({ title: 'x', owner_id: 71 });
  });
});

describe('ChoixDuBailleur — la liste proposée', () => {
  it('demande les seuls bailleurs actifs de l’agence, en colonnes restreintes, toutes les pages', async () => {
    renderHook(() => ChoixDuBailleur({ agencyId: 3, valeur: null, onChange: () => {} }), {
      wrapper: ({ children }: { children: ReactNode }) => withIntl(<>{children}</>),
    });
    const { queryFn } = requete.useQuery.mock.calls[0][0] as {
      queryFn: (c: { signal: AbortSignal }) => Promise<unknown>;
    };
    const urls: URL[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(new URL(String(url), 'http://api.test'));
        return new Response(
          JSON.stringify({ data: [], meta: { current_page: 1, last_page: 1, per_page: 100, total: 0 } }),
          { status: 200 },
        );
      }),
    );
    await queryFn({ signal: new AbortController().signal });
    vi.unstubAllGlobals();

    expect(urls[0].pathname).toBe('/api/owners');
    expect(urls[0].searchParams.get('fields[owner_profiles]')).toBe('id,user_id,metadata');
    expect(urls[0].searchParams.get('include')).toBe('user');
    expect(urls[0].searchParams.get('filter[agency_id]')).toBe('3');
    expect(urls[0].searchParams.get('filter[status]')).toBe('active');
    expect(urls[0].searchParams.get('per_page')).toBe('100');
  });

  it('propose l’agence par défaut, puis les comptes des bailleurs — jamais un invité sans compte', () => {
    const onChange = vi.fn();
    render(withIntl(<ChoixDuBailleur agencyId={3} valeur={null} onChange={onChange} />));
    const choix = screen.getByLabelText(LIBELLE) as HTMLSelectElement;

    expect(Array.from(choix.options).map((o) => [o.value, o.text])).toEqual([
      ['', "L'agence (aucun bailleur)"],
      ['71', 'Bineta Sarr'],
      ['72', 'Ousmane Ba'],
    ]);
    fireEvent.change(choix, { target: { value: '72' } });
    expect(onChange).toHaveBeenLastCalledWith(72);
    fireEvent.change(choix, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});

describe('PropertyWizard — le choix du bailleur (TCK-997)', () => {
  it('le bailleur choisi part en `owner_id` à la création', async () => {
    const corps = await allerAuBoutDepuisLePremierPas('71');

    expect(corps.owner_id).toBe(71);
  });

  it('sans choix, le corps ne porte pas `owner_id` : le bien est celui de l’agence', async () => {
    const corps = await allerAuBoutDepuisLePremierPas(null);

    expect(corps).not.toHaveProperty('owner_id');
  });

  it('sans agence du choix (bailleur, indépendant, agent sans `update_any`), le choix n’est pas offert', async () => {
    const corps = await allerAuBoutDepuisLePremierPas(null, null);

    expect(screen.queryByLabelText(LIBELLE)).toBeNull();
    expect(requete.useQuery).not.toHaveBeenCalled();
    expect(corps).not.toHaveProperty('owner_id');
  });
});
