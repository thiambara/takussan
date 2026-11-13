/**
 * TCK-2606 — la voie e-mail en deux onglets, montée par le VRAI formulaire de `/auth/login`.
 *
 * - AC1 : « Créer un compte » envoie `{email, password}` à l'API — éprouvé sur le corps de la requête
 *   réseau (le vrai `register`, le vrai `apiRequest`), pas sur un double de `register` ;
 * - AC2 : la règle du mot de passe reste écrite sous le champ pendant la frappe ;
 * - « Mot de passe oublié ? » garde l'intention ; `?voie=inscription` ouvre « Créer un compte »,
 *   `?reset=1` la voie e-mail même quand le numéro est ouvert.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

const pushMock = vi.fn();
const openSessionMock = vi.fn();
const actif = vi.fn();
const fournisseurs = vi.fn();
let searchParams = new URLSearchParams();

vi.mock('@/lib/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth')>()),
  oauthProviders: () => fournisseurs(),
}));
vi.mock('@/components/auth/useConnexionParTelephone', () => ({ useConnexionParTelephone: () => actif() }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ openSession: openSessionMock }) }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, back: vi.fn() }),
  useSearchParams: () => searchParams,
  usePathname: () => '/auth/login',
}));

const { FormulaireDeConnexion } = await import('../login/FormulaireDeConnexion');

const REGLE = '8 caractères minimum, avec une lettre et un chiffre.';

interface Appel {
  readonly url: string;
  readonly corps: unknown;
}
let appels: Appel[] = [];

beforeEach(() => {
  pushMock.mockReset();
  openSessionMock.mockReset();
  openSessionMock.mockResolvedValue(undefined);
  actif.mockReset();
  actif.mockReturnValue(false);
  fournisseurs.mockReset();
  fournisseurs.mockResolvedValue([{ provider: 'google', configured: true }]);
  searchParams = new URLSearchParams();
  appels = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      appels.push({ url, corps: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
      const corps = { token: 'jeton', expires_at: null, user: { id: 9, email: 'awa@example.com' }, message: 'ok' };
      return { ok: true, status: 201, headers: new Headers({ 'content-type': 'application/json' }), json: async () => corps, text: async () => JSON.stringify(corps) } as unknown as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('« Créer un compte »', () => {
  it('AC1 — le corps de la requête ne porte que l’adresse et le mot de passe, puis la vérification de l’adresse', async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams({ voie: 'inscription', redirect: '/properties/villa-ngor', intention: 'reservation' });
    render(withIntl(<FormulaireDeConnexion />));

    await user.type(screen.getByLabelText('E-mail'), 'awa@example.com');
    await user.type(screen.getByLabelText('Mot de passe'), 'Secret123');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Créer mon compte' }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledTimes(1));
    const inscription = appels.filter((a) => a.url.endsWith('/api/auth/register'));
    expect(inscription).toHaveLength(1);
    expect(inscription[0].corps).toEqual({ email: 'awa@example.com', password: 'Secret123' });
    expect(openSessionMock).toHaveBeenCalledWith('jeton', { id: 9, email: 'awa@example.com' }, null);
    expect(pushMock).toHaveBeenCalledWith('/auth/verify-email?redirect=%2Fproperties%2Fvilla-ngor&intention=reservation');
  });

  it('AC2 — la règle reste écrite sous le champ pendant la frappe, et le décrit', async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams({ voie: 'inscription' });
    render(withIntl(<FormulaireDeConnexion />));

    const champ = screen.getByLabelText('Mot de passe');
    expect(screen.getByText(REGLE)).toBeVisible();
    expect(champ).not.toHaveAttribute('placeholder');

    await user.type(champ, 'abc');
    expect(screen.getByText(REGLE)).toBeVisible();
    expect(champ).toHaveAccessibleDescription(expect.stringContaining(REGLE));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('trois contrôles seulement : l’adresse, le mot de passe, les conditions', () => {
    searchParams = new URLSearchParams({ voie: 'inscription' });
    render(withIntl(<FormulaireDeConnexion />));

    const panneau = screen.getByRole('tabpanel');
    expect(panneau.querySelectorAll('input')).toHaveLength(3);
    expect(screen.getByText('Votre prénom vous sera demandé à l’écran suivant — rien d’autre.')).toBeInTheDocument();
  });

  it('le prénom annoncé : la phrase courte au téléphone, la longue au bureau (une seule affichée)', () => {
    searchParams = new URLSearchParams({ voie: 'inscription' });
    render(withIntl(<FormulaireDeConnexion />));

    expect(screen.getByText('Votre prénom vous sera demandé juste après — rien d’autre.')).toHaveClass('lg:hidden');
    expect(screen.getByText('Votre prénom vous sera demandé à l’écran suivant — rien d’autre.')).toHaveClass('max-lg:hidden');
  });
});

describe('les onglets', () => {
  it('?voie=inscription ouvre « Créer un compte » — même quand le numéro est ouvert', async () => {
    actif.mockReturnValue(true);
    searchParams = new URLSearchParams({ voie: 'inscription' });
    render(withIntl(<FormulaireDeConnexion />));

    expect(screen.getByRole('tab', { name: 'Créer un compte' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByLabelText('Votre numéro')).toBeNull();
    expect(screen.getByRole('button', { name: 'Utiliser plutôt mon numéro' })).toBeInTheDocument();
  });

  it('?reset=1 : la voie e-mail et son bandeau, même quand le numéro est ouvert', () => {
    actif.mockReturnValue(true);
    searchParams = new URLSearchParams({ reset: '1' });
    render(withIntl(<FormulaireDeConnexion />));

    expect(screen.getByRole('tab', { name: 'J’ai un compte' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Votre mot de passe a été réinitialisé');
  });

  it('les flèches passent d’un onglet à l’autre', async () => {
    const user = userEvent.setup();
    searchParams = new URLSearchParams({ voie: 'email' });
    render(withIntl(<FormulaireDeConnexion />));

    await user.click(screen.getByRole('tab', { name: 'J’ai un compte' }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Créer un compte' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Créer un compte' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Créer mon compte' })).toBeInTheDocument();
  });

  it('« Mot de passe oublié ? » garde la page à rouvrir ET le geste', () => {
    searchParams = new URLSearchParams({ voie: 'email', redirect: '/properties/villa-ngor', intention: 'reservation' });
    render(withIntl(<FormulaireDeConnexion />));

    expect(screen.getByRole('link', { name: 'Mot de passe oublié ?' })).toHaveAttribute(
      'href',
      '/auth/forgot-password?redirect=%2Fproperties%2Fvilla-ngor&intention=reservation',
    );
  });
});

describe('les autres voies sous la voie e-mail', () => {
  it('numéro fermé : la voie e-mail est la porte — Google après le formulaire, aucun renvoi vers le numéro', async () => {
    render(withIntl(<FormulaireDeConnexion />));

    const google = await screen.findByRole('button', { name: /Google/ });
    expect(screen.getByRole('button', { name: 'Me connecter' }).compareDocumentPosition(google)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.queryByRole('button', { name: /mon numéro/ })).toBeNull();
  });

  it('numéro ouvert : « Utiliser plutôt mon numéro », et Google reste sur la porte du numéro', async () => {
    actif.mockReturnValue(true);
    searchParams = new URLSearchParams({ voie: 'email' });
    render(withIntl(<FormulaireDeConnexion />));

    expect(screen.getByRole('button', { name: 'Utiliser plutôt mon numéro' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: /Google/ })).toBeNull());
  });
});
