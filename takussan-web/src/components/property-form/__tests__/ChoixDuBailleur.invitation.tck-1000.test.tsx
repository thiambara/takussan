import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';

/**
 * TCK-1000 (P15.06, Q2 ; ADR-0036, amendement du 2026-10-19, voie 2) — « Inviter un nouveau
 * bailleur » depuis le choix du bailleur de l'assistant. L'invitation partie, le formulaire dit que le
 * bien reste à l'agence jusqu'à l'acceptation, et le corps de la création porte le profil invité
 * (`pending_owner_profile_id`), jamais avec `owner_id`. Le harnais est celui de
 * `ChoixDuBailleur.tck-997.test.tsx` ; la feuille d'invitation est doublée (elle a ses propres tests).
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

const feuille = vi.hoisted(() => ({ agence: null as number | null }));
vi.mock('@/components/owners/InviteOwnerSheet', () => ({
  InviteOwnerSheet: ({
    open,
    agencyId,
    onInvited,
  }: {
    open: boolean;
    agencyId: number;
    onInvited?: (invitation: Record<string, unknown>, saisie: Record<string, unknown>) => void;
  }) => {
    feuille.agence = agencyId;
    return open ? (
      <button
        type="button"
        onClick={() =>
          onInvited?.(
            {
              id: 77, email: 'awa@x.sn', role: 'owner', status: 'sent', agency_id: agencyId,
              invitable_type: 'App\\Models\\Profiles\\OwnerProfile', invitable_id: 604, expires_at: null,
            },
            { email: 'awa@x.sn', first_name: 'Awa', last_name: 'Diop', phone: null, owner_type: 'individual', company_name: null },
          )
        }
      >
        Envoyer l’invitation (doublure)
      </button>
    ) : null;
  },
}));

import { createPropertyAction, setPropertyTagsAction, uploadPropertyPhotosAction } from '@/app/actions/dashboard-properties';
import { PropertyWizard } from '../PropertyWizard';
import { ChoixDuBailleur } from '../ChoixDuBailleur';
import { avecBailleur, type PropertyCreatePayload } from '../payload';

const COMPLET = {
  title: 'Villa à Mbour', type: 'villa', contract_type: 'sale', price: 25000000,
  currency: 'XOF', city: 'Mbour', furnished: false, tag_ids: [],
};

const BAILLEURS = {
  data: [
    { id: 501, user_id: 71, metadata: null, user: { id: 71, first_name: 'Bineta', last_name: 'Sarr', email: 'b@x.sn' } },
  ],
};

const LIBELLE = 'Au nom de qui saisissez-vous ce bien ?';
const INVITER = 'Inviter un nouveau bailleur';
const NOTE = "Invitation envoyée à Awa Diop. Le bien reste à l'agence jusqu'à ce que Awa Diop accepte ; il lui passera alors.";

async function allerAuBout(premierPas: (user: ReturnType<typeof userEvent.setup>) => Promise<void>) {
  brouillon.etat.draft = { step: 0, data: COMPLET };
  const user = userEvent.setup();
  render(withIntl(<PropertyWizard agenceDuChoixDuBailleur={3} peutInviterUnBailleur />));
  await screen.findByRole('progressbar', { value: { text: 'Étape 1 sur 6' } });
  await premierPas(user);
  for (let etape = 2; etape <= 6; etape++) {
    await user.click(screen.getByRole('button', { name: /^continuer$/i }));
    await screen.findByRole('progressbar', { value: { text: `Étape ${etape} sur 6` } });
  }
  await user.click(screen.getByRole('button', { name: /publier/i }));
  await waitFor(() => expect(createPropertyAction).toHaveBeenCalledTimes(1));
  return vi.mocked(createPropertyAction).mock.calls[0][0] as PropertyCreatePayload;
}

async function inviter(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: INVITER }));
  await user.click(screen.getByRole('button', { name: 'Envoyer l’invitation (doublure)' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  feuille.agence = null;
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

describe('avecBailleur — le bailleur invité (TCK-1000)', () => {
  const corps = { title: 'x' } as unknown as PropertyCreatePayload;

  it('le profil invité part en `pending_owner_profile_id`, sans `owner_id`', () => {
    expect(avecBailleur(corps, null, 604)).toEqual({ title: 'x', pending_owner_profile_id: 604 });
  });

  it('sans invité, le corps reste celui de TCK-997', () => {
    expect(avecBailleur(corps, null, null)).toEqual({ title: 'x' });
    expect(avecBailleur(corps, 71, null)).toEqual({ title: 'x', owner_id: 71 });
  });
});

describe('ChoixDuBailleur — « Inviter un nouveau bailleur » (TCK-1000)', () => {
  it('n’est pas offert sans le droit d’inviter', () => {
    render(withIntl(<ChoixDuBailleur agencyId={3} valeur={null} onChange={() => {}} />));

    expect(screen.queryByRole('button', { name: INVITER })).not.toBeInTheDocument();
  });

  it('ouvre la feuille d’invitation de l’agence, puis dit que le bien reste à l’agence', async () => {
    const user = userEvent.setup();
    const onInvite = vi.fn();
    const onChange = vi.fn();
    render(withIntl(
      <ChoixDuBailleur agencyId={3} valeur={null} onChange={onChange} peutInviter invite={null} onInvite={onInvite} />,
    ));

    await inviter(user);

    expect(feuille.agence).toBe(3);
    expect(onInvite).toHaveBeenCalledWith({ profileId: 604, nom: 'Awa Diop' });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});

describe('PropertyWizard — le bien saisi pour un bailleur invité (TCK-1000)', () => {
  it('l’invitation partie, le formulaire le dit et le corps porte le profil invité', async () => {
    const corps = await allerAuBout(async (user) => {
      await inviter(user);
      expect(screen.getByTestId('bailleur-invite')).toHaveTextContent(NOTE);
    });

    expect(corps.pending_owner_profile_id).toBe(604);
    expect(corps).not.toHaveProperty('owner_id');
  });

  it('choisir ensuite un bailleur inscrit retire le lien à l’invitation', async () => {
    const corps = await allerAuBout(async (user) => {
      await inviter(user);
      await user.click(screen.getByRole('combobox', { name: LIBELLE }));
      await user.click(await screen.findByRole('option', { name: 'Bineta Sarr' }));
      expect(screen.queryByTestId('bailleur-invite')).not.toBeInTheDocument();
    });

    expect(corps.owner_id).toBe(71);
    expect(corps).not.toHaveProperty('pending_owner_profile_id');
  });

  it('« Ne pas lier ce bien » retire le lien : le bien reste celui de l’agence', async () => {
    const corps = await allerAuBout(async (user) => {
      await inviter(user);
      await user.click(screen.getByRole('button', { name: 'Ne pas lier ce bien à cette invitation' }));
    });

    expect(corps).not.toHaveProperty('pending_owner_profile_id');
    expect(corps).not.toHaveProperty('owner_id');
  });
});
