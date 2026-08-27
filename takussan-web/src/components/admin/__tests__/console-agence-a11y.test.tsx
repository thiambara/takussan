/**
 * TCK-371 — accessibilité et petits écrans de la CONSOLE AGENCE.
 *
 * ## Ce que ces tests gardent, et ce qu'ils NE peuvent pas garder
 *
 * jsdom n'a **aucun moteur de mise en page** : `offsetWidth`, `scrollWidth` et
 * `getBoundingClientRect()` y valent 0. Aucun test de ce fichier ne peut donc affirmer
 * « à 375 px, ça défile » — une assertion qui le prétendrait serait verte pour la
 * mauvaise raison, et resterait verte après la régression.
 *
 * Ce qui EST gardé, et qui est exactement ce qui avait cassé : **l'INVARIANT DE
 * STRUCTURE** qui rend le défilement possible. En remontant depuis le déclencheur du
 * menu d'actions vers la racine du composant, on doit rencontrer un conteneur
 * `overflow-x-auto` **AVANT** tout `overflow-hidden`. Les deux moitiés comptent :
 *
 *   - `overflow-x-auto` en premier → la colonne de droite reste ATTEIGNABLE (AC2/AC3) ;
 *   - `overflow-hidden` au-dessus  → le débordement est ENCAPSULÉ, donc le corps de la
 *     page ne défile pas horizontalement (seconde moitié d'AC2).
 *
 * Un `overflow-hidden` rencontré en premier, c'est le défaut d'origine du ticket ;
 * l'absence totale d'`overflow-hidden` au-dessus, c'est le défaut inverse — la page qui
 * défile. Les deux rougissent ici.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { AdminUsersTable } from '../users/AdminUsersTable';
import { OverduePaymentsTable } from '../finances/OverduePaymentsTable';
import type { AdminAgencyUserRow } from '@/types/admin-users';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

const LIGNES: AdminAgencyUserRow[] = [
  {
    id: 12,
    first_name: 'Awa',
    last_name: 'Diop',
    email: 'awa@example.test',
    phone: null,
    status: 'active',
    last_login_at: '2026-08-01T00:00:00+00:00',
    created_at: '2026-01-01T00:00:00+00:00',
    roles: ['agent'],
  },
];

/**
 * Remonte la chaîne des ancêtres de `depart` (exclu) jusqu'à `racine` (inclus) et rend le
 * PREMIER ancêtre qui coupe l'axe horizontal, avec la façon dont il le coupe.
 *
 * `overflow-y-auto` compte comme une coupure : dès qu'un axe n'est pas `visible`, l'autre
 * calcule `auto` (CSS Overflow 3 §3). On lit les CLASSES et non `getComputedStyle`, parce
 * que jsdom ne charge pas la feuille Tailwind — la classe EST la source ici.
 */
function premiereCoupureHorizontale(
  depart: HTMLElement,
  racine: HTMLElement,
): { element: HTMLElement; mode: 'defile' | 'rogne' } | null {
  let noeud = depart.parentElement;
  while (noeud) {
    const classes = noeud.className.split(/\s+/);
    if (classes.includes('overflow-x-auto') || classes.includes('overflow-x-scroll')) {
      return { element: noeud, mode: 'defile' };
    }
    if (classes.includes('overflow-hidden') || classes.includes('overflow-x-hidden')) {
      return { element: noeud, mode: 'rogne' };
    }
    if (noeud === racine) return null;
    noeud = noeud.parentElement;
  }
  return null;
}

/** Tous les ancêtres coupant l'axe horizontal, du plus proche à la racine. */
function coupuresHorizontales(depart: HTMLElement, racine: HTMLElement) {
  const trouvees: Array<'defile' | 'rogne'> = [];
  let courant: HTMLElement = depart;
  for (;;) {
    const coupure = premiereCoupureHorizontale(courant, racine);
    if (!coupure) return trouvees;
    trouvees.push(coupure.mode);
    if (coupure.element === racine) return trouvees;
    courant = coupure.element;
  }
}

describe('AC2 — /admin/team : le menu d’actions de la dernière colonne reste atteignable', () => {
  it('rend le déclencheur du menu d’actions, nommé, pour chaque ligne', () => {
    const { container } = render(
      withIntl(
        <AdminUsersTable
          rows={LIGNES}
          total={1}
          currentUserId={99}
          onSelect={vi.fn()}
          onQuickAction={vi.fn()}
        />,
      ),
    );

    // Le défaut d'origine coupait la colonne de droite SANS défilement : le menu était
    // rendu mais hors d'atteinte. Sa présence nommée est le plancher, pas la preuve —
    // c'est l'invariant de structure ci-dessous qui porte l'AC.
    const declencheur = screen.getByRole('button', { name: 'Actions pour Awa Diop' });
    expect(declencheur).toBeInTheDocument();
    expect(container).toContainElement(declencheur);
  });

  it('encapsule le défilement : un conteneur défilant AVANT tout conteneur rognant', () => {
    const { container } = render(
      withIntl(
        <AdminUsersTable
          rows={LIGNES}
          total={1}
          currentUserId={99}
          onSelect={vi.fn()}
          onQuickAction={vi.fn()}
        />,
      ),
    );

    const declencheur = screen.getByRole('button', { name: 'Actions pour Awa Diop' });
    const racine = container.firstElementChild as HTMLElement;

    const coupures = coupuresHorizontales(declencheur, racine);

    // La colonne d'actions est ATTEIGNABLE : la première coupure défile.
    expect(coupures[0]).toBe('defile');
    // Et le débordement est ENCAPSULÉ : quelque chose rogne au-dessus, donc le corps de
    // la page ne défile pas.
    expect(coupures).toContain('rogne');
  });
});

describe('AC3 — tableau des impayés : même invariant', () => {
  function rendreImpayes() {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          {
            id: 7,
            source: 'lease',
            reference_number: 'PAY-7',
            amount: 120000,
            remaining_amount: 120000,
            currency: 'XOF',
            date: '2026-08-01',
            due_date: '2026-08-01',
            period_start: null,
            status: 'late',
            lease_id: 3,
            booking_id: null,
          },
        ],
        meta: { total: 1, current_page: 1, last_page: 1, per_page: 20 },
      }),
      text: async () => '',
    }));

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      withIntl(
        <QueryClientProvider client={queryClient}>
          <OverduePaymentsTable />
        </QueryClientProvider>,
      ),
    );
  }

  it('encapsule le défilement autour de la dernière colonne', async () => {
    const { container } = rendreImpayes();

    const lien = await waitFor(() => screen.getByRole('link', { name: /3/ }));
    const racine = container.firstElementChild as HTMLElement;

    const coupures = coupuresHorizontales(lien, racine);

    expect(coupures[0]).toBe('defile');
    expect(coupures).toContain('rogne');
  });
});

describe('AC4 — anneau de focus sur les éléments interactifs écrits à la main', () => {
  /**
   * `outline-ring` rend `outline-color: var(--ring)` à PLEINE opacité, et `outline-2` rend
   * `outline-style: solid` — ce dernier point compte : il écrase l'`outline: auto` du
   * navigateur, sans quoi la couleur mesurée ne s'appliquerait pas.
   *
   * ⚠ On n'accepte PAS `focus-visible:outline-ring/50` : le jeton à 50 % mesure 2,12:1 sur
   * `--card` et 1,73:1 sur le fond de la barre — sous les 3:1 de WCAG 1.4.11. C'est
   * l'idiome de la primitive `Button`, et c'est précisément pourquoi il ne se recopie pas
   * ici.
   */
  const ANNEAU = /focus-visible:outline-2/;
  const COULEUR = /focus-visible:outline-ring(?!\/)/;

  it('l’en-tête de tri — bouton écrit à la main dans la primitive DataTable — porte l’anneau', () => {
    render(
      withIntl(
        <AdminUsersTable
          rows={LIGNES}
          total={1}
          currentUserId={99}
          onSelect={vi.fn()}
          onQuickAction={vi.fn()}
        />,
      ),
    );

    // Les en-têtes triables sont les seuls `<button>` dans un `<th>`.
    const entetes = Array.from(document.querySelectorAll('th button')) as HTMLElement[];
    expect(entetes.length).toBeGreaterThan(0);
    for (const entete of entetes) {
      expect(entete.className).toMatch(ANNEAU);
      expect(entete.className).toMatch(COULEUR);
    }
  });

  it('le lien mailto de la colonne « E-mail » porte l’anneau', () => {
    render(
      withIntl(
        <AdminUsersTable
          rows={LIGNES}
          total={1}
          currentUserId={99}
          onSelect={vi.fn()}
          onQuickAction={vi.fn()}
        />,
      ),
    );

    const lien = screen.getByRole('link', { name: 'awa@example.test' });
    expect(lien.className).toMatch(ANNEAU);
    expect(lien.className).toMatch(COULEUR);
  });

  it('le bouton « Membre » porte l’anneau', () => {
    render(
      withIntl(
        <AdminUsersTable
          rows={LIGNES}
          total={1}
          currentUserId={99}
          onSelect={vi.fn()}
          onQuickAction={vi.fn()}
        />,
      ),
    );

    // Le bouton de la cellule « Membre » — celui qui ouvre le tiroir de détail.
    const boutons = Array.from(document.querySelectorAll('td button')) as HTMLElement[];
    const membre = boutons.find((b) => b.textContent?.includes('Awa'));
    expect(membre).toBeDefined();
    expect(membre!.className).toMatch(ANNEAU);
    expect(membre!.className).toMatch(COULEUR);
  });
});
