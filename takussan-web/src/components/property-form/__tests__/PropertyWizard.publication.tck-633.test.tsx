import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';

/**
 * TCK-633 (lot C, AC11 / AC12) — la publication depuis l'assistant : `POST …/publish` avec
 * l'acceptation des CGU, le bloc « Vos coordonnées » sur un refus, et les contacts sur place
 * écrits après la création, avant la publication. Le harnais reprend celui de
 * `PropertyWizard.test.tsx`.
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

import { createPropertyAction, setPropertyTagsAction, uploadPropertyPhotosAction } from '@/app/actions/dashboard-properties';
import { PropertyWizard } from '../PropertyWizard';
import { LienBoosterApresPublication } from '@/components/boost/BoosterApresPublication';

const COMPLET = {
  title: 'Villa à Mbour', type: 'villa', contract_type: 'sale', price: 25000000,
  currency: 'XOF', city: 'Mbour', furnished: false, tag_ids: [],
};

async function allerAuBout() {
  brouillon.etat.draft = { step: 5, data: COMPLET };
  const user = userEvent.setup();
  render(withIntl(<PropertyWizard />));
  await screen.findByRole('progressbar', { value: { text: 'Étape 6 sur 6' } });
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  brouillon.etat.isLoading = false;
  brouillon.etat.error = null;
  brouillon.etat.flush.mockResolvedValue({ ok: true, ecrit: true });
  brouillon.etat.clear.mockResolvedValue(undefined);
  auth.user = { id: 1, first_name: 'Awa', phone: '+221770000901', phone_verified_at: '2026-10-01T00:00:00Z', terms_accepted_at: null };
  vi.mocked(createPropertyAction).mockResolvedValue({ ok: true, data: { id: 42 } } as never);
  vi.mocked(setPropertyTagsAction).mockResolvedValue({ ok: true } as never);
  vi.mocked(uploadPropertyPhotosAction).mockResolvedValue({ ok: true } as never);
  pub.publier.mockResolvedValue({ ok: true, data: { id: 42, status: 'available' } });
  pub.contacts.mockResolvedValue({ ok: true });
});

describe('PropertyWizard — publier avec un contact (TCK-633)', () => {
  it('publie en acceptant les CGU que la phrase annonce', async () => {
    const user = await allerAuBout();
    expect(screen.getByTestId('phrase-cgu')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /publier/i }));

    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/properties/42'));
    expect(pub.publier).toHaveBeenCalledWith(42, { acceptTerms: true });
  });

  it('422 coordonnées incomplètes : le bloc s’ouvre, le brouillon reste, rien ne part', async () => {
    pub.publier.mockResolvedValueOnce({ ok: false, status: 422, message: 'x', missing: ['verified_phone'], contactIsSelf: true });
    auth.user = { ...auth.user, phone_verified_at: null };
    const user = await allerAuBout();

    await user.click(screen.getByRole('button', { name: /publier/i }));

    expect(await screen.findByText(/Il manque vos coordonnées pour publier/)).toBeInTheDocument();
    expect(screen.getByLabelText('Votre numéro')).toBeInTheDocument();
    expect(routeur.push).not.toHaveBeenCalled();
    expect(createPropertyAction).toHaveBeenCalledTimes(1);
  });

  it('les contacts sur place partent après la création, avant la publication', async () => {
    const user = await allerAuBout();
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un contact' }));
    fireEvent.change(screen.getByLabelText('Qui ?'), { target: { value: 'Gardien' } });
    fireEvent.change(screen.getByLabelText('Numéro'), { target: { value: '770000803' } });

    await user.click(screen.getByRole('button', { name: /publier/i }));

    await waitFor(() => expect(pub.publier).toHaveBeenCalled());
    expect(pub.contacts).toHaveBeenCalledWith(42, [{ label: 'Gardien', phone: '+221770000803', has_whatsapp: false }]);
    expect(pub.contacts.mock.invocationCallOrder[0]).toBeLessThan(pub.publier.mock.invocationCallOrder[0]);
  });

  /** TCK-633 (décision 5 du porteur) — le message de confirmation propose « Booster ». */
  describe('le message de confirmation', () => {
    function actionDuMessage() {
      const appel = toast.add.mock.calls.at(-1)?.[0] as { data?: { action?: React.ReactElement } } | undefined;
      return appel?.data?.action;
    }

    it('une annonce en ligne : le message porte « Booster », vers la fiche du bien', async () => {
      const user = await allerAuBout();
      await user.click(screen.getByRole('button', { name: /publier/i }));
      await waitFor(() => expect(toast.add).toHaveBeenCalled());

      const action = actionDuMessage();
      expect(action?.type).toBe(LienBoosterApresPublication);
      expect(action?.props).toEqual({ propertyId: 42, libelle: 'Booster cette annonce' });
    });

    it('une annonce en vérification : rien à booster, elle n’est pas encore publique', async () => {
      pub.publier.mockResolvedValueOnce({ ok: true, data: { id: 42, status: 'pending_review' } });
      const user = await allerAuBout();
      await user.click(screen.getByRole('button', { name: /publier/i }));
      await waitFor(() => expect(toast.add).toHaveBeenCalled());

      expect(actionDuMessage()).toBeUndefined();
    });
  });
});

/**
 * TCK-643 — la dernière étape affiche les numéros déjà vérifiés ; AC4 : la publication reste
 * possible EXACTEMENT dans les mêmes cas qu'avant. L'assistant ne filtre rien lui-même : il tente
 * toujours `POST …/publish`, et c'est la réponse de l'API qui débloque (en ligne) ou bloque (bloc
 * des coordonnées). Un affichage ne doit ni empêcher la tentative, ni la remplacer.
 */
describe('PropertyWizard — numéros vérifiés à la dernière étape (TCK-643)', () => {
  const SECOND = { secondary_phone: '+221780000902', secondary_phone_verified_at: '2026-10-02T00:00:00Z', secondary_phone_whatsapp: true };

  it('les deux numéros vérifiés sont affichés à l’étape Finition', async () => {
    auth.user = { ...auth.user, phone_whatsapp: true, ...SECOND };
    await allerAuBout();

    const liste = screen.getByRole('list', { name: 'Vos numéros vérifiés' });
    expect(liste).toHaveTextContent('+221 77 000 09 01');
    expect(liste).toHaveTextContent('+221 78 000 09 02');
  });

  it.each([
    ['principal vérifié', {}, true],
    ['principal + second vérifiés', SECOND, true],
    ['second vérifié seul', { phone_verified_at: null, ...SECOND }, false],
    ['rien de vérifié', { phone_verified_at: null }, false],
  ] as const)('AC4 — %s : la publication est tentée, et l’API seule en décide', async (_cas, compte, accepte) => {
    auth.user = { ...auth.user, ...compte };
    if (!accepte) {
      pub.publier.mockResolvedValueOnce({ ok: false, status: 422, message: 'x', missing: ['verified_phone'], contactIsSelf: true });
    }
    const user = await allerAuBout();

    await user.click(screen.getByRole('button', { name: /publier/i }));

    await waitFor(() => expect(pub.publier).toHaveBeenCalledTimes(1));
    expect(pub.publier).toHaveBeenCalledWith(42, { acceptTerms: true });
    if (accepte) {
      await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/properties/42'));
    } else {
      expect(await screen.findByText(/Il manque vos coordonnées pour publier/)).toBeInTheDocument();
      expect(screen.getByLabelText('Votre numéro')).toBeInTheDocument();
      expect(routeur.push).not.toHaveBeenCalled();
    }
  });
});
