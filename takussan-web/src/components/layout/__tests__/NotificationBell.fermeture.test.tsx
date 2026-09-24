/**
 * TCK-569 (M14, retour testeur du 2026-09-23) — « les modales se superposent et celle des notifs
 * ne se ferme pas quand tu appuies dans le vide ».
 *
 * La capture est celle d'un build de préproduction ANTÉRIEUR au 2026-09-16 (panneau sans aucune
 * fermeture extérieure, ancré à droite de la cloche) ; au doigt, le panneau de HEAD se fermait déjà
 * (mesuré, Chrome, émulation tactile, 320 px). Ce qu'il laissait passer, mesuré à 320 et à 1366 px :
 * son écouteur n'écoutait que le POINTEUR — cloche ouverte, Tab jusqu'à l'avatar, Entrée, et
 * panneau et menu s'affichaient l'un sur l'autre. Le panneau passe sur la primitive `Popover`.
 *
 * Ablation (panneau de HEAD remis en place) : le test clavier ROUGIT — c'est lui qui établit le
 * défaut. Les deux tests de position rougissent aussi, mais pour une raison mécanique (HEAD n'a pas
 * de positionneur, donc pas de translation à lire) : sur HEAD, la géométrie était déjà juste
 * (`inset-x-2`, mesuré 8..312 à 320 px). Ce sont, comme les trois autres, des gardes de
 * non-régression de ce que la primitive devait conserver.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import type { User } from '@/types/user';
import { AppTopbar } from '../AppTopbar';

const getNotificationsMock = vi.fn();

vi.mock('@/app/actions/notifications', () => ({
  getNotificationsAction: () => getNotificationsMock(),
  markNotificationReadAction: vi.fn(),
  markNotificationUnreadAction: vi.fn(),
  markAllNotificationsReadAction: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/app/messages',
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, token: null, isLoading: false, logout: vi.fn() }),
}));

vi.mock('@/components/profile/ProfileSwitcher', () => ({
  ProfileSwitcher: () => null,
}));

vi.mock('@/components/shared/LanguageSwitcher', () => ({
  LanguageSwitcher: () => null,
}));

vi.mock('@/components/search/SearchAutocomplete', () => ({
  SearchAutocomplete: () => null,
}));

const UTILISATEUR: User = {
  id: 1,
  first_name: 'Fa',
  last_name: 'Diop',
  full_name: 'Fa Diop',
  email: 'fa@example.com',
  phone: null,
  bio: null,
  avatar_url: null,
  email_verified_at: null,
  phone_verified_at: null,
  two_factor_enabled: false,
  roles: ['owner'],
  status: 'active',
  created_at: '2026-05-08T10:00:00.000000Z',
};

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <AppTopbar user={UTILISATEUR} />
        <main>Aucune conversation.</main>
      </QueryClientProvider>,
    ),
  );
}

// Par son nom et non par son rôle : l'ancien panneau était une `region`, le nouveau un `dialog` —
// l'ablation doit éprouver le comportement, pas le rôle.
const panneau = () => screen.queryByLabelText('Centre de notifications');
const cloche = () => screen.getByRole('button', { name: 'Notifications' });
const avatar = () => screen.getByRole('button', { name: /Fa Diop/ });

/** Le positionneur mesure l'élément qui PORTE la fenêtre, pas la fenêtre elle-même. */
const portePanneau = (el: Element) =>
  el.matches('[aria-label="Centre de notifications"]') ||
  !!el.querySelector(':scope > [aria-label="Centre de notifications"]');

/** Écran, cloche (36 × 36 à y = 10) et panneau (`largeur` × 440) tels que relevés au navigateur. */
function geometrie(ecran: number, clocheGauche: number, largeur: number) {
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: ecran });
  Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: 740 });
  const rectOrigine = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.getAttribute('aria-label') === 'Notifications') return new DOMRect(clocheGauche, 10, 36, 36);
    if (portePanneau(this)) return new DOMRect(0, 0, largeur, 440);
    return rectOrigine.call(this);
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return portePanneau(this) ? largeur : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return portePanneau(this) ? 440 : 0;
  });
}

/** Bord gauche écrit par le positionneur (`transform: translate(x, y)`), ou null sans positionneur. */
function bordGauche(el: HTMLElement | null): number | null {
  const m = /translate\((-?[\d.]+)px/.exec(el?.parentElement?.style.transform ?? '');
  return m ? Number(m[1]) : null;
}

describe('Panneau des notifications — une fenêtre à la fois (TCK-569, M14)', () => {
  beforeEach(() => {
    getNotificationsMock.mockReset();
    getNotificationsMock.mockResolvedValue({
      ok: true,
      data: { data: [], meta: { total: 0, unread: 0, current_page: 1 } },
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('au clavier, ouvrir le menu utilisateur referme le panneau des notifications', async () => {
    const utilisateur = userEvent.setup();
    rendre();

    cloche().focus();
    await utilisateur.keyboard('{Enter}');
    await waitFor(() => expect(panneau()).not.toBeNull());

    // Tab jusqu'à l'avatar, sans rien toucher au pointeur.
    for (let i = 0; i < 10 && document.activeElement !== avatar(); i += 1) {
      await utilisateur.tab();
    }
    expect(avatar()).toHaveFocus();
    await utilisateur.keyboard('{Enter}');

    await waitFor(() => expect(screen.getByRole('menu')).toBeInTheDocument());
    await waitFor(() => expect(panneau()).toBeNull());
  });

  it('au pointeur, ouvrir le menu utilisateur referme le panneau (garde)', async () => {
    const utilisateur = userEvent.setup();
    rendre();

    await utilisateur.click(cloche());
    await waitFor(() => expect(panneau()).not.toBeNull());
    await utilisateur.click(avatar());

    await waitFor(() => expect(screen.getByRole('menu')).toBeInTheDocument());
    await waitFor(() => expect(panneau()).toBeNull());
  });

  it('un appui dans le vide le ferme (garde)', async () => {
    const utilisateur = userEvent.setup();
    rendre();

    await utilisateur.click(cloche());
    await waitFor(() => expect(panneau()).not.toBeNull());
    await utilisateur.click(screen.getByText('Aucune conversation.'));

    await waitFor(() => expect(panneau()).toBeNull());
  });

  it('Échap le ferme et rend le focus à la cloche (garde)', async () => {
    const utilisateur = userEvent.setup();
    rendre();

    await utilisateur.click(cloche());
    await waitFor(() => expect(panneau()).not.toBeNull());
    await utilisateur.keyboard('{Escape}');

    await waitFor(() => expect(panneau()).toBeNull());
    await waitFor(() => expect(cloche()).toHaveFocus());
  });

  it('à 320 px, le panneau tient dans l’écran à 8 px de chaque bord', async () => {
    geometrie(320, 213, 384);
    const utilisateur = userEvent.setup();
    rendre();

    await utilisateur.click(cloche());
    await waitFor(() => expect(bordGauche(panneau())).toBe(8));
  });

  it('en bureau, le panneau reste aligné sur le bord droit de la cloche (864 à 1366 px)', async () => {
    geometrie(1366, 1212, 384);
    const utilisateur = userEvent.setup();
    rendre();

    await utilisateur.click(cloche());
    await waitFor(() => expect(bordGauche(panneau())).toBe(864));
  });
});
