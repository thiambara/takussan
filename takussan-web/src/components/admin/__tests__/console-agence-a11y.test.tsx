/**
 * TCK-371 — accessibilité et petits écrans de la CONSOLE AGENCE.
 *
 * ## Ce que ces tests gardent, et ce qu'ils NE peuvent pas garder
 *
 * jsdom n'a **aucun moteur de mise en page** : `offsetWidth`, `scrollWidth` et
 * `getBoundingClientRect()` y valent 0. Aucun test de ce fichier ne peut donc affirmer
 * « à 375 px, ça défile » — une assertion qui le prétendrait serait verte pour la
 * mauvaise raison, et resterait verte après la régression. (Le défilement réel a été
 * mesuré une fois dans Chrome à 375×812 par la revue de ce ticket ; ce qui suit garde
 * l'invariant qui le rend possible, pour les fois d'après.)
 *
 * Ce qui EST gardé, et qui est exactement ce qui avait cassé : **l'INVARIANT DE
 * STRUCTURE** qui rend le défilement possible. En remontant depuis le déclencheur du
 * menu d'actions vers la racine du composant, on doit rencontrer un conteneur qui
 * DÉFILE **AVANT** tout conteneur qui ROGNE. Les deux moitiés comptent :
 *
 *   - le défilant en premier → la colonne de droite reste ATTEIGNABLE (AC2/AC3) ;
 *   - le rognant au-dessus   → le débordement est ENCAPSULÉ, donc le corps de la
 *     page ne défile pas horizontalement (seconde moitié d'AC2).
 *
 * ⚠ **« Défile » est une PROPRIÉTÉ CSS, pas une liste de quatre littéraux.** La version
 * précédente de `coupureHorizontale()` ne reconnaissait que `overflow-x-auto`,
 * `overflow-x-scroll`, `overflow-hidden` et `overflow-x-hidden` : remplacer `overflow-x-auto`
 * par `overflow-auto` dans `ui/table.tsx` — un changement fonctionnellement ÉQUIVALENT — faisait
 * rougir AC2 ET AC3. Un faux rouge sur une primitive partagée par 17 consommateurs est un piège
 * de maintenance, pas une garde : la réponse humaine à un rouge injuste est de désarmer le test.
 * Le modèle ci-dessous lit la valeur de l'axe, quelle que soit l'écriture, `style=` compris.
 *
 * ## AC4 — l'anneau de focus est MESURÉ, et il l'est sur TOUS les éléments écrits à la main
 *
 * Les anneaux ajoutés par ce ticket n'étaient gardés nulle part : 13 des 17 pouvaient être
 * retirés sans un seul rouge. Un `git revert` partiel, un conflit de fusion mal résolu — et
 * trois tickets de la même vague touchent ces fichiers — ou un `cn()` réordonné les auraient
 * effacés en silence.
 *
 * La règle éprouvée ici est structurelle, donc elle vaut aussi pour le code neuf : **tout
 * élément interactif ÉCRIT À LA MAIN (sans `data-slot`, donc hors primitive `ui/`) déclare son
 * propre anneau, à opacité PLEINE, et cet anneau mesure ≥ 3:1 sur chacun des fonds que
 * l'élément peut avoir** — `hover:` et état sélectionné compris. Les primitives `ui/` sont hors
 * périmètre : leur idiome (`focus-visible:ring-ring/50` de `ui/button.tsx`) est monté site-wide
 * et se corrige une fois, ailleurs.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import {
  SEUIL_NON_TEXTUEL,
  anneauDeFocus,
  composer,
  contraste,
  fmt,
  fondsPossibles,
  versRvb,
} from '@/test/contraste-wcag';
import { AdminUsersTable } from '../users/AdminUsersTable';
import { OverduePaymentsTable } from '../finances/OverduePaymentsTable';
import { AuditTrail } from '../AuditTrail';
import { ModerationQueueList } from '../ModerationQueueList';
import { PropertyModerationQueueList } from '../PropertyModerationQueueList';
import { AgencyRolesList } from '../roles/AgencyRolesList';
import { CapabilityMatrix } from '../roles/CapabilityMatrix';
import type { AdminAgencyUserRow } from '@/types/admin-users';
import type { AgencyRole, CapabilityCatalogue } from '@/types/agency-role';
import type { ModerationReview } from '@/lib/queries/reviews-moderation';
import type { ModerationProperty } from '@/lib/queries/property-moderation';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}));

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ add: vi.fn() }),
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

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * Le modèle d'`overflow` — une PROPRIÉTÉ, lue quelle que soit l'écriture
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

type Coupure = 'defile' | 'rogne';
type ValeurOverflow = 'visible' | 'auto' | 'scroll' | 'hidden' | 'clip';

const VALEURS: ReadonlySet<string> = new Set(['visible', 'auto', 'scroll', 'hidden', 'clip']);

/**
 * Valeur d'`overflow-x` **calculée** pour un élément, selon la source qui la pose :
 * `style=` d'abord (elle l'emporte sur les classes), puis les utilitaires Tailwind.
 *
 * ⚠ CSS Overflow 3 §3 : quand un axe vaut `visible` et l'AUTRE non, le premier calcule `auto`.
 * `overflow-y-auto` rend donc l'axe horizontal défilant — c'est ce que le `<nav>` de la barre et
 * les listes de modération font, et c'est ce que la version littérale de cet helper ignorait.
 */
function overflowHorizontal(element: HTMLElement): ValeurOverflow {
  const enLigne = element.style.overflowX || element.style.overflow;
  if (enLigne && VALEURS.has(enLigne)) return enLigne as ValeurOverflow;

  let x: ValeurOverflow | null = null;
  let y: ValeurOverflow | null = null;
  for (const classe of Array.from(element.classList)) {
    const m = /^overflow(-[xy])?-([a-z]+)$/.exec(classe);
    if (!m || !VALEURS.has(m[2])) continue;
    const valeur = m[2] as ValeurOverflow;
    if (m[1] === '-y') y = valeur;
    else { x = valeur; if (m[1] === undefined) y = valeur; }
  }
  if (x !== null && x !== 'visible') return x;
  // L'axe X est `visible` (ou absent) : il calcule `auto` dès que l'axe Y ne l'est pas.
  if (y !== null && y !== 'visible') return 'auto';
  return x ?? 'visible';
}

function coupure(element: HTMLElement): Coupure | null {
  const valeur = overflowHorizontal(element);
  if (valeur === 'auto' || valeur === 'scroll') return 'defile';
  if (valeur === 'hidden' || valeur === 'clip') return 'rogne';
  return null;
}

/** Toutes les coupures horizontales entre `depart` (exclu) et `racine` (inclus), du plus proche. */
function coupuresHorizontales(depart: HTMLElement, racine: HTMLElement): Coupure[] {
  const trouvees: Coupure[] = [];
  let noeud = depart.parentElement;
  while (noeud) {
    const mode = coupure(noeud);
    if (mode) trouvees.push(mode);
    if (noeud === racine) break;
    noeud = noeud.parentElement;
  }
  return trouvees;
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * AC2 / AC3 — l'invariant de structure
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

function rendreMembres() {
  return render(
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
}

describe('AC2 — /admin/team : le menu d’actions de la dernière colonne reste atteignable', () => {
  it('rend le déclencheur du menu d’actions, nommé, pour chaque ligne', () => {
    const { container } = rendreMembres();

    // Le défaut d'origine coupait la colonne de droite SANS défilement : le menu était
    // rendu mais hors d'atteinte. Sa présence nommée est le plancher, pas la preuve —
    // c'est l'invariant de structure ci-dessous qui porte l'AC.
    const declencheur = screen.getByRole('button', { name: 'Actions pour Awa Diop' });
    expect(declencheur).toBeInTheDocument();
    expect(container).toContainElement(declencheur);
  });

  it('encapsule le défilement : un conteneur défilant AVANT tout conteneur rognant', () => {
    const { container } = rendreMembres();

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

describe('l’invariant se lit sur la PROPRIÉTÉ, pas sur l’écriture', () => {
  /**
   * Le faux rouge que ce modèle ferme : `overflow-auto` défile aussi, `overflow-clip` rogne aussi,
   * et un `style="overflow-x: auto"` compte autant qu'une classe. Sans cela, réécrire
   * `ui/table.tsx` — primitive montée par les trois consoles — à l'identique fonctionnellement
   * faisait rougir deux AC.
   */
  it.each([
    ['overflow-x-auto', 'defile'],
    ['overflow-auto', 'defile'],
    ['overflow-x-scroll', 'defile'],
    ['overflow-scroll', 'defile'],
    ['overflow-y-auto', 'defile'], // CSS Overflow 3 §3 : l'axe X calcule `auto`
    ['overflow-hidden', 'rogne'],
    ['overflow-x-hidden', 'rogne'],
    ['overflow-clip', 'rogne'],
    ['overflow-x-clip', 'rogne'],
    ['overflow-visible', null],
    ['overflow-ellipsis', null], // pas un utilitaire d'overflow de boîte
  ])('%s → %s', (classe, attendu) => {
    const element = document.createElement('div');
    element.className = classe;
    expect(coupure(element)).toBe(attendu);
  });

  it('lit aussi un `overflow` posé par `style=`, que les classes ne montrent pas', () => {
    const element = document.createElement('div');
    element.style.overflowX = 'auto';
    expect(coupure(element)).toBe('defile');
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * AC4 — l'anneau de focus, MESURÉ, sur tout élément interactif écrit à la main
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/** Interactifs ÉCRITS À LA MAIN : les primitives `ui/` portent un `data-slot` et sont exclues. */
function interactifsEcritsALaMain(racine: HTMLElement): HTMLElement[] {
  return Array.from(
    racine.querySelectorAll<HTMLElement>('a[href], button, [tabindex]:not([tabindex="-1"])'),
  ).filter((el) => !el.hasAttribute('data-slot') && !el.closest('[data-slot="button"]'));
}

/**
 * Le cœur de la garde. Pour chaque interactif écrit à la main : anneau déclaré, à opacité pleine,
 * et ≥ 3:1 sur CHAQUE fond que l'élément peut avoir.
 *
 * `attendus` est un plancher de COMPTE : sans lui, un composant qui cesserait de rendre ses
 * boutons rendrait ce test vert par vacuité — le défaut classique d'une boucle sans témoin.
 */
function mesureLesAnneaux(racine: HTMLElement, attendus: number) {
  const elements = interactifsEcritsALaMain(racine);
  expect(
    elements.length,
    `${elements.length} élément(s) interactif(s) écrit(s) à la main, ${attendus} attendu(s) au `
    + 'minimum — le composant a-t-il cessé de les rendre ?',
  ).toBeGreaterThanOrEqual(attendus);

  for (const element of elements) {
    const nom = element.getAttribute('aria-label')
      ?? element.textContent?.trim().slice(0, 40)
      ?? element.outerHTML.slice(0, 60);

    const anneau = anneauDeFocus(element);
    expect(anneau, `« ${nom} » ne déclare aucun \`focus-visible:outline-<couleur>\``).not.toBeNull();
    // `outline-2` rend `outline-style: solid` : sans lui, `outline: auto` du navigateur garde la
    // main et `outline-color` n'est jamais appliqué — la couleur mesurée ne servirait à rien.
    expect(element.className, `« ${nom} » : anneau sans largeur`).toMatch(/focus-visible:outline-2\b/);
    // La règle globale `* { outline-ring/50 }` mesure 2,12:1 sur `--card`. Le jeton doit être PLEIN.
    expect(anneau!.alpha, `« ${nom} » : anneau à ${anneau!.alpha * 100} %`).toBe(1);

    for (const fond of fondsPossibles(element)) {
      const ratio = contraste(
        composer(versRvb(anneau!.hex), versRvb(fond.hex), anneau!.alpha),
        fond.hex,
      );
      expect(
        ratio,
        `« ${nom} » — ${anneau!.classe} sur ${fond.hex} (${fond.etat}, ${fond.provenance}) `
        + `= ${fmt(ratio)}`,
      ).toBeGreaterThanOrEqual(SEUIL_NON_TEXTUEL);
    }
  }
}

const CATALOGUE: CapabilityCatalogue = {
  domains: [
    { domain: 'properties', capabilities: ['properties.view', 'properties.create'] },
    { domain: 'bookings', capabilities: ['bookings.view'] },
  ],
  total: 3,
  platform_reserved: ['properties.moderate'],
};

const ROLES: AgencyRole[] = [
  {
    id: 1,
    agency_id: 1,
    name: 'Agent senior',
    base_profile_type: 'agent',
    description: null,
    is_system: false,
    is_clonable: true,
    capabilities: ['properties.view'],
    profiles_count: 2,
  },
  {
    id: 2,
    agency_id: 1,
    name: 'Administrateur',
    base_profile_type: 'agency_admin',
    description: null,
    is_system: true,
    is_clonable: true,
    capabilities: [],
    profiles_count: 1,
  },
];

const AVIS: ModerationReview[] = [
  {
    id: 5,
    rating: 4,
    title: 'Bon séjour',
    content: 'Tout allait bien.',
    author: { id: 9, name: 'Awa Diop', avatar_url: null },
    reviewable_type: 'property',
    reviewable_id: 3,
    status: 'pending',
    is_approved: false,
    reported_count: 0,
    created_at: '2026-08-01T00:00:00+00:00',
  },
  {
    id: 6,
    rating: 2,
    title: 'Moyen',
    content: null,
    author: { id: 10, name: 'Modou Fall', avatar_url: null },
    reviewable_type: 'property',
    reviewable_id: 4,
    status: 'reported',
    is_approved: false,
    reported_count: 3,
    created_at: '2026-08-02T00:00:00+00:00',
  },
];

const ANNONCES: ModerationProperty[] = [
  {
    id: 11,
    reference_number: 'REF-11',
    title: 'Villa aux Almadies',
    slug: 'villa-almadies',
    status: 'pending',
    main_photo_url: null,
    price: 250000,
    currency: 'XOF',
    type: 'villa',
    submitted_at: '2026-08-01T00:00:00+00:00',
    rejection_reason: null,
    owner: { id: 3, name: 'Awa Diop', avatar_url: null },
    agency: { id: 1, name: 'Takussan' },
    location: { city: 'Dakar', region: 'Dakar', country: 'SN' },
  },
];

function avecQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>));
}

describe('AC4 — anneau de focus : mesuré sur chaque écran de la console agence', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [],
        meta: { total: 0, current_page: 1, last_page: 1, per_page: 20 },
      }),
      text: async () => '',
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('/admin/team — en-têtes de tri, lien mailto, cellule « Membre »', () => {
    const { container } = rendreMembres();
    // 3 en-têtes triables + le lien mailto + le bouton « Membre » au minimum.
    mesureLesAnneaux(container, 5);
  });

  it('/admin/finances — lien de la dernière colonne du tableau des impayés', async () => {
    // Une ligne, sinon le tableau ne rend que son état vide et la boucle serait verte par vacuité.
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{
          id: 7, source: 'lease', reference_number: 'PAY-7', amount: 120000,
          remaining_amount: 120000, currency: 'XOF', date: '2026-08-01', due_date: '2026-08-01',
          period_start: null, status: 'late', lease_id: 3, booking_id: null,
        }],
        meta: { total: 1, current_page: 1, last_page: 1, per_page: 20 },
      }),
      text: async () => '',
    }));

    const { container } = avecQuery(<OverduePaymentsTable />);
    await waitFor(() => expect(container.querySelector('table')).not.toBeNull());
    mesureLesAnneaux(container, 1);
  });

  it('/admin/roles — matrice de capacités : « tout cocher », « vider », repli par domaine', () => {
    const { container } = render(
      withIntl(<CapabilityMatrix catalogue={CATALOGUE} value={[]} onChange={vi.fn()} />),
    );
    // 2 boutons de masse + 1 repli par domaine (2 domaines) = 4.
    mesureLesAnneaux(container, 4);
  });

  it('/admin/roles — liste des rôles : le bouton de sélection de chaque rôle', () => {
    const { container } = render(
      withIntl(
        <AgencyRolesList
          roles={ROLES}
          selectedId={ROLES[0].id}
          onSelect={vi.fn()}
          onClone={vi.fn()}
          onDelete={vi.fn()}
          canCreate
          canDelete
        />,
      ),
    );
    // Un par rôle — dont le SÉLECTIONNÉ, dont le conteneur peint `bg-primary/5`.
    mesureLesAnneaux(container, 2);
  });

  it('/admin/moderation — file des avis, entrée sélectionnée comprise', () => {
    const { container } = render(
      withIntl(
        <ModerationQueueList reviews={AVIS} selectedId={AVIS[0].id} onSelect={vi.fn()} />,
      ),
    );
    mesureLesAnneaux(container, 2);
  });

  it('/admin/moderation/properties — file des annonces', () => {
    const { container } = render(
      withIntl(
        <PropertyModerationQueueList
          properties={ANNONCES}
          selectedId={ANNONCES[0].id}
          onSelect={vi.fn()}
        />,
      ),
    );
    mesureLesAnneaux(container, 1);
  });

  it('/admin/audit — les deux entrées du menu d’export, une fois le menu ouvert', async () => {
    const { container } = avecQuery(<AuditTrail />);

    // Le menu est conditionnel : sans ce clic, ses deux boutons ne sont pas dans le DOM et la
    // boucle serait verte par vacuité. C'est exactement ce que le plancher de compte refuse.
    const declencheur = await waitFor(() => screen.getByRole('button', { name: /Exporter/i }));
    declencheur.click();

    const menu = await waitFor(() => {
      const boutons = Array.from(container.querySelectorAll<HTMLElement>('button'))
        .filter((b) => b.textContent === 'CSV' || b.textContent?.startsWith('Excel'));
      expect(boutons).toHaveLength(2);
      return boutons[0].parentElement as HTMLElement;
    });

    mesureLesAnneaux(menu, 2);
  });
});
