import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';

/**
 * TCK-2602 — la sortie de la publication. Un espace PARTICULIER mène à « Votre annonce est en ligne »
 * (`/app/properties/{id}/en-ligne`), sans toast ; une agence `standard` garde le toast « Booster » et
 * la fiche, comme sur `dev` (AC2) ; une proposition aussi ; un échec partiel ne quitte pas l'assistant.
 * Le harnais reprend celui de `PropertyWizard.publication.tck-633.test.tsx`.
 */

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

const arrivee = vi.hoisted(() => ({ marquer: vi.fn() }));
vi.mock('@/lib/arrivee-de-parcours', () => ({ marquerArriveeDeParcours: arrivee.marquer }));

import { createPropertyAction, setPropertyTagsAction, uploadPropertyPhotosAction } from '@/app/actions/dashboard-properties';
import { PropertyWizard } from '../PropertyWizard';

const COMPLET = {
  title: 'Studio meublé lumineux à Mermoz', type: 'studio', contract_type: 'rent', price: 250000,
  currency: 'XOF', city: 'Dakar', quarter: 'Mermoz', furnished: true, tag_ids: [],
};

async function publier(props: Parameters<typeof PropertyWizard>[0] = {}, donnees: Record<string, unknown> = COMPLET) {
  brouillon.etat.draft = { step: 5, data: donnees };
  const user = userEvent.setup();
  render(withIntl(<PropertyWizard {...props} />));
  await screen.findByRole('progressbar', { value: { text: 'Étape 6 sur 6' } });
  await user.click(screen.getByRole('button', { name: /publier|proposer/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  brouillon.etat.isLoading = false;
  brouillon.etat.error = null;
  brouillon.etat.flush.mockResolvedValue({ ok: true, ecrit: true });
  brouillon.etat.clear.mockResolvedValue(undefined);
  auth.user = { id: 1, first_name: 'Awa', last_name: 'Diop', phone: '+221771234567', phone_verified_at: '2026-10-01T00:00:00Z', phone_whatsapp: true, terms_accepted_at: null };
  vi.mocked(createPropertyAction).mockResolvedValue({ ok: true, data: { id: 42 } } as never);
  vi.mocked(setPropertyTagsAction).mockResolvedValue({ ok: true } as never);
  vi.mocked(uploadPropertyPhotosAction).mockResolvedValue({ ok: true } as never);
  pub.publier.mockResolvedValue({ ok: true, data: { id: 42, status: 'available' } });
  pub.contacts.mockResolvedValue({ ok: true });
});

describe('TCK-2602 — après la publication d’un espace particulier', () => {
  it('l’écran « en ligne », sans toast ; l’arrivée est celle d’une publication', async () => {
    await publier({ espaceParticulier: true });
    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/properties/42/en-ligne'));
    expect(routeur.push).toHaveBeenCalledTimes(1);
    expect(toast.add).not.toHaveBeenCalled();
    expect(arrivee.marquer).toHaveBeenCalledWith('publication');
    expect(brouillon.etat.clear).toHaveBeenCalled();
  });

  it('en vérification aussi : c’est l’écran qui le dit, relu sur le bien', async () => {
    pub.publier.mockResolvedValue({ ok: true, data: { id: 42, status: 'pending_review' } });
    await publier({ espaceParticulier: true });
    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/properties/42/en-ligne'));
    expect(toast.add).not.toHaveBeenCalled();
  });

  it('un échec partiel ne quitte pas l’assistant : l’avertissement d’aujourd’hui reste', async () => {
    vi.mocked(setPropertyTagsAction).mockResolvedValue({ ok: false, message: 'x' } as never);
    await publier({ espaceParticulier: true }, { ...COMPLET, tag_ids: [3] });
    expect(await screen.findByRole('alert')).toHaveTextContent(/équipements/i);
    expect(routeur.push).not.toHaveBeenCalled();
    expect(pub.publier).not.toHaveBeenCalled();
    expect(toast.add).not.toHaveBeenCalled();
  });
});

describe('TCK-2602 (AC2) — la sortie d’avant, ailleurs', () => {
  it('agence `standard` (pas d’espace particulier) : le toast « Booster », puis la fiche', async () => {
    await publier();
    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/properties/42'));
    expect(toast.add).toHaveBeenCalledTimes(1);
    const appel = toast.add.mock.calls[0]?.[0] as { title?: string; data?: { action?: React.ReactElement } };
    expect(appel.title).toBe('Votre annonce est en ligne.');
    expect(appel.data?.action).toBeTruthy();
    expect(routeur.push).not.toHaveBeenCalledWith(expect.stringContaining('/en-ligne'));
  });

  it('une proposition de bailleur, même dans un espace particulier : le toast et la fiche', async () => {
    await publier({ espaceParticulier: true, proposition: true });
    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/properties/42'));
    expect(toast.add).toHaveBeenCalledTimes(1);
    expect(pub.publier).not.toHaveBeenCalled();
  });
});
