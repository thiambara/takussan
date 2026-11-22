/**
 * TCK-2601 (AC2) — entre le code et l'écran de sortie, AUCUN dialogue de bienvenue n'est monté et
 * AUCUNE page « Création de votre espace… » n'est rendue.
 *
 * Le chemin est rendu en vrai, de la page à la feuille : `PublishPage` (sa décision réelle,
 * `usePublishIntent`, lue sur le vrai `useMyProfiles`), `PublierSansCompte`, l'assistant, la feuille
 * sans compte. Seules les frontières du réseau sont doublées : le code SMS (`@/lib/connexion-telephone`),
 * les actions serveur, `fetch` (`/api/me/profiles`), le routeur, et la session (`openSession` ouvre
 * VRAIMENT la session : la décision de la page passe d'« anonyme » à « chargement » puis à « aucun
 * espace » sous l'assistant monté — c'est là que la page rendait « Création de votre espace… » et
 * lançait sa propre création).
 *
 * Un `MutationObserver` relève tout ce qui se monte, du premier clic à la navigation vers l'écran de
 * sortie : un écran affiché 300 ms est relevé, un instantané final ne le serait pas.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

const routeur = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => routeur,
  usePathname: () => '/publish',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/components/map/LocationPickerMapLoader', () => ({
  LocationPickerMapLoader: () => <div data-testid="carte" />,
}));
vi.mock('@/components/providers/UserLocationProvider', () => ({
  useUserLocation: () => ({ location: null, loading: false }),
}));
vi.mock('@/lib/reduire-photo', () => ({
  reduirePhoto: vi.fn(async (f: File) => f),
  reduirePhotos: vi.fn(async (fs: readonly File[]) => [...fs]),
  reduirePhotosSousPlafond: vi.fn(async (fs: readonly File[]) => [...fs]),
}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));

/** Le brouillon de ce navigateur : le vrai, sur un moteur en mémoire partagé (jsdom n'a pas d'IndexedDB). */
const stockage = vi.hoisted(() => ({ moteur: null as unknown }));
vi.mock('@/lib/publication/brouillon-local', async (importOriginal) => {
  const vrai = await importOriginal<typeof import('@/lib/publication/brouillon-local')>();
  return {
    ...vrai,
    ouvrirBrouillonLocal: (options: Parameters<typeof vrai.ouvrirBrouillonLocal>[0] = {}) =>
      vrai.ouvrirBrouillonLocal({ moteur: stockage.moteur as ReturnType<typeof vrai.moteurEnMemoire>, ...options }),
  };
});

// ——— Les frontières du réseau ———
const tel = vi.hoisted(() => ({ demander: vi.fn(), verifier: vi.fn() }));
vi.mock('@/lib/connexion-telephone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connexion-telephone')>()),
  connexionParTelephoneActive: async () => true,
  demanderCodeTelephone: (...a: unknown[]) => tel.demander(...a),
  verifierCodeTelephone: (...a: unknown[]) => tel.verifier(...a),
}));
const serveur = vi.hoisted(() => ({
  profil: vi.fn(),
  autoOnboard: vi.fn(),
  creer: vi.fn(),
  publier: vi.fn(),
  espaceCree: false,
}));
vi.mock('@/app/actions/contact-preferences', () => ({
  updateContactPreferencesAction: (...a: unknown[]) => serveur.profil(...a),
}));
vi.mock('@/app/actions/auto-onboard', () => ({ autoOnboardAction: (...a: unknown[]) => serveur.autoOnboard(...a) }));
vi.mock('@/app/actions/dashboard-properties', () => ({
  createPropertyAction: (...a: unknown[]) => serveur.creer(...a),
  setPropertyTagsAction: vi.fn(async () => ({ ok: true })),
  updatePropertyVisibilityAction: vi.fn(async () => ({ ok: true })),
  uploadPropertyPhotosAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/app/actions/publish-property', () => ({
  publishPropertyAction: (...a: unknown[]) => serveur.publier(...a),
}));
vi.mock('@/app/actions/property-contacts', () => ({
  replacePropertyContactsAction: vi.fn(async () => ({ ok: true })),
}));

/** La session : `openSession` l'ouvre vraiment (un rendu suit), comme `AuthContext`. */
vi.mock('@/context/AuthContext', async () => {
  const React = await import('react');
  type U = Record<string, unknown> | null;
  const Ctx = React.createContext<{ user: U; ouvrir: (u: U) => void }>({ user: null, ouvrir: () => {} });
  return {
    __Ctx: Ctx,
    useAuth: () => {
      const c = React.useContext(Ctx);
      return {
        user: c.user,
        isLoading: false,
        setUser: (u: U) => c.ouvrir(u),
        refreshUser: async () => undefined,
        setActiveProfileId: () => {},
        openSession: async (_jeton: string, u: U) => c.ouvrir(u),
      };
    },
  };
});

import * as ModuleAuth from '@/context/AuthContext';
import { moteurEnMemoire, ouvrirBrouillonLocal } from '@/lib/publication/brouillon-local';

const { default: PublishPage } = await import('../page');

type U = Record<string, unknown> | null;
const Ctx = (ModuleAuth as unknown as { __Ctx: React.Context<{ user: U; ouvrir: (u: U) => void }> }).__Ctx;
function Session({ children }: { readonly children: ReactNode }) {
  const [user, setUser] = useState<U>(null);
  return <Ctx.Provider value={{ user, ouvrir: setUser }}>{children}</Ctx.Provider>;
}

const NEUF = { id: 200, first_name: '', last_name: null, phone: '+221775812810', phone_verified_at: '2026-11-14T13:05:07Z', phone_whatsapp: null, roles: ['customer'] };
const ESPACE = { id: 'p-37', type: 'owner', agency_id: 12, agency: { id: 12, kind: 'individual', name: 'Awa Diop' } };
const ADMIN = { id: 'p-16', type: 'agency_admin', agency_id: 12, agency: { id: 12, kind: 'individual', name: 'Awa Diop' } };

const fetchOriginal = globalThis.fetch;
const json = (corps: unknown) => new Response(JSON.stringify(corps), { status: 200, headers: { 'Content-Type': 'application/json' } });

/** Tout ce qui s'est monté pendant le parcours : dialogues (avec leur nom) et textes de la page de transit. */
let releve: { dialogues: string[]; textes: string[] };
let observateur: MutationObserver | null = null;
function relever() {
  releve = { dialogues: [], textes: [] };
  const voir = (n: Node) => {
    if (!(n instanceof Element)) return;
    const trouves = [...(n.matches('[role=dialog],[role=alertdialog]') ? [n] : []), ...n.querySelectorAll('[role=dialog],[role=alertdialog]')];
    for (const d of trouves) {
      const parId = d.getAttribute('aria-labelledby');
      releve.dialogues.push(d.getAttribute('aria-label') ?? (parId ? document.getElementById(parId)?.textContent ?? '' : '') ?? '');
    }
    const texte = n.textContent ?? '';
    const vu = texte.match(/Création de votre espace|Bienvenue|Préparation de votre annonce/);
    if (vu) releve.textes.push(vu[0]);
  };
  observateur = new MutationObserver((ms) => {
    for (const m of ms) {
      m.addedNodes.forEach(voir);
      if (m.type === 'characterData') voir(m.target.parentElement as Node);
    }
  });
  observateur.observe(document.body, { childList: true, subtree: true, characterData: true });
}

beforeEach(async () => {
  vi.clearAllMocks();
  serveur.espaceCree = false;
  stockage.moteur = moteurEnMemoire();
  // L'annonce gardée dans ce navigateur, à l'étape des photos (étape 5 sur 6), comme au navigateur.
  await ouvrirBrouillonLocal().ecrireValeurs(4, {
    title: 'Villa AC1 2601 à Dakar', type: 'villa', contract_type: 'sale', price: 45000000,
    currency: 'XOF', city: 'Dakar', region: 'Dakar', country: 'SN', furnished: false, tag_ids: [],
  });
  globalThis.fetch = vi.fn(async (entree: RequestInfo | URL) => {
    const url = typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : entree.url;
    if (url.includes('/api/me/profiles')) {
      return json({ data: serveur.espaceCree ? [ADMIN, ESPACE] : [], meta: { active_profile_id: serveur.espaceCree ? ADMIN.id : null } });
    }
    return json({ data: [] });
  }) as typeof fetch;
  tel.demander.mockResolvedValue({ attente: 60, codeApercu: '123456' });
  tel.verifier.mockResolvedValue({ token: 't', user: NEUF, is_new_account: true });
  serveur.profil.mockImplementation(async (p: Record<string, unknown>) => ({ ok: true, user: { ...NEUF, ...p } }));
  serveur.autoOnboard.mockImplementation(async () => {
    serveur.espaceCree = true;
    return { ok: true, created: true };
  });
  serveur.creer.mockResolvedValue({ ok: true, data: { id: 593 } });
  serveur.publier.mockResolvedValue({ ok: true, data: { id: 593, status: 'available' } });
});

afterEach(() => {
  observateur?.disconnect();
  observateur = null;
  globalThis.fetch = fetchOriginal;
});

describe('/publish — du code à l’écran de sortie, sans détour (TCK-2601, AC2)', () => {
  it('AC2 — aucun dialogue de bienvenue, aucune page « Création de votre espace… » entre le code et « en ligne »', async () => {
    const user = userEvent.setup();
    render(
      withIntl(
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <Session>
            <PublishPage />
          </Session>
        </QueryClientProvider>,
      ),
    );

    // L'assistant reprend l'annonce à l'étape des photos ; « Plus tard », puis « Publier l’annonce ».
    await user.click(await screen.findByRole('button', { name: 'Plus tard' }));
    await screen.findByRole('progressbar', { value: { text: 'Étape 6 sur 6' } });
    relever();
    await user.click(screen.getByRole('button', { name: 'Publier l’annonce' }));
    const feuille = await screen.findByRole('dialog', { name: 'Dernière étape : votre numéro' });
    fireEvent.change(within(feuille).getByLabelText('Votre numéro'), { target: { value: '775812810' } });
    await user.click(within(feuille).getByRole('button', { name: 'Recevoir un code' }));
    await user.click(await within(feuille).findByRole('button', { name: /utiliser ce code/i }));
    await user.type(within(feuille).getByLabelText('Prénom'), 'Awa');
    await user.type(within(feuille).getByLabelText('Nom'), 'Diop');
    await user.click(within(feuille).getByRole('button', { name: 'Publier mon annonce' }));

    // La sortie : l'écran « en ligne » (TCK-2602).
    await waitFor(() => expect(routeur.push).toHaveBeenCalledWith('/app/properties/593/en-ligne'));

    // Le chemin a bien traversé la session et la création de l'espace…
    expect(tel.verifier).toHaveBeenCalledTimes(1);
    expect(serveur.profil).toHaveBeenCalledWith({ first_name: 'Awa', last_name: 'Diop', phone_whatsapp: false });
    expect(serveur.publier).toHaveBeenCalledWith(593, { acceptTerms: true });
    // Aucun dialogue que la feuille elle-même ; aucune page de transit, à aucun instant.
    expect(new Set(releve.dialogues)).toEqual(new Set(['Dernière étape : votre numéro']));
    expect(releve.textes).toEqual([]);
    expect(screen.queryByText('Création de votre espace…')).not.toBeInTheDocument();
    // … une seule création d'espace : celle de la feuille, jamais celle de la page de transit.
    expect(serveur.autoOnboard).toHaveBeenCalledTimes(1);
    // La page n'a mené nulle part d'elle-même (ni assistant hôte, ni formulaire du bien).
    expect(routeur.replace).not.toHaveBeenCalled();
  });
});
