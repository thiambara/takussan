/**
 * TCK-568 (M2, retour testeur du 2026-09-23) — « Connexion » emporte la page courante.
 *
 * `/auth/login` sait renvoyer vers `?redirect=`, mais les deux liens « Connexion » de la barre
 * publique (bureau et menu mobile) n'en portaient aucun : se connecter depuis une recherche menait
 * toujours à `/app`, la recherche perdue. Le contrat du lien vit dans `hrefConnexion`
 * (`components/auth/lien-connexion.ts`, testé à part) ; ce fichier garde qu'il est BRANCHÉ, avec la
 * requête — une recherche sans ses filtres n'est plus celle qu'on quittait.
 *
 * TCK-2493 — le menu mobile a quitté la barre : sur mobile, la page quittée part par la case
 * « Compte » de la barre d'onglets (`?depuis=`), et l'écran `/account` la rend à « Se connecter »
 * (`EcranDuCompte.test.tsx`).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';

const routeur = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }));
const emplacement = vi.hoisted(() => ({ chemin: '/fr/properties', requete: 'contract_type=sale&type=office' }));

vi.mock('next/navigation', () => ({
  useRouter: () => routeur,
  useSearchParams: () => new URLSearchParams(emplacement.requete),
  usePathname: () => emplacement.chemin,
}));

vi.mock('next/link', () => ({
  default: React.forwardRef<HTMLAnchorElement, React.ComponentProps<'a'> & { href: string; replace?: boolean }>(
    function Lien({ href, children, replace: _replace, ...reste }, ref) {
      return <a ref={ref} href={href} {...reste}>{children}</a>;
    },
  ),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, isLoading: false, setUser: vi.fn(), token: null, logout: vi.fn() }),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({ data: [] }),
  ApiError: class extends Error {},
}));

vi.mock('@/hooks/useSuggest', () => ({
  useSuggest: () => ({ data: undefined, isLoading: false, isFetching: false }),
}));

vi.mock('@/app/actions/locale', () => ({ setLocaleAction: vi.fn(async () => {}) }));

const { Navbar } = await import('@/components/home/Navbar');
const { BarreDOngletsPublique } = await import('@/components/navigation-publique/BarreDOngletsPublique');

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      {withIntl(
        <>
          <Navbar />
          <BarreDOngletsPublique />
        </>,
      )}
    </QueryClientProvider>,
  );
}

function liensConnexion() {
  monter();
  const bureau = screen.getByRole('link', { name: 'Connexion' });
  const mobile = within(screen.getByRole('navigation', { name: 'Navigation principale' })).getByRole('link', { name: 'Compte' });
  return { bureau, mobile };
}

describe('Navbar publique — « Connexion » ramène à la page quittée (TCK-568, M2)', () => {
  beforeEach(() => {
    emplacement.chemin = '/fr/properties';
    emplacement.requete = 'contract_type=sale&type=office';
  });

  it('depuis une recherche, le lien de bureau ET la case « Compte » emportent le chemin et ses filtres', () => {
    const { bureau, mobile } = liensConnexion();
    const quittee = encodeURIComponent('/fr/properties?contract_type=sale&type=office');
    expect(bureau).toHaveAttribute('href', `/auth/login?redirect=${quittee}`);
    expect(mobile).toHaveAttribute('href', `/fr/account?depuis=${quittee}`);
  });

  it('depuis l\'accueil, le lien reste nu : on s\'y connecte pour aller à son espace', async () => {
    emplacement.chemin = '/fr';
    emplacement.requete = '';
    const { bureau, mobile } = liensConnexion();
    expect(bureau).toHaveAttribute('href', '/auth/login');
    expect(mobile).toHaveAttribute('href', '/fr/account');
  });
});
