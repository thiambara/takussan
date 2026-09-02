/**
 * TCK-505 (#1) — la barre haute ne fait plus défiler le document à 768 px.
 *
 * Mesuré par la campagne du 2026-09-02 : sur les 58 pages `/app` et `/admin`, à 768 px,
 * `scrollWidth − innerWidth` valait **+81 px** (agent), **+94 px** (propriétaire) et **+118 px**
 * (admin d'agence). Deux causes, dans cette barre :
 *
 *   1. `SearchAutocomplete` en `hidden md:block min-w-80 flex-1` — 320 px incompressibles, posés
 *      au pixel exact où la coque montre déjà sa barre latérale de 256 px ;
 *   2. le cluster droit (`ml-auto flex items-center gap-2`) qui ne rétrécit pas : ses libellés
 *      (« Agent · Dakar Immo », prénom) ne se cachaient qu'en dessous de `sm`.
 *
 * Ces tests assertent des CLASSES, pas une largeur : jsdom ne pose aucune feuille de style, la
 * mesure réelle est faite par le banc CDP (`docs/qa/responsive-2026-09-02.md`). Chaque assertion
 * exige aussi l'ABSENCE de l'ancienne classe : `md:block lg:block` cocherait un `toContain('lg:block')`
 * sans rien corriger.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { User } from '@/types/user';
import type { MyProfilesResponse, Profile } from '@/types/profile';
import { ToastProvider } from '@/components/ui/toast';
import { AppTopbar } from '../AppTopbar';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/app',
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: null, user: null, logout: vi.fn(), refreshUser: vi.fn() }),
}));

vi.mock('@/hooks/useSuggest', () => ({
  useSuggest: () => ({ data: undefined, isLoading: false, isFetching: false }),
}));

// Le sélecteur de profil est alimenté ICI, sans réseau : un profil (libellé statique) ou deux
// (déclencheur de menu) — les deux formes portent un libellé, et les deux doivent le cacher sous `lg`.
let profils: MyProfilesResponse = { data: [], meta: { active_profile_id: null, count: 0 } };
vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => ({ data: profils, isLoading: false }),
  useSwitchActiveProfile: () => ({ mutate: vi.fn(), isPending: false }),
}));

const AGENCE = { id: 7, name: 'Dakar Immo', slug: 'dakar-immo', kind: 'standard' as const };

function profil(type: Profile['type'], id: number): Profile {
  return { id: `${type}:${id}`, type, numeric_id: id, agency_id: AGENCE.id, agency: AGENCE, status: 'active', created_at: null };
}

const UTILISATEUR = {
  id: 1,
  first_name: 'Awa',
  last_name: 'Diop',
  full_name: 'Awa Diop',
  email: 'awa@example.test',
  roles: ['agent'],
  avatar_url: null,
} as unknown as User;

function rendreBarreHaute(liste: Profile[]) {
  profils = { data: liste, meta: { active_profile_id: liste[0]?.id ?? null, count: liste.length } };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AppTopbar user={UTILISATEUR} onMenuToggle={vi.fn()} />
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

afterEach(() => cleanup());

describe('AppTopbar — rien ne pousse la barre au-delà du viewport à 768 px (TCK-505 #1)', () => {
  it('la recherche ne se montre que dès `lg`, et peut rétrécir (`min-w-0`, plus de `min-w-80`)', () => {
    rendreBarreHaute([profil('agent', 5)]);
    const racine = screen.getByRole('searchbox').closest('.flex-1');
    expect(racine, 'la racine de SearchAutocomplete doit porter flex-1').not.toBeNull();
    const classes = racine!.className.split(/\s+/);

    // À `md` la coque affiche déjà la barre latérale (256 px) : il ne reste pas 320 px pour elle.
    expect(classes).toContain('lg:block');
    expect(classes).not.toContain('md:block');
    // 320 px incompressibles : c'est la cause directe des +81 px mesurés.
    expect(classes).toContain('min-w-0');
    expect(classes).not.toContain('min-w-80');
  });

  it("le cluster droit rétrécit au lieu de pousser (`min-w-0 shrink`)", () => {
    const { container } = rendreBarreHaute([profil('agent', 5)]);
    const cluster = container.querySelector('header > div.ml-auto');
    expect(cluster, 'le cluster droit est le <div class="ml-auto …"> enfant direct du <header>').not.toBeNull();
    const classes = cluster!.className.split(/\s+/);
    expect(classes).toContain('min-w-0');
    expect(classes).toContain('shrink');
  });

  it('le prénom du menu utilisateur ne se montre que dès `lg` (plus `sm`)', () => {
    rendreBarreHaute([profil('agent', 5)]);
    const prenom = screen.getByText('Awa');
    const classes = prenom.className.split(/\s+/);
    expect(classes).toContain('hidden');
    expect(classes).toContain('lg:inline');
    expect(classes).not.toContain('sm:inline');
  });

  it('un seul profil : le libellé statique disparaît EN ENTIER sous `lg` (plus `sm`)', () => {
    rendreBarreHaute([profil('agent', 5)]);
    // Ce n'est pas un contrôle : son point seul (8 px, `aria-hidden`) ne dirait rien.
    const bloc = screen.getByTestId('profile-switcher-static');
    const classes = bloc.className.split(/\s+/);
    expect(classes).toContain('hidden');
    expect(classes).toContain('lg:inline-flex');
    expect(classes).not.toContain('sm:inline-flex');
    expect(bloc).toHaveTextContent(/Dakar Immo/);
  });

  it('deux profils : le déclencheur reste, seul son libellé se cache sous `lg`', () => {
    rendreBarreHaute([profil('agent', 5), profil('owner', 9)]);
    // Le changement de profil doit rester possible à 768 px : point + chevron restent visibles.
    const declencheur = screen.getByTestId('profile-switcher-trigger');
    expect(declencheur.className.split(/\s+/)).not.toContain('hidden');
    // « Agent · Dakar Immo » : le libellé court du profil actif.
    const libelle = screen.getByText(/Dakar Immo/);
    const classes = libelle.className.split(/\s+/);
    expect(classes).toContain('hidden');
    expect(classes).toContain('lg:inline');
    expect(classes).not.toContain('sm:inline');
  });
});
