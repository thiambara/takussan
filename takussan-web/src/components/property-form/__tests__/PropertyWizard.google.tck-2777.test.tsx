import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode, Suspense, useState, type ReactNode } from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';

/**
 * TCK-2777 — « Continuer avec Google » dans la feuille de compte de `/publish`.
 *
 * - AC1 : présent seulement si Google est `configured` (absent sinon, absent après un échec de
 *   chargement, absent quand l'annonce n'est gardée qu'en mémoire), au téléphone et au bureau ;
 * - AC4 : l'annonce est écrite dans ce navigateur, PUIS l'intention `/publish?reprise=compte` est
 *   mémorisée, PUIS le départ — et le retour (la vraie page de rappel, sur l'intention que le clic a
 *   réellement posée) ramène sur `/publish` ; échoué, il y ramène par la liste blanche ;
 * - AC2 : revenue avec une session, l'annonce est à l'étape 6, la feuille connectée ouverte, rien
 *   d'écrit avant le geste ; publiée, le brouillon local s'efface ;
 * - AC3 : revenue sans session, la feuille rouverte au numéro, qui le propose.
 *
 * Harnais de `PropertyWizard.sans-compte.tck-2601.test.tsx`. Aucun appel à Google : le fournisseur
 * est doublé (`@/lib/auth`).
 */
const routeur = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }));
const adresse = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({ useRouter: () => routeur, useSearchParams: () => adresse.params }));

vi.mock('@/components/map/LocationPickerMapLoader', () => ({
  LocationPickerMapLoader: () => <div data-testid="carte" />,
}));
vi.mock('@/components/providers/UserLocationProvider', () => ({
  useUserLocation: () => ({ location: null, loading: false }),
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

vi.mock('@/lib/reduire-photo', () => ({
  reduirePhoto: vi.fn(async (f: File) => f),
  reduirePhotos: vi.fn(async (fs: readonly File[]) => [...fs]),
  reduirePhotosSousPlafond: vi.fn(async (fs: readonly File[]) => [...fs]),
}));
vi.mock('@/app/actions/dashboard-properties', () => ({
  createPropertyAction: vi.fn(),
  setPropertyTagsAction: vi.fn(),
  updatePropertyVisibilityAction: vi.fn(),
  uploadPropertyPhotosAction: vi.fn(),
}));
const toast = vi.hoisted(() => ({ add: vi.fn() }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => toast }));
const pub = vi.hoisted(() => ({ publier: vi.fn(), contacts: vi.fn() }));
vi.mock('@/app/actions/publish-property', () => ({ publishPropertyAction: (...a: unknown[]) => pub.publier(...a) }));
vi.mock('@/app/actions/property-contacts', () => ({ replacePropertyContactsAction: (...a: unknown[]) => pub.contacts(...a) }));
vi.mock('@/app/actions/contact-preferences', () => ({ updateContactPreferencesAction: vi.fn() }));
vi.mock('@/lib/connexion-telephone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connexion-telephone')>()),
  demanderCodeTelephone: vi.fn(),
  verifierCodeTelephone: vi.fn(),
}));

/** Le fournisseur, doublé : la liste, le départ, le rappel. */
const google = vi.hoisted(() => ({ fournisseurs: vi.fn(), depart: vi.fn(), rappel: vi.fn() }));
vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth')>()),
  oauthProviders: (...a: unknown[]) => google.fournisseurs(...a),
  oauthRedirect: (...a: unknown[]) => google.depart(...a),
  oauthCallback: (...a: unknown[]) => google.rappel(...a),
}));

const session = vi.hoisted(() => ({ initiale: null as Record<string, unknown> | null, ouvrir: vi.fn() }));
vi.mock('@/context/AuthContext', async () => {
  const React = await import('react');
  const Ctx = React.createContext<{ user: Record<string, unknown> | null; ouvrir: (u: Record<string, unknown>) => void }>({ user: null, ouvrir: () => {} });
  return {
    __Ctx: Ctx,
    useAuth: () => {
      const c = React.useContext(Ctx);
      return {
        user: c.user,
        setUser: (u: Record<string, unknown>) => c.ouvrir(u),
        refreshUser: async () => undefined,
        openSession: async (_jeton: string, u: Record<string, unknown>) => {
          session.ouvrir(u);
          c.ouvrir(u);
        },
      };
    },
  };
});

import * as ModuleAuth from '@/context/AuthContext';
import { createPropertyAction, setPropertyTagsAction, uploadPropertyPhotosAction } from '@/app/actions/dashboard-properties';
import { CLE_INTENTION_OAUTH } from '@/components/auth/intention-oauth';
import { REQUETE_DU_PANNEAU } from '@/components/publication/CadreDeLaFeuille';
import type { RepriseDePublication } from '@/lib/publication/reprise-oauth';
import { AssistantDePublication, type ModeAnonyme } from '../PropertyWizard';

const { default: OAuthCallbackPage } = await import('@/app/(auth)/auth/oauth/[provider]/callback/page');

type Contexte = { user: Record<string, unknown> | null; ouvrir: (u: Record<string, unknown>) => void };
const Ctx = (ModuleAuth as unknown as { __Ctx: React.Context<Contexte> }).__Ctx;
function Session({ children }: { readonly children: ReactNode }) {
  const [user, setUser] = useState<Record<string, unknown> | null>(session.initiale);
  return <Ctx.Provider value={{ user, ouvrir: setUser }}>{children}</Ctx.Provider>;
}

const COMPLET = {
  title: 'Villa à Mbour', type: 'villa', contract_type: 'sale', price: 25000000,
  currency: 'XOF', city: 'Mbour', furnished: false, tag_ids: [],
};
/** Un compte né de Google : un nom, pas de numéro. */
const COMPTE_GOOGLE = { id: 300, first_name: 'Awa', last_name: 'Diop', phone: null, phone_verified_at: null, phone_whatsapp: null };
/** Un compte qui a déjà tout ce que la publication exige. */
const COMPTE_COMPLET = { id: 301, first_name: 'Awa', last_name: 'Diop', phone: '+221770000999', phone_verified_at: '2026-11-01T00:00:00Z', phone_whatsapp: true };

const page = vi.hoisted(() => ({ preparerLEspace: vi.fn(), surRepriseLue: vi.fn() }));
const media = vi.hoisted(() => ({ large: false }));
const assign = vi.fn();
const locationOriginale = window.location;
const matchMediaOriginal = window.matchMedia;

function monter({ etape = 5, durable = true, reprise = null as RepriseDePublication | null } = {}) {
  brouillon.etat.draft = { step: etape, data: COMPLET };
  const anonyme: ModeAnonyme = {
    photosInitiales: [],
    surPhotos: () => {},
    surPublier: vi.fn(),
    depart: { titre: 'Publiez votre bien', sousTitre: '', dessous: null },
    finition: null,
    pourPublierEnPlus: { libelle: 'Votre numéro', note: 'à la fin' },
    surEtape: () => {},
    entreeParTelephone: true,
    preparerLEspace: page.preparerLEspace,
    google: { durable, reprise, surRepriseLue: page.surRepriseLue },
    noteDuPied: (id) => `note de l’étape ${id}`,
  };
  const user = userEvent.setup();
  render(withIntl(<Session><AssistantDePublication brouillon={brouillon.etat as never} anonyme={anonyme} fraisDAgence={false} /></Session>));
  return user;
}

/** « Publier », puis la feuille (au téléphone) ou le panneau (au bureau) de compte. */
async function ouvrirLaFeuille(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('progressbar', { value: { text: 'Étape 6 sur 6' } });
  await user.click(screen.getByRole('button', { name: 'Publier l’annonce' }));
  return media.large
    ? screen.getByRole('region', { name: 'Dernière étape : votre numéro' })
    : screen.getByRole('dialog', { name: 'Dernière étape : votre numéro' });
}

/**
 * La vraie page de rappel, sur ce que l'onglet porte — sous le Strict Mode du développement, où l'effet
 * repasse : la DERNIÈRE navigation est celle que la personne voit.
 */
async function revenirDeGoogle(params: Record<string, string>): Promise<string> {
  adresse.params = new URLSearchParams(params);
  routeur.replace.mockClear();
  await act(async () => {
    render(withIntl(<StrictMode><Suspense><OAuthCallbackPage params={Promise.resolve({ provider: 'google' })} /></Suspense></StrictMode>));
  });
  await waitFor(() => expect(routeur.replace).toHaveBeenCalled());
  await act(async () => {});
  expect(routeur.replace).toHaveBeenCalledTimes(1);
  return routeur.replace.mock.calls.at(-1)![0] as string;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  session.initiale = null;
  media.large = false;
  adresse.params = new URLSearchParams();
  brouillon.etat.isLoading = false;
  brouillon.etat.error = null;
  brouillon.etat.flush.mockResolvedValue({ ok: true, ecrit: true });
  brouillon.etat.clear.mockResolvedValue(undefined);
  page.preparerLEspace.mockResolvedValue('pret');
  google.fournisseurs.mockResolvedValue([
    { provider: 'google', configured: true },
    { provider: 'facebook', configured: false },
  ]);
  google.depart.mockResolvedValue({ redirect_url: 'https://accounts.google.test/o/oauth2' });
  google.rappel.mockResolvedValue({ token: 't', user: COMPTE_GOOGLE, expires_at: '2026-11-14T12:00:00Z' });
  vi.mocked(createPropertyAction).mockResolvedValue({ ok: true, data: { id: 42 } } as never);
  vi.mocked(setPropertyTagsAction).mockResolvedValue({ ok: true } as never);
  vi.mocked(uploadPropertyPhotosAction).mockResolvedValue({ ok: true } as never);
  pub.publier.mockResolvedValue({ ok: true, data: { id: 42, status: 'available' } });
  pub.contacts.mockResolvedValue({ ok: true });
  Object.defineProperty(window, 'location', { configurable: true, value: { ...locationOriginale, assign } });
  window.matchMedia = ((query: string) => ({
    get matches() {
      if (query === '(width >= 48rem)') return media.large;
      return query === REQUETE_DU_PANNEAU && media.large;
    },
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  Object.defineProperty(window, 'location', { configurable: true, value: locationOriginale });
  window.matchMedia = matchMediaOriginal;
});

describe('AC1 — « Continuer avec Google » selon le fournisseur', () => {
  it('au téléphone : dans la feuille, sous « Recevoir un code »', async () => {
    const user = monter();
    const feuille = await ouvrirLaFeuille(user);
    const bouton = await within(feuille).findByRole('button', { name: 'Continuer avec Google' });
    const recevoir = within(feuille).getByRole('button', { name: 'Recevoir un code' });
    expect(recevoir.compareDocumentPosition(bouton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bouton).toHaveClass('h-11', 'self-center', 'max-md:mt-1');
  });

  it('au bureau : dans le panneau de compte, dans la rangée du geste', async () => {
    media.large = true;
    const user = monter();
    const panneau = await ouvrirLaFeuille(user);
    const bouton = await within(panneau).findByRole('button', { name: 'Continuer avec Google' });
    expect(bouton.closest('[data-panneau-action]')).not.toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each([
    ['non configuré', () => google.fournisseurs.mockResolvedValue([{ provider: 'google', configured: false }])],
    ['liste qui ne se charge pas', () => google.fournisseurs.mockRejectedValue(new Error('réseau'))],
  ])('%s : absent, sans un mot', async (_cas, preparer) => {
    preparer();
    const user = monter();
    const feuille = await ouvrirLaFeuille(user);
    await waitFor(() => expect(google.fournisseurs).toHaveBeenCalled());
    await act(async () => {});
    expect(within(feuille).queryByRole('button', { name: /google/i })).not.toBeInTheDocument();
    expect(within(feuille).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(feuille).getByRole('button', { name: 'Recevoir un code' })).toBeInTheDocument();
  });

  it('annonce gardée en mémoire seulement : absent (elle ne survivrait pas au départ)', async () => {
    const user = monter({ durable: false });
    const feuille = await ouvrirLaFeuille(user);
    await act(async () => {});
    expect(within(feuille).queryByRole('button', { name: /google/i })).not.toBeInTheDocument();
  });
});

describe('AC4 — le départ, puis le retour', () => {
  it('écrit l’annonce ici, mémorise /publish?reprise=compte, part ; le rappel ramène sur /publish', async () => {
    const user = monter();
    const feuille = await ouvrirLaFeuille(user);
    await user.click(await within(feuille).findByRole('button', { name: 'Continuer avec Google' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://accounts.google.test/o/oauth2'));

    // L'annonce écrite dans ce navigateur, à l'étape 6, AVANT de demander le départ — et rien au serveur.
    expect(brouillon.etat.save).toHaveBeenLastCalledWith(5, expect.objectContaining({ title: 'Villa à Mbour' }));
    expect(brouillon.etat.flush.mock.invocationCallOrder.at(-1)!).toBeLessThan(google.depart.mock.invocationCallOrder[0]!);
    expect(google.depart).toHaveBeenCalledWith('google');
    expect(page.preparerLEspace).not.toHaveBeenCalled();
    expect(createPropertyAction).not.toHaveBeenCalled();
    // La feuille attend la navigation : rien ne se renvoie sous elle.
    expect(within(feuille).getByRole('button', { name: 'Continuer avec Google' })).toBeDisabled();

    // Le retour : la page de rappel lit l'intention QUE LE CLIC A POSÉE.
    cleanup();
    expect(await revenirDeGoogle({ code: 'c', state: 's' })).toBe(
      `/onboarding/intention?redirect=${encodeURIComponent('/publish?reprise=compte')}`,
    );
    expect(session.ouvrir).toHaveBeenCalledWith(COMPTE_GOOGLE);
    expect(window.sessionStorage.getItem(CLE_INTENTION_OAUTH)).toBeNull();
  });

  it('aller-retour annulé (error=access_denied) : /publish?reprise=echec, pas la connexion', async () => {
    const user = monter();
    const feuille = await ouvrirLaFeuille(user);
    await user.click(await within(feuille).findByRole('button', { name: 'Continuer avec Google' }));
    await waitFor(() => expect(assign).toHaveBeenCalled());
    cleanup();
    expect(await revenirDeGoogle({ error: 'access_denied', state: 's' })).toBe('/publish?reprise=echec');
    expect(google.rappel).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(CLE_INTENTION_OAUTH)).toBeNull();
  });

  it('refusé par l’API au rappel : /publish?reprise=echec', async () => {
    google.rappel.mockRejectedValue(new Error('refus'));
    window.sessionStorage.setItem(CLE_INTENTION_OAUTH, '/publish?reprise=compte');
    expect(await revenirDeGoogle({ code: 'c', state: 's' })).toBe('/publish?reprise=echec');
  });

  it('un échec venu d’ailleurs que /publish garde la connexion, comme avant', async () => {
    window.sessionStorage.setItem(CLE_INTENTION_OAUTH, '/properties/x?action=reserver');
    expect(await revenirDeGoogle({ error: 'access_denied' })).toBe('/auth/login?error=oauth_invalid');
  });

  it('revenu par « Précédent » (page du cache d’historique) : la feuille n’est plus figée', async () => {
    const user = monter();
    const feuille = await ouvrirLaFeuille(user);
    await user.click(await within(feuille).findByRole('button', { name: 'Continuer avec Google' }));
    await waitFor(() => expect(assign).toHaveBeenCalled());
    expect(within(feuille).getByRole('button', { name: 'Continuer avec Google' })).toBeDisabled();
    await act(async () => {
      window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    });
    expect(within(feuille).getByRole('button', { name: 'Continuer avec Google' })).toBeEnabled();
    expect(within(feuille).getByLabelText('Votre numéro')).toBeEnabled();
  });

  it('le départ refusé par l’API : dit dans la feuille, rien de mémorisé, l’annonce reste', async () => {
    google.depart.mockRejectedValue(new Error('422'));
    const user = monter();
    const feuille = await ouvrirLaFeuille(user);
    await user.click(await within(feuille).findByRole('button', { name: 'Continuer avec Google' }));
    expect(await within(feuille).findByRole('alert')).toHaveTextContent(/Impossible d.initier la connexion/);
    expect(assign).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(CLE_INTENTION_OAUTH)).toBeNull();
    expect(within(feuille).getByRole('button', { name: 'Continuer avec Google' })).toBeEnabled();
  });
});

describe('AC2 — revenue avec une session : étape 6, la feuille connectée, rien avant le geste', () => {
  it('compte Google sans numéro : la feuille demande le numéro, rien n’est écrit', async () => {
    session.initiale = COMPTE_GOOGLE;
    monter({ etape: 2, reprise: 'compte' });
    const feuille = await screen.findByRole('dialog');
    // Le brouillon disait l'étape 3 : la reprise mène à l'étape 6 (la feuille ouverte rend le reste inerte).
    expect(document.querySelector('[data-wizard-footer]')).toHaveTextContent('note de l’étape finition');
    expect(within(feuille).getByLabelText('Votre numéro')).toBeInTheDocument();
    // Le nom vient de Google : il ne se redemande pas.
    expect(within(feuille).queryByLabelText('Prénom')).not.toBeInTheDocument();
    // La feuille CONNECTÉE : ni code de connexion ni Google.
    expect(within(feuille).queryByRole('button', { name: /google/i })).not.toBeInTheDocument();
    expect(page.surRepriseLue).toHaveBeenCalledTimes(1);
    expect(page.preparerLEspace).not.toHaveBeenCalled();
    expect(createPropertyAction).not.toHaveBeenCalled();
    expect(pub.publier).not.toHaveBeenCalled();
  });

  it('au geste « Publier mon annonce » seulement, l’annonce part ; publiée, le brouillon local s’efface', async () => {
    session.initiale = COMPTE_COMPLET;
    const user = userEvent.setup();
    monter({ reprise: 'compte' });
    const feuille = await screen.findByRole('dialog');
    expect(createPropertyAction).not.toHaveBeenCalled();
    expect(brouillon.etat.clear).not.toHaveBeenCalled();

    await user.click(within(feuille).getByRole('button', { name: 'Publier mon annonce' }));
    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/properties/42/en-ligne'));
    expect(page.preparerLEspace).toHaveBeenCalledTimes(1);
    expect(pub.publier).toHaveBeenCalled();
    expect(brouillon.etat.clear).toHaveBeenCalled();
  });
});

describe('AC3 — revenue après un échec : /publish, l’annonce intacte, la feuille au numéro', () => {
  it('la feuille sans compte rouverte au numéro, et le message propose le numéro', async () => {
    monter({ etape: 3, reprise: 'echec' });
    const feuille = await screen.findByRole('dialog', { name: 'Dernière étape : votre numéro' });
    expect(document.querySelector('[data-wizard-footer]')).toHaveTextContent('note de l’étape finition');
    expect(within(feuille).getByRole('alert')).toHaveTextContent('La connexion avec Google n’a pas abouti');
    expect(within(feuille).getByLabelText('Votre numéro')).toBeInTheDocument();
    expect(within(feuille).getByRole('button', { name: 'Recevoir un code' })).toBeInTheDocument();
    // L'annonce est celle du brouillon local, intacte : rien n'a été réécrit ni effacé.
    expect(brouillon.etat.clear).not.toHaveBeenCalled();
    expect(within(feuille).getByText('Villa à Mbour')).toBeInTheDocument();
    expect(page.surRepriseLue).toHaveBeenCalledTimes(1);
  });

  it('sans reprise dans l’URL, rien ne s’ouvre seul', async () => {
    monter();
    await screen.findByRole('progressbar', { value: { text: 'Étape 6 sur 6' } });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(page.surRepriseLue).not.toHaveBeenCalled();
  });
});

