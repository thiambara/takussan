import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';

/**
 * TCK-2601 (AC3) — l'assistant connecté qui reprend l'annonce commencée sans compte
 * (`/app/properties/new?brouillon=publication`) :
 *
 * - il ne lit ET n'écrit que la clé `property-create-wizard:publication` : un brouillon antérieur du
 *   compte (`property-create-wizard`, « Villa à Ngor ») n'est jamais monté, donc ni écrasé ni effacé
 *   (condition 1) ;
 * - les photos reviennent du navigateur où elles ont été ajoutées ; absentes, l'écran le dit ;
 * - publié : la clé serveur ET le brouillon local s'effacent, après la publication (condition 3).
 *
 * Harnais de `PropertyWizard.feuille.tck-2601.test.tsx`.
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
const cles = vi.hoisted(() => ({ montees: [] as string[] }));
vi.mock('@/hooks/useWizardDraft', () => ({
  useWizardDraft: (cle: string) => {
    cles.montees.push(cle);
    return brouillon.etat;
  },
}));

const local = vi.hoisted(() => ({
  ouvrir: vi.fn(),
  effacer: vi.fn(async () => undefined),
}));
vi.mock('@/lib/publication/brouillon-local', () => ({
  ouvrirBrouillonLocal: () => ({ ouvrir: local.ouvrir, effacer: local.effacer }),
}));

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


const compte = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  setUser: vi.fn(),
  refreshUser: vi.fn(async () => undefined),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: compte.user, setUser: compte.setUser, refreshUser: compte.refreshUser }),
}));

const securite = vi.hoisted(() => ({ envoyer: vi.fn(), verifier: vi.fn() }));
vi.mock('@/app/actions/security', () => ({
  phoneSendOtpAction: (...a: unknown[]) => securite.envoyer(...a),
  phoneVerifyOtpAction: (...a: unknown[]) => securite.verifier(...a),
}));
const profil = vi.hoisted(() => ({ ecrire: vi.fn() }));
vi.mock('@/app/actions/contact-preferences', () => ({
  updateContactPreferencesAction: (...a: unknown[]) => profil.ecrire(...a),
}));

import { createPropertyAction, setPropertyTagsAction, uploadPropertyPhotosAction } from '@/app/actions/dashboard-properties';
import { PropertyWizard } from '../PropertyWizard';

const COMPLET = {
  title: 'Villa à Mbour', type: 'villa', contract_type: 'sale', price: 25000000,
  currency: 'XOF', city: 'Mbour', furnished: false, tag_ids: [],
};
const AWA = {
  id: 1, first_name: 'Awa', last_name: 'Diop', phone: '+221770000901',
  phone_verified_at: '2026-10-01T00:00:00Z', phone_whatsapp: true, terms_accepted_at: '2026-10-01T00:00:00Z',
};

async function allerAuBout(depuisPublication: boolean, donnees: Record<string, unknown> = COMPLET, proposition = false) {
  brouillon.etat.draft = { step: 5, data: donnees };
  const user = userEvent.setup();
  render(withIntl(<PropertyWizard depuisPublication={depuisPublication} proposition={proposition} />));
  await screen.findByRole('progressbar', { value: { text: 'Étape 6 sur 6' } });
  return user;
}

const ordre = (f: { mock: { invocationCallOrder: number[] } }) => f.mock.invocationCallOrder[0];

const PHOTO = new File(['p'], 'salon.jpg', { type: 'image/jpeg' });

beforeEach(() => {
  vi.clearAllMocks();
  cles.montees.length = 0;
  local.ouvrir.mockResolvedValue({ valeurs: { etape: 5, valeurs: {}, majLe: 0 }, photos: [{ id: 'a', fichier: PHOTO }], purge: false });
  brouillon.etat.isLoading = false;
  brouillon.etat.error = null;
  brouillon.etat.flush.mockResolvedValue({ ok: true, ecrit: true });
  brouillon.etat.clear.mockResolvedValue(undefined);
  compte.user = { ...AWA };
  vi.mocked(createPropertyAction).mockResolvedValue({ ok: true, data: { id: 42 } } as never);
  vi.mocked(setPropertyTagsAction).mockResolvedValue({ ok: true } as never);
  vi.mocked(uploadPropertyPhotosAction).mockResolvedValue({ ok: true } as never);
  pub.publier.mockResolvedValue({ ok: true, data: { id: 42, status: 'available' } });
  pub.contacts.mockResolvedValue({ ok: true });
  securite.envoyer.mockResolvedValue({ ok: true, data: { codeApercu: null } });
  securite.verifier.mockResolvedValue({ ok: true, data: null });
  profil.ecrire.mockImplementation(async (p: Record<string, unknown>) => ({ ok: true, user: { ...compte.user, ...p } }));
});

describe('PropertyWizard — /app/properties/new hors du cadre d’entrée (TCK-2600)', () => {
  it('connecté, même venu de /publish : ni cadre ni grille d’entrée, l’aperçu dans sa colonne latérale hors de la zone défilante', async () => {
    await allerAuBout(true);
    expect(document.querySelector('[data-wizard-panneau]')).not.toHaveAttribute('data-cadre-d-entree');
    expect(document.querySelector('[class*="grid-cols-[minmax(0,35rem)_25rem]"]')).toBeNull();
    expect(document.querySelector('[data-wizard-scroll]')!.contains(screen.getByRole('complementary', { name: 'Aperçu de l’annonce' }))).toBe(false);
  });
});

describe('PropertyWizard — l’annonce reprise depuis /publish (TCK-2601, AC3)', () => {
  it('sans le paramètre : la clé de toujours, et le brouillon local n’est pas lu', async () => {
    await allerAuBout(false);
    expect(new Set(cles.montees)).toEqual(new Set(['property-create-wizard']));
    expect(local.ouvrir).not.toHaveBeenCalled();
  });

  it('depuis /publish : la seule clé de la publication — le brouillon « Villa à Ngor » n’est jamais monté', async () => {
    const user = await allerAuBout(true);
    expect(new Set(cles.montees)).toEqual(new Set(['property-create-wizard:publication']));
    await user.click(screen.getByRole('button', { name: 'Publier l’annonce' }));
    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/properties/42'));
    expect(new Set(cles.montees)).toEqual(new Set(['property-create-wizard:publication']));
  });

  it('les photos gardées dans ce navigateur partent avec le bien ; publié, les DEUX brouillons s’effacent, après', async () => {
    const user = await allerAuBout(true);
    await user.click(screen.getByRole('button', { name: 'Publier l’annonce' }));
    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/properties/42'));

    const envoyees = vi.mocked(uploadPropertyPhotosAction).mock.calls.flatMap((c) => [...(c[1] as FormData).values()]);
    expect(envoyees.some((f) => f instanceof File && f.name === 'salon.jpg')).toBe(true);
    expect(brouillon.etat.clear).toHaveBeenCalled();
    expect(local.effacer).toHaveBeenCalledTimes(1);
    expect(ordre(local.effacer)).toBeGreaterThan(ordre(pub.publier)!);
  });

  it('le brouillon local absent (un autre appareil) : l’écran dit où sont restées les photos', async () => {
    local.ouvrir.mockResolvedValue({ valeurs: null, photos: [], purge: false });
    await allerAuBout(true);
    expect(await screen.findByTestId('photos-ailleurs')).toHaveTextContent('Vos photos restent sur l’appareil où vous les avez ajoutées');
  });

  // Toutes les sorties réussies passent par `terminer` : la proposition du bailleur (versée parce
  // qu'elle ne publie pas) et l'annonce mise en vérification effacent aussi le brouillon local —
  // sinon `/publish` rouvrirait l'assistant sans compte sur une annonce déjà envoyée.
  it.each([
    ['la proposition du bailleur', true, 'Proposer à mon agence'],
    ['l’annonce mise en vérification', false, 'Publier l’annonce'],
  ])('%s : les deux brouillons s’effacent aussi', async (_cas, proposition, bouton) => {
    pub.publier.mockResolvedValue({ ok: true, data: { id: 42, status: 'pending_review' } });
    const user = await allerAuBout(true, COMPLET, proposition);
    await user.click(screen.getByRole('button', { name: bouton }));
    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/properties/42'));
    expect(pub.publier).toHaveBeenCalledTimes(proposition ? 0 : 1);
    expect(brouillon.etat.clear).toHaveBeenCalled();
    expect(local.effacer).toHaveBeenCalledTimes(1);
  });

  it('aucune annonce versée à reprendre (déjà publiée, ou purgée) : rien à dire des photos', async () => {
    local.ouvrir.mockResolvedValue({ valeurs: null, photos: [], purge: false });
    brouillon.etat.draft = null;
    render(withIntl(<PropertyWizard depuisPublication />));
    await screen.findByRole('progressbar');
    await waitFor(() => expect(local.ouvrir).toHaveBeenCalled());
    expect(screen.queryByTestId('photos-ailleurs')).not.toBeInTheDocument();
  });

  it('une publication refusée garde le brouillon local', async () => {
    pub.publier.mockResolvedValue({ ok: false, message: 'Refus', missing: null, contactIsSelf: true });
    const user = await allerAuBout(true);
    await user.click(screen.getByRole('button', { name: 'Publier l’annonce' }));
    await waitFor(() => expect(pub.publier).toHaveBeenCalled());
    expect(local.effacer).not.toHaveBeenCalled();
  });
});
