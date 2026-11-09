/**
 * TCK-2493 (ADR-0091) — la barre d'onglets du site public, sous `lg`.
 *
 * Les cases par persona sont éprouvées sur la composition (`lib/navigation/__tests__/barre-publique.test.ts`,
 * la table de l'ADR) ; ce fichier garde le RENDU : la `nav` nommée, ses cinq cases, la case active
 * par `aria-current`, les compteurs, l'absence sur la fiche et dans les tunnels, et des liens qui
 * naviguent sans recharger le document.
 */
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { User, UserRole } from '@/types/user';

const push = vi.fn();
const etat = vi.hoisted(() => ({
  chemin: '/fr/properties',
  requete: '',
  user: null as User | null,
  profilActif: null as string | null,
  compteurs: {} as Record<string, number>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(etat.requete),
  usePathname: () => etat.chemin,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, onClick, ...reste }: React.ComponentProps<'a'> & { href: string }) => (
    <a
      href={href}
      onClick={(e) => {
        // Le vrai `next/link` empêche la navigation de document et confie la suite au routeur client.
        e.preventDefault();
        onClick?.(e);
        push(href);
      }}
      {...reste}
    >
      {children}
    </a>
  ),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: etat.user, activeProfileId: etat.profilActif, token: etat.user ? 'jeton' : null, isLoading: false }),
}));

vi.mock('@/hooks/useCan', () => ({
  useMyCapabilities: () => ({ data: { data: { agency_id: 1, capabilities: ['properties.create'] } } }),
}));

vi.mock('@/components/layout/useCompteursDuMenu', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/layout/useCompteursDuMenu')>()),
  useCompteursDuMenu: () => new Proxy(etat.compteurs, { get: (cible, cle: string) => cible[cle] ?? 0 }),
}));

const { BarreDOngletsPublique } = await import('../BarreDOngletsPublique');

function compte(roles: UserRole[]): User {
  return { id: 3, first_name: 'Awa', last_name: 'Diop', full_name: 'Awa Diop', email: 'awa@example.test', roles } as unknown as User;
}

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return render(<QueryClientProvider client={client}>{withIntl(<BarreDOngletsPublique />)}</QueryClientProvider>);
}

const barre = () => screen.getByRole('navigation', { name: 'Navigation principale' });
const cases = () => within(barre()).getAllByRole('link');
const libelles = () => cases().map((a) => a.textContent?.trim());

beforeEach(() => {
  push.mockReset();
  etat.chemin = '/fr/properties';
  etat.requete = '';
  etat.user = null;
  etat.profilActif = null;
  etat.compteurs = {};
});

describe('TCK-2493 — anonyme : Explorer · Favoris · Publier · Messages · Compte', () => {
  it('une `nav` nommée, cinq cases dans cet ordre', () => {
    etat.chemin = '/fr/agencies';
    monter();
    expect(libelles()).toEqual(['Explorer', 'Favoris', 'Publier', 'Messages', 'Compte']);
    expect(cases().map((a) => a.getAttribute('href'))).toEqual([
      '/fr',
      '/fr/favorites',
      '/publish',
      '/app/messages',
      // TCK-568 — « Compte » emporte la page quittée : « Se connecter » y ramènera.
      `/fr/account?depuis=${encodeURIComponent('/fr/agencies')}`,
    ]);
  });

  it('la case active porte `aria-current="page"`, et elle seule', () => {
    etat.chemin = '/fr/favorites';
    monter();
    const actives = cases().filter((a) => a.getAttribute('aria-current') === 'page');
    expect(actives.map((a) => a.textContent?.trim())).toEqual(['Favoris']);
  });

  it('sur `/account`, c’est « Compte » qui est active', () => {
    etat.chemin = '/fr/account';
    monter();
    expect(within(barre()).getByRole('link', { name: 'Compte' })).toHaveAttribute('aria-current', 'page');
  });

  it('ses liens naviguent sans recharger le document ; « Publier » mène à /publish, non localisé', async () => {
    const user = userEvent.setup();
    monter();
    const evenements: MouseEvent[] = [];
    document.addEventListener('click', (e) => evenements.push(e as MouseEvent));
    await user.click(within(barre()).getByRole('link', { name: 'Publier' }));
    expect(evenements.at(-1)?.defaultPrevented).toBe(true);
    expect(push).toHaveBeenCalledWith('/publish');
  });

  it('porte le marqueur que `globals.css` lit pour réserver le bas de page et relever le dock', () => {
    monter();
    expect(barre()).toHaveAttribute('data-barre-onglets-publique');
    expect(barre().className.split(/\s+/)).toContain('lg:hidden');
  });
});

describe('TCK-2493 — une seule couche d’action en bas : la barre se retire', () => {
  it.each(['/fr/properties/villa-ngor', '/fr/pay/jeton', '/fr/claim/jeton', '/fr/share/jeton', '/fr/bookings', '/app'])(
    '%s : aucune barre',
    (chemin) => {
      etat.chemin = chemin;
      monter();
      expect(screen.queryByRole('navigation', { name: 'Navigation principale' })).toBeNull();
    },
  );
});

describe('TCK-2493 — connecté : les cases suivent le profil actif', () => {
  it('locataire : Explorer · Loyer · Interventions · Messages · Moi', () => {
    etat.user = compte(['customer', 'tenant']);
    monter();
    expect(libelles()).toEqual(['Explorer', 'Loyer', 'Interventions', 'Messages', expect.stringContaining('Moi')]);
    expect(within(barre()).getByRole('link', { name: /Moi/ })).toHaveAttribute('href', '/fr/account');
  });

  it('agent : Demandes et Visites, avec le compteur dans le nom accessible', () => {
    etat.user = compte(['customer', 'agent']);
    etat.profilActif = 'agent:4';
    etat.compteurs = { unhandledLeads: 3, unreadMessages: 120 };
    monter();
    // Le texte de la case porte aussi sa pastille (muette) : on lit le libellé en fin de texte.
    expect(libelles().slice(1, 3)).toEqual([expect.stringMatching(/Demandes$/), expect.stringMatching(/Visites$/)]);
    const demandes = cases()[1]!;
    expect(demandes.getAttribute('aria-label')).toMatch(/^Demandes, /);
    expect(within(demandes).getByText('3')).toHaveAttribute('aria-hidden', 'true');
    // Plus de 99 : la pastille plafonne.
    expect(within(cases()[3]!).getByText('99+')).toBeInTheDocument();
  });

  it('changer d’espace change la barre, sans recharger : le persona suit le profil actif', () => {
    etat.user = compte(['customer', 'owner', 'agent']);
    etat.profilActif = 'owner:2';
    const { rerender } = monter();
    expect(libelles().slice(1, 3)).toEqual(['Mes biens', 'Demandes']);
    etat.profilActif = 'agent:4';
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { enabled: false } } })}>
        {withIntl(<BarreDOngletsPublique />)}
      </QueryClientProvider>,
    );
    expect(libelles().slice(1, 3)).toEqual(['Demandes', 'Visites']);
  });
});
