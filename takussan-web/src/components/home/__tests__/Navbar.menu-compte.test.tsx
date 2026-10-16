/**
 * TCK-641 et TCK-642 — le panneau mobile de la navbar publique devient l'accès au COMPTE, et le
 * solde de crédits de l'espace actif paraît dans la barre (ordinateur) et dans le panneau (mobile).
 *
 * Retour du porteur du 2026-10-14 (capture du panneau, connecté) : Louer et Acheter en tête, rendu
 * plat. Demandé : sans Louer/Acheter, « Mes biens » à côté de « Mon profil », et les crédits.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import type { User, UserRole } from '@/types/user';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams('contract_type=sale'),
  usePathname: () => '/fr/properties',
}));

vi.mock('next/link', () => ({
  default: ({ href, children, replace: _replace, ...reste }: React.ComponentProps<'a'> & { href: string; replace?: boolean }) => (
    <a href={href} {...reste}>{children}</a>
  ),
}));

const session = vi.hoisted(() => ({ user: null as User | null }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: session.user, isLoading: false, setUser: vi.fn(), token: null, logout: vi.fn() }),
}));

const soldeMock = vi.hoisted(() => vi.fn<(o: { enabled: boolean }) => number | null>(() => null));
vi.mock('@/lib/queries/credits-solde', () => ({
  useSoldeCredits: (o: { enabled: boolean }) => soldeMock(o),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({ data: [] }),
  ApiError: class extends Error {},
}));

vi.mock('@/hooks/useSuggest', () => ({
  useSuggest: () => ({ data: undefined, isLoading: false, isFetching: false }),
}));

const { Navbar } = await import('@/components/home/Navbar');

function compte(roles: UserRole[]): User {
  return {
    id: 7, first_name: 'Mariama', last_name: 'Touré', full_name: 'Mariama Touré',
    email: 'mariama@example.test', roles,
  } as unknown as User;
}

function monter(roles: UserRole[] | null) {
  session.user = roles === null ? null : compte(roles);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{withIntl(<Navbar />)}</QueryClientProvider>);
}

async function ouvrir(roles: UserRole[] | null) {
  const user = userEvent.setup();
  monter(roles);
  await user.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));
  return screen.findByRole('dialog', { name: 'Menu' });
}

/** Les entrées de compte du panneau, dans l'ordre du DOM. */
function entreesDeCompte(panneau: HTMLElement): string[] {
  return Array.from(panneau.querySelectorAll('ul a')).map((a) => a.getAttribute('href') ?? '');
}

beforeEach(() => {
  soldeMock.mockReset();
  soldeMock.mockReturnValue(null);
});

describe('TCK-641 — le panneau mobile, connecté', () => {
  it('AC1 — aucun lien Louer ni Acheter', async () => {
    const panneau = await ouvrir(['owner', 'customer']);
    expect(within(panneau).queryByRole('link', { name: 'Louer' })).toBeNull();
    expect(within(panneau).queryByRole('link', { name: 'Acheter' })).toBeNull();
    for (const lien of within(panneau).getAllByRole('link')) {
      expect(lien.getAttribute('href') ?? '', lien.textContent ?? '').not.toContain('contract_type');
    }
  });

  it.each([
    [['owner', 'customer']],
    [['agent', 'customer']],
    [['agency_admin', 'customer']],
  ] as UserRole[][][])('AC2 — %j peut ouvrir /app/properties : « Mes biens » y mène, après « Mon profil »', async (roles) => {
    const panneau = await ouvrir(roles);
    expect(within(panneau).getByRole('link', { name: 'Mes biens' })).toHaveAttribute('href', '/app/properties');
    expect(entreesDeCompte(panneau).slice(0, 2)).toEqual(['/app/profile', '/app/properties']);
  });

  it.each([
    [['customer']],
    [['customer', 'tenant']],
    [['service_provider', 'customer']],
  ] as UserRole[][][])('AC3 — %j ne peut pas l’ouvrir : pas d’entrée', async (roles) => {
    const panneau = await ouvrir(roles);
    expect(within(panneau).queryByRole('link', { name: 'Mes biens' })).toBeNull();
    expect(entreesDeCompte(panneau)).toEqual(['/app/profile']);
  });

  it('identité en tête, « Publier une annonce » seul appel fort, déconnexion après la langue', async () => {
    const panneau = await ouvrir(['owner', 'customer']);
    const texte = panneau.textContent ?? '';
    expect(texte.indexOf('Mariama Touré')).toBeLessThan(texte.indexOf('Mon profil'));
    expect(texte.indexOf('Langue')).toBeLessThan(texte.indexOf('Déconnexion'));
    const publier = within(panneau).getByRole('link', { name: 'Publier une annonce' });
    expect(publier).toHaveAttribute('href', '/publish');
    expect(publier.className).toContain('bg-primary');
    // L'unique aplat terracotta du panneau, hors le choix de langue courant.
    const pleins = Array.from(panneau.querySelectorAll('a, button')).filter((el) =>
      el.className.toString().split(/\s+/).includes('bg-primary') && el.getAttribute('aria-current') !== 'true');
    expect(pleins).toEqual([publier]);
  });
});

describe('TCK-641 — le panneau mobile, anonyme (AC4)', () => {
  it('propose toujours la connexion, et n’a ni compte ni crédits', async () => {
    const panneau = await ouvrir(null);
    expect(within(panneau).getByRole('link', { name: 'Connexion' })).toHaveAttribute('href', '/auth/login?redirect=%2Ffr%2Fproperties%3Fcontract_type%3Dsale');
    expect(within(panneau).getByRole('link', { name: 'Publier une annonce' })).toBeInTheDocument();
    expect(within(panneau).queryByRole('link', { name: 'Mes biens' })).toBeNull();
    expect(soldeMock).not.toHaveBeenCalled();
  });
});

describe('TCK-642 — le solde dans le panneau mobile', () => {
  it('admin d’espace : « Crédits » en troisième, avec le solde, vers /app/credits (AC3)', async () => {
    soldeMock.mockReturnValue(12);
    const panneau = await ouvrir(['agency_admin', 'customer']);
    const credits = within(panneau).getByRole('link', { name: 'Crédits : 12 crédits' });
    expect(credits).toHaveAttribute('href', '/app/credits');
    expect(credits.querySelector('[data-slot="solde-credits"]')).toHaveTextContent('12');
    expect(entreesDeCompte(panneau)).toEqual(['/app/profile', '/app/properties', '/app/credits']);
  });

  it('solde inconnu (refus, panne, chargement) : ni entrée, ni « 0 » (AC5)', async () => {
    soldeMock.mockReturnValue(null);
    const panneau = await ouvrir(['agency_admin', 'customer']);
    expect(within(panneau).queryByRole('link', { name: /Crédits/ })).toBeNull();
    expect(within(panneau).queryByText('0')).toBeNull();
  });

  it('sans droit sur le portefeuille : aucune lecture du solde, aucune entrée (AC2)', async () => {
    soldeMock.mockReturnValue(12);
    const panneau = await ouvrir(['agent', 'owner', 'customer']);
    expect(within(panneau).queryByRole('link', { name: /Crédits/ })).toBeNull();
    expect(soldeMock).not.toHaveBeenCalled();
  });
});

describe('TCK-642 — la pastille de la navbar (ordinateur)', () => {
  it('admin d’espace : le solde, qui mène à /app/credits (AC3)', () => {
    soldeMock.mockReturnValue(12);
    const { container } = monter(['agency_admin', 'customer']);
    const barre = container.querySelector('nav')!;
    const pastille = within(barre).getByRole('link', { name: 'Crédits : 12 crédits' });
    expect(pastille).toHaveAttribute('href', '/app/credits');
    expect(pastille).toHaveTextContent('12');
    // Dans le bloc d'actions de bureau (`hidden lg:flex`) : sur mobile, le solde est dans le menu.
    expect(pastille.closest('.lg\\:flex')).not.toBeNull();
  });

  it('solde inconnu : aucune pastille, aucun « 0 » (AC5)', () => {
    soldeMock.mockReturnValue(null);
    const { container } = monter(['agency_admin', 'customer']);
    expect(container.querySelector('[data-slot="pastille-credits"]')).toBeNull();
    expect(within(container.querySelector('nav')!).queryByText('0')).toBeNull();
  });

  it('sans droit : ni pastille, ni lecture (AC2)', () => {
    soldeMock.mockReturnValue(12);
    const { container } = monter(['owner', 'customer']);
    expect(container.querySelector('[data-slot="pastille-credits"]')).toBeNull();
    expect(soldeMock).not.toHaveBeenCalled();
  });
});
