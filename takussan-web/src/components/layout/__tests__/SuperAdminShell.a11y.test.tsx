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
import { NAV_GROUPS, SuperAdminSidebar } from '../SuperAdminSidebar';

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

  /**
   * TCK-359, revue adverse — CE TEST EXISTE PARCE QUE DEUX ABLATIONS RESTAIENT VERTES.
   *
   * Les deux assertions ci-dessus (`sr-only` / `focus:not-sr-only`) gardent la VISIBILITÉ du lien,
   * et rien d'autre. Mesuré : on pouvait supprimer l'intégralité de son anneau de focus, ou
   * l'intégralité de son positionnement, sans faire rougir un seul des 7 tests — c'est-à-dire
   * régresser exactement le défaut que ce ticket corrige ailleurs, tout en cochant AC3.
   *
   * Les deux moitiés sont donc gardées classe par classe, et pas par une sous-chaîne qui
   * survivrait à la disparition de la moitié des utilitaires :
   *
   *   (a) l'anneau — un lien d'évitement sans indicateur de focus est un lien d'évitement qu'on
   *       atteint sans le voir. `--ring` (#a85332) sur le `--muted` du shell mesure 4,51:1,
   *       au-dessus du seuil 3 de SC 1.4.11 (mesuré le 2026-08-27).
   *   (b) le positionnement — au focus, `focus:not-sr-only` rend au lien ses dimensions. Sans
   *       `focus:absolute`, il redevient un élément de FLUX dans un `h-screen flex-col` : la
   *       topbar et le `<main>` se décalent vers le bas à la première tabulation. Sans
   *       `focus:z-50`, il passe sous l'`ImpersonationBanner`.
   */
  it('garde son anneau de focus ET son positionnement flottant', () => {
    renderShell();

    const classes = screen
      .getByRole('link', { name: 'Aller au contenu principal' })
      .className.split(/\s+/);

    // (a) l'affordance de focus, jeton compris — un hex en dur ne suivrait pas le thème.
    for (const classe of ['focus:outline-none', 'focus:ring-2', 'focus:ring-ring']) {
      expect(classes).toContain(classe);
    }
    // (b) le retrait du flux, sinon le focus pousse tout le shell.
    for (const classe of ['focus:absolute', 'focus:left-4', 'focus:top-4', 'focus:z-50']) {
      expect(classes).toContain(classe);
    }
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

  it('reste entièrement parcourable au clavier — toutes les entrées, aucune piégée', async () => {
    const utilisateur = userEvent.setup();
    renderSidebar();

    // Le compte est DÉRIVÉ de la table de navigation, jamais écrit en dur : la version figée
    // (« 25 ») est devenue rouge quand TCK-365 a ajouté l'entrée « jobs échoués », c'est-à-dire
    // sur un ajout légitime que ce test n'a aucune raison de refuser. Ce qu'il garde est que
    // CHAQUE entrée déclarée est rendue en lien, et qu'aucune n'est piégée hors du parcours.
    const attendu =
      NAV_GROUPS.reduce(
        (n, groupe) =>
          n + groupe.items.reduce((m, item) => m + 1 + (item.children?.length ?? 0), 0),
        0,
      ) + 1; // + le lien « retour à l'espace perso »

    const liens = screen.getAllByRole('link');
    expect(liens).toHaveLength(attendu);

    await utilisateur.tab();
    expect(document.activeElement).toBe(liens[0]);

    await utilisateur.tab();
    expect(document.activeElement).toBe(liens[1]);
  });

  // TCK-359 puis TCK-358 : le correctif d'origine passait `stone-500` (3,64:1) à `stone-400`
  // (6,76:1) ; l'extinction de la palette brute l'a porté sur le jeton `--sidebar-foreground` à
  // 70 %, qui mesure 8,08:1 sur `--sidebar` en contexte sombre. Le test garde les deux moitiés :
  // plus aucune couleur brute, et une opacité qui ne redescend pas sous 70 %.
  it('n’affiche plus les libellés de groupe en couleur brute, et garde ≥ 4,5:1', () => {
    const { container } = renderSidebar();

    const libelle = screen.getByText('Opérations');
    expect(libelle.className).not.toContain('text-stone-500');
    expect(libelle.className).toContain('text-sidebar-foreground/70');
    expect(container.innerHTML).not.toMatch(/text-stone-\d/);
  });
});

describe('SuperAdminSidebar — l’anneau de focus sur l’entrée ACTIVE (TCK-359)', () => {
  /**
   * Revue adverse : en contexte `dark`, `--ring` et `--sidebar-primary` sont le MÊME octet
   * (#c87a52). L'entrée active étant une pastille pleine `bg-sidebar-primary` (choix TCK-358), la
   * focaliser peignait un anneau de la couleur exacte de la pastille — **1,00:1**. C'est la
   * première entrée qu'atteint un utilisateur clavier (`aria-current="page"`), et l'état
   * « actif + focalisé » ne se lisait pas comme un focus : la pastille grossissait de 2 px.
   *
   * Le liseré `ring-offset-sidebar` de 2 px rétablit 4,83:1 des deux côtés (liseré/pastille et
   * anneau/liseré), mesuré le 2026-08-27. Il est gardé ici parce qu'aucune assertion sur
   * `ring-ring` ne peut le voir : les deux jetons rendent la même couleur.
   */
  it('pose un liseré d’offset sur l’entrée active, sans quoi l’anneau se confond avec la pastille', () => {
    const { container } = renderSidebar();

    const active = container.querySelector<HTMLElement>('[aria-current="page"]');
    expect(active).not.toBeNull();
    expect(active!.className).toContain('bg-sidebar-primary');

    const classes = active!.className.split(/\s+/);
    expect(classes).toContain('focus-visible:ring-offset-2');
    // Le jeton du FOND de la barre, pas une couleur en dur : la garde de TCK-358 refuse les deux
    // autres formes, et `ring-offset-2` seul retomberait sur le blanc par défaut de Tailwind.
    expect(classes).toContain('focus-visible:ring-offset-sidebar');
  });

  it('pose le même liseré sur les trois types de liens', () => {
    renderSidebar();

    const entree = screen.getByRole('link', { name: 'Agences' });
    const sousEntree = screen.getByRole('link', { name: 'Santé' });
    const retour = screen.getByRole('link', { name: "Retour à l'espace perso" });

    for (const lien of [entree, sousEntree, retour]) {
      const classes = lien.className.split(/\s+/);
      expect(classes).toContain('focus-visible:ring-offset-2');
      expect(classes).toContain('focus-visible:ring-offset-sidebar');
    }
  });
});

describe('SuperAdminTopbar — focus clavier (TCK-359)', () => {
  /**
   * Revue adverse : `grep -c focus-visible SuperAdminTopbar.tsx` rendait **0**. AC2 ne nomme que
   * la barre latérale, mais l'objectif utilisateur du ticket porte sur le SHELL — et le bouton de
   * menu est le premier focalisable après le lien d'évitement en viewport mobile. Sur le
   * `--background` sombre de la barre (#1f1812), le contour par défaut du navigateur est le même
   * quasi-rien qui a motivé le ticket pour la barre latérale.
   *
   * `--ring` (#c87a52) sur ce fond mesure 5,31:1 (seuil 3, SC 1.4.11), mesuré le 2026-08-27.
   * Pas de `ring-offset` ici : rien dans cette barre n'est rempli de `--primary`, l'anneau ne peut
   * donc pas se confondre avec ce qu'il entoure.
   */
  it('porte un anneau `focus-visible:ring-ring` sur le bouton de menu et sur le lien de marque', () => {
    renderShell();

    const boutonMenu = screen.getByRole('button', { name: 'Ouvrir le menu' });
    const marque = screen.getByRole('link', { name: 'Takussan · Console' });

    for (const cible of [boutonMenu, marque]) {
      const classes = cible.className.split(/\s+/);
      expect(classes).toContain('focus-visible:outline-none');
      expect(classes).toContain('focus-visible:ring-2');
      expect(classes).toContain('focus-visible:ring-ring');
    }
  });
});
