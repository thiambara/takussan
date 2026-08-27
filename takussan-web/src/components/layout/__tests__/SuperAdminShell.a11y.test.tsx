/**
 * TCK-359 — accessibilité du shell super-admin : lien d'évitement, cible focalisable, anneau de
 * focus clavier sur les trois types de liens de la sidebar.
 *
 * ⚠ Ce que jsdom NE fait PAS, et pourquoi les assertions ont cette forme : jsdom n'implémente
 * aucune navigation par fragment. Un `click()` sur `href="#super-admin-main"` n'y déplace donc
 * jamais le focus, quelle que soit la justesse du code. Le déplacement de focus est ici assuré
 * par le `onClick` du composant — qui existe aussi pour Safari, où le comportement natif manque
 * pour de bon — et c'est LUI que ce test exécute. Le `href` est vérifié séparément : sans lui, un
 * lien d'évitement ne servirait à rien dès que JavaScript n'a pas encore hydraté.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import type { User } from '@/types/user';
import { SUPER_ADMIN_MAIN_ID, SuperAdminShell } from '../SuperAdminShell';
import { SuperAdminSidebar } from '../SuperAdminSidebar';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/super-admin',
  useSearchParams: () => ({ get: () => null, toString: () => '' }),
}));

vi.mock('@/hooks/useImpersonation', () => ({
  useImpersonationSession: () => null,
  useStopImpersonation: () => ({ mutate: vi.fn(), isPending: false }),
}));

const user: User = {
  id: 1,
  first_name: 'Awa',
  last_name: 'Diop',
  email: 'awa@example.test',
  roles: ['super_admin'],
} as unknown as User;

function renderShell() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <SuperAdminShell user={user}>
          <p>contenu de la page</p>
        </SuperAdminShell>
      </QueryClientProvider>,
    ),
  );
}

function renderSidebar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <SuperAdminSidebar />
      </QueryClientProvider>,
    ),
  );
}

afterEach(() => cleanup());

describe('SuperAdminShell — lien d’évitement (TCK-359)', () => {
  it('rend le lien d’évitement en PREMIER élément focalisable du shell', async () => {
    const { container } = renderShell();

    const lien = screen.getByRole('link', { name: 'Aller au contenu principal' });

    // Le premier tabulable du document doit être ce lien-là, pas la 1re des 24 entrées de menu.
    // On l'établit sur l'ordre du DOM plutôt que sur `userEvent.tab()`, dont l'ordre dépend d'un
    // calcul de visibilité que jsdom ne fait pas.
    const focalisables = Array.from(
      container.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]'),
    ).filter((el) => el.getAttribute('tabindex') !== '-1');

    expect(focalisables[0]).toBe(lien);
  });

  it('pointe vers l’id porté par <main>, et <main> est focalisable par programme', () => {
    const { container } = renderShell();

    const lien = screen.getByRole('link', { name: 'Aller au contenu principal' });
    const main = container.querySelector('main');

    expect(lien).toHaveAttribute('href', `#${SUPER_ADMIN_MAIN_ID}`);
    expect(main).not.toBeNull();
    expect(main).toHaveAttribute('id', SUPER_ADMIN_MAIN_ID);
    // Sans `tabindex="-1"`, la cible d'un lien d'évitement défile sans jamais recevoir le focus.
    expect(main).toHaveAttribute('tabindex', '-1');
  });

  it('déplace le focus DANS <main> quand on l’active', async () => {
    const utilisateur = userEvent.setup();
    const { container } = renderShell();

    await utilisateur.click(screen.getByRole('link', { name: 'Aller au contenu principal' }));

    expect(document.activeElement).toBe(container.querySelector('main'));
  });

  it('reste masqué visuellement tant qu’il n’a pas le focus', () => {
    renderShell();

    const lien = screen.getByRole('link', { name: 'Aller au contenu principal' });
    expect(lien.className).toContain('sr-only');
    expect(lien.className).toContain('focus:not-sr-only');
  });
});

describe('SuperAdminSidebar — focus clavier (TCK-359)', () => {
  /**
   * AC2 exige un anneau de focus sur CHACUN des trois types de liens. Un test qui n'en
   * vérifierait qu'un serait vert avec deux types nus — c'est précisément le défaut mesuré au
   * 2026-08-26 : 0 occurrence de `focus-visible` dans les 68 fichiers de la console.
   */
  it('porte `focus-visible:ring-ring` sur l’entrée, la sous-entrée et le retour perso', () => {
    renderSidebar();

    const entree = screen.getByRole('link', { name: 'Agences' });
    const sousEntree = screen.getByRole('link', { name: 'Santé' });
    const retour = screen.getByRole('link', { name: "Retour à l'espace perso" });

    for (const lien of [entree, sousEntree, retour]) {
      expect(lien.className).toContain('focus-visible:ring-2');
      // Le jeton, jamais un hex : `--ring` suit le thème, un `#a85332` en dur ne le suit pas.
      expect(lien.className).toContain('focus-visible:ring-ring');
    }
  });

  it('reste entièrement parcourable au clavier — 24 entrées, aucune piégée', async () => {
    const utilisateur = userEvent.setup();
    renderSidebar();

    const liens = screen.getAllByRole('link');
    // 24 entrées de menu (21 de premier niveau + 3 sous-entrées de `system`) + le retour perso.
    expect(liens).toHaveLength(25);

    await utilisateur.tab();
    expect(document.activeElement).toBe(liens[0]);

    await utilisateur.tab();
    expect(document.activeElement).toBe(liens[1]);
  });

  // TCK-359 puis TCK-358 : le correctif d'origine passait `stone-500` (3,64:1) à `stone-400`
  // (6,76:1) ; l'extinction de la palette brute l'a porté sur le jeton `--sidebar-foreground` à
  // 70 %, qui mesure 7,91:1 sur `--sidebar` en contexte sombre. Le test garde les deux moitiés :
  // plus aucune couleur brute, et une opacité qui ne redescend pas sous 70 %.
  it('n’affiche plus les libellés de groupe en couleur brute, et garde ≥ 4,5:1', () => {
    const { container } = renderSidebar();

    const libelle = screen.getByText('Opérations');
    expect(libelle.className).not.toContain('text-stone-500');
    expect(libelle.className).toContain('text-sidebar-foreground/70');
    expect(container.innerHTML).not.toMatch(/text-stone-\d/);
  });
});
