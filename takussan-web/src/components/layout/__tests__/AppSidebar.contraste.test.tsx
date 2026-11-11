/**
 * TCK-2490 (AC4, ADR-0090 §1) — les contrastes de la colonne « Atelier », MESURÉS sur les jetons, en clair
 * ET en sombre (patron d'`AppTopbar.a11y.test.tsx`, harnais `@/test/contraste-wcag`).
 *
 * La colonne pose ses textes sur des voiles : le lin (`--muted` à 45 % sur `--background`), puis le voile
 * d'encre du survol (5 %) ou de l'entrée active (8 %). Un ratio pris sur la couleur nominale ne dit rien ;
 * ce fichier compose chaque couche, de la page jusqu'au texte, à partir des CLASSES RENDUES :
 *
 * - toute classe `bg-*` sans variante d'un ancêtre (ou du texte lui-même) est une couche au repos ;
 * - toute classe `hover:bg-*` d'un ancêtre ajoute un état « survol », composé par-dessus ;
 * - la couleur du texte est sa classe `text-*` sans variante, composée à son alpha sur chaque fond.
 *
 * Les scénarios montent les états qui comptent : l'entrée ACTIVE porteuse d'un compteur (le pire fond
 * d'un compteur), « Aujourd'hui » chargé (puces primaire et neutre), la valeur des crédits, « Démarrer »,
 * « Aller à » et ses touches, les lignes cadenassées et les lignes de statut.
 *
 * Il ROUGIT sur un jeton trop pâle : remettre les compteurs en `text-primary` (4,10:1 en clair et 3,74:1 en
 * sombre sur l'entrée active) le fait échouer — ablation au rapport de TCK-2490.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import {
  JETONS_CLAIR,
  JETONS_SOMBRE,
  SEUIL_AA_TEXTE,
  SEUIL_NON_TEXTUEL,
  composer,
  contraste,
  fmt,
  litUtilitaireDeCouleur,
  resoudreCouleur,
  versHex,
  versRvb,
  type Rvb,
} from '@/test/contraste-wcag';
import { AccesAdminProvider } from '@/lib/access/acces-admin-contexte';
import { accesDepuis } from '@/lib/access/pages-admin';
import type { User, UserRole } from '@/types/user';
import type { ProfileType } from '@/types/profile';
import { AppSidebar } from '../AppSidebar';

const chemin = vi.hoisted(() => ({ courant: '/app' }));
vi.mock('next/navigation', () => ({
  usePathname: () => chemin.courant,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/hooks/useCan', () => ({
  useMyCapabilities: () => ({ data: { data: { agency_id: 7, capabilities: ['properties.create'] } } }),
}));
vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => ({ data: undefined, isLoading: false }),
  useSwitchActiveProfile: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/components/chat-widget/useUnreadCount', () => ({ useUnreadCount: () => 3 }));
vi.mock('@/lib/queries/visits', () => ({ usePendingVisitsCount: () => ({ data: { meta: { total: 2 } } }) }));
vi.mock('@/lib/queries/contact-leads', () => ({ useUnhandledLeadsCount: () => ({ data: { meta: { total: 1 } } }) }));
vi.mock('@/lib/queries/credits-solde', () => ({ useSoldeCredits: () => 1250 }));
vi.mock('@/lib/queries/demarrage-espace', () => ({
  useDemarrageDeLEspace: () => ({ data: { data: { etapes: [{ code: 'kyc', faite: false }, { code: 'premier_bien', faite: true }] } } }),
}));
vi.mock('@/lib/queries/reviews-moderation', () => ({ fetchModerationQueue: () => Promise.resolve({ meta: { total: 0 } }) }));
vi.mock('@/lib/queries/property-moderation', () => ({ fetchPropertyModerationQueue: () => Promise.resolve({ meta: { total: 0 } }) }));

const CAPACITES_ADMIN = ['agency.update_billing', 'agency.update_kyc', 'team.assign_role', 'payments.reconcile', 'reports.view_agency'];

interface Scenario {
  readonly roles: UserRole[];
  readonly typeProfilActif?: ProfileType;
  readonly agence: 'standard' | 'individual' | null;
  readonly agencyIsStandard?: boolean;
  readonly hasPendingUpgrade?: boolean;
  readonly chemin: string;
}

const SCENARIOS: Record<string, Scenario> = {
  // Messagerie ACTIVE (son compte est dans « Aujourd'hui », M3) ; « Aujourd'hui » chargé ; « Démarrer » ;
  // « Récents ».
  'agent sur la messagerie': { roles: ['customer', 'agent'], agence: 'standard', agencyIsStandard: true, chemin: '/app/messages' },
  // Crédits ACTIF avec sa valeur (tiroir) ; « Aller à » et ses touches.
  'admin d’agence sur les crédits': { roles: ['customer', 'agency_admin'], agence: 'standard', agencyIsStandard: true, chemin: '/app/credits' },
  // Lignes cadenassées ; ligne de statut « Demande en cours » (sablier `text-warning`).
  'hôte, demande en cours': {
    roles: ['customer', 'agency_admin', 'owner'],
    typeProfilActif: 'agency_admin',
    agence: 'individual',
    agencyIsStandard: false,
    hasPendingUpgrade: true,
    chemin: '/app/visits',
  },
  // La ligne de mise en location ; la console.
  'client et console': { roles: ['customer', 'super_admin'], agence: null, chemin: '/app/favorites' },
  // Revue adverse (M3) — « Mes visites » ACTIVE avec son compteur : un compte hors des priorités du client
  // reste sur son entrée, et se mesure sur le voile de l'actif.
  'client sur ses visites': { roles: ['customer'], agence: null, chemin: '/app/visits' },
};

function monter(s: Scenario) {
  chemin.courant = s.chemin;
  const user = { id: 1, first_name: 'Awa', last_name: 'Diop', full_name: 'Awa Diop', email: 'awa@example.sn', roles: s.roles, agency_id: 7 } as unknown as User;
  const acces = accesDepuis({
    roles: s.roles,
    agence: s.agence ? { kind: s.agence } : null,
    capacites: s.roles.includes('agency_admin') ? CAPACITES_ADMIN : [],
  });
  return render(
    withIntl(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <AccesAdminProvider acces={acces}>
          <AppSidebar
            modulesMasques={[]}
            user={user}
            agencyIsStandard={s.agencyIsStandard}
            hasPendingUpgrade={s.hasPendingUpgrade}
            typeProfilActif={s.typeProfilActif ?? null}
            onOuvrirPalette={() => {}}
          />
        </AccesAdminProvider>
      </QueryClientProvider>,
    ),
  );
}

type Couche = { readonly jeton: string; readonly alpha: number };

/** Les couches de fond, de la page au texte : au repos, et avec les voiles de survol des ancêtres. */
function fondsDe(element: Element, jetons: Readonly<Record<string, string>>): { etat: string; hex: string }[] {
  const chaine: Element[] = [];
  for (let n: Element | null = element; n; n = n.parentElement) chaine.unshift(n);
  const page = versRvb(resoudreCouleur('background', jetons));
  const etats: Record<string, Rvb> = { repos: page };
  let survol: Rvb | null = null;
  for (const n of chaine) {
    const couches = Array.from(n.classList).map((c) => litUtilitaireDeCouleur(c, 'bg')).filter((u) => u !== null);
    const base: Couche | undefined = couches.find((u) => u.variante === '' && u.jeton !== 'transparent');
    const auSurvol: Couche | undefined = couches.find((u) => u.variante === 'hover');
    const poser = (fond: Rvb, c: Couche | undefined) => (c ? composer(versRvb(resoudreCouleur(c.jeton, jetons)), fond, c.alpha) : fond);
    etats.repos = poser(etats.repos, base);
    if (survol) survol = poser(survol, base);
    if (auSurvol) survol = poser(survol ?? etats.repos, auSurvol);
  }
  const sortie = [{ etat: 'repos', hex: versHex(etats.repos) }];
  if (survol) sortie.push({ etat: 'survol', hex: versHex(survol) });
  return sortie;
}

/** Les éléments porteurs d'une encre (`text-*` sans variante) et d'un texte lisible à l'œil. */
function textesMesures(racine: Element) {
  return Array.from(racine.querySelectorAll('*'))
    .filter((el) => !(el instanceof SVGElement) && !el.closest('svg') && !el.closest('.sr-only') && !el.classList.contains('sr-only'))
    .filter((el) => (el.textContent ?? '').trim() !== '')
    .map((el) => ({ el, encre: Array.from(el.classList).map((c) => litUtilitaireDeCouleur(c, 'text')).find((u) => u?.variante === '') }))
    .filter((x): x is { el: Element; encre: NonNullable<typeof x.encre> } => x.encre !== undefined && x.encre !== null);
}

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => cleanup());

describe('TCK-2490 (AC4) — chaque texte de la colonne tient 4,5:1 sur tous ses fonds, clair et sombre', () => {
  it('la colonne pose bien son lin : `bg-muted/45` sur la page — sans quoi la mesure ne dit rien', () => {
    const { container } = monter(SCENARIOS['agent sur la messagerie']);
    expect(container.querySelector('aside')!.className.split(/\s+/)).toContain('bg-muted/45');
  });

  it.each(Object.keys(SCENARIOS))('%s', (nom) => {
    // « Récents » (texte discret, `text-muted-foreground`) : des pages retenues que chaque menu résout
    // en partie ; un chemin que le menu ne couvre pas est écarté de lui-même.
    window.localStorage.setItem(
      'takussan.pages-recentes.1',
      JSON.stringify(['/app/visits', '/app/favorites', '/app/properties', '/app/leases', '/app/calendar']),
    );
    const { container } = monter(SCENARIOS[nom]);
    if (nom === 'agent sur la messagerie') expect(container.querySelector('[data-slot="recents"] a')).not.toBeNull();
    const mesures = textesMesures(container.querySelector('aside')!);
    // L'épreuve n'est pas vide : compteurs, puces, touches, valeurs sont bien rendus.
    expect(mesures.length).toBeGreaterThan(20);
    const echecs: string[] = [];
    for (const [theme, jetons] of [['clair', JETONS_CLAIR], ['sombre', JETONS_SOMBRE]] as const) {
      for (const { el, encre } of mesures) {
        for (const fond of fondsDe(el, jetons)) {
          const texte = composer(versRvb(resoudreCouleur(encre.jeton, jetons)), versRvb(fond.hex), encre.alpha);
          const ratio = contraste(texte, fond.hex);
          if (ratio < SEUIL_AA_TEXTE) {
            echecs.push(`${theme} · « ${(el.textContent ?? '').trim().slice(0, 30)} » text-${encre.jeton}${encre.alpha < 1 ? `/${Math.round(encre.alpha * 100)}` : ''} sur ${fond.hex} (${fond.etat}) = ${fmt(ratio)}`);
          }
        }
      }
    }
    expect(echecs).toEqual([]);
  });

  it('l’épreuve voit bien l’entrée active : le compteur des visites actives est mesuré sur le voile de 8 %', () => {
    const { container } = monter(SCENARIOS['client sur ses visites']);
    const actif = container.querySelector('nav a[aria-current="page"]')!;
    expect(actif.getAttribute('href')).toBe('/app/visits');
    const compteur = Array.from(actif.querySelectorAll('span')).find((s) => s.textContent === '2' && s.className.includes('text-'))!;
    const fonds = fondsDe(compteur, JETONS_CLAIR);
    // Le lin (`--muted` à 45 % sur `--background`), puis l'encre à 8 %.
    const lin = composer(versRvb(JETONS_CLAIR.muted), versRvb(JETONS_CLAIR.background), 0.45);
    expect(fonds[0].hex).toBe(versHex(composer(versRvb(JETONS_CLAIR.foreground), lin, 0.08)));
  });
});

// TCK-2691:début
/**
 * TCK-2691 (ADR-0106, C6, C7, AC4, AC5) — les icônes de ligne passent en `muted-foreground` au repos et
 * `primary` à l'actif : des éléments NON TEXTUELS, ≥ 3:1 sur tous leurs fonds (le lin, le voile du survol,
 * le voile de l'entrée active), clair et sombre. Et l'avatar du compte quitte l'encre noire pour le repli
 * par défaut de TCK-2687 : le « soi » de la maquette (`accent/15`, `text-accent`) est mesuré ici, sous
 * 4,5:1 sur la colonne — c'est ce qui le fait écarter (ADR-0106, exception 1).
 */
describe('TCK-2691 (AC4) — chaque icône de la colonne tient 3:1 sur tous ses fonds, clair et sombre', () => {
  it.each(Object.keys(SCENARIOS))('%s', (nom) => {
    const { container } = monter(SCENARIOS[nom]);
    const icones = Array.from(container.querySelectorAll('aside nav svg'))
      .map((el) => ({ el, encre: Array.from(el.classList).map((c) => litUtilitaireDeCouleur(c, 'text')).find((u) => u?.variante === '') }))
      .filter((x): x is { el: Element; encre: NonNullable<typeof x.encre> } => x.encre !== undefined && x.encre !== null);
    // L'épreuve n'est pas vide : les icônes du menu portent bien leur encre.
    expect(icones.length).toBeGreaterThan(5);
    const echecs: string[] = [];
    for (const [theme, jetons] of [['clair', JETONS_CLAIR], ['sombre', JETONS_SOMBRE]] as const) {
      for (const { el, encre } of icones) {
        for (const fond of fondsDe(el, jetons)) {
          const ratio = contraste(composer(versRvb(resoudreCouleur(encre.jeton, jetons)), versRvb(fond.hex), encre.alpha), fond.hex);
          if (ratio < SEUIL_NON_TEXTUEL) echecs.push(`${theme} · icône text-${encre.jeton} sur ${fond.hex} (${fond.etat}) = ${fmt(ratio)}`);
        }
      }
    }
    expect(echecs).toEqual([]);
  });

  it('une icône au repos rend `muted-foreground`, l’icône de l’entrée active `primary` (trait 1,5)', () => {
    const { container } = monter(SCENARIOS['client sur ses visites']);
    const actif = container.querySelector('nav a[aria-current="page"]')!;
    const repos = Array.from(container.querySelectorAll('nav [data-ligne] a:not([aria-current])'))[0]!;
    expect(actif.querySelector('svg')!.getAttribute('class')!.split(/\s+/)).toContain('text-primary');
    expect(repos.querySelector('svg')!.getAttribute('class')!.split(/\s+/)).toContain('text-muted-foreground');
    for (const ligne of [actif, repos]) expect(ligne.querySelector('svg')!.getAttribute('stroke-width')).toBe('1.5');
  });
});

describe('TCK-2691 (AC5) — l’avatar du compte : le repli par défaut, pas l’encre noire ni le « soi » de la maquette', () => {
  const lin = (jetons: Readonly<Record<string, string>>) =>
    composer(versRvb(jetons.muted), versRvb(jetons.background), 0.45);

  it('le « soi » de la maquette (`accent/15`, `text-accent`) tombe sous 4,5:1 sur la colonne — il est écarté', () => {
    const fond = composer(versRvb(resoudreCouleur('accent', JETONS_CLAIR)), lin(JETONS_CLAIR), 0.15);
    expect(contraste(versRvb(resoudreCouleur('accent', JETONS_CLAIR)), versHex(fond))).toBeLessThan(SEUIL_AA_TEXTE);
  });

  it('le repli retenu (`secondary` / `primary-deep`, aplats opaques) tient 4,5:1, clair et sombre', () => {
    for (const jetons of [JETONS_CLAIR, JETONS_SOMBRE]) {
      const ratio = contraste(versRvb(resoudreCouleur('primary-deep', jetons)), resoudreCouleur('secondary', jetons));
      expect(ratio).toBeGreaterThanOrEqual(SEUIL_AA_TEXTE);
    }
  });

  it('le pied rend ce repli (aucune pastille `bg-foreground`) et le nom en graisse 600', () => {
    const { container } = monter(SCENARIOS['agent sur la messagerie']);
    const pied = container.querySelector('[data-slot="pied-du-compte"]')!;
    const repli = pied.querySelector('[data-slot="avatar-fallback"]')!;
    expect(repli).not.toBeNull();
    const classes = repli.className.split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(['bg-fond-avatar', 'text-encre-avatar', 'font-semibold']));
    expect(classes).not.toContain('bg-foreground');
    expect(classes).not.toContain('text-background');
    expect(pied.querySelector('[data-slot="avatar"]')!.className.split(/\s+/)).toEqual(expect.arrayContaining(['size-8', 'max-md:size-9']));
    expect(Array.from(pied.querySelectorAll('span')).find((s) => s.textContent === 'Awa Diop')!.className).toContain('font-semibold');
  });
});
describe('TCK-2691 (AC6, C8, C9, C12) — les cotes de la colonne, celles de la maquette', () => {
  const classes = (el: Element | null) => (el?.getAttribute('class') ?? '').split(/\s+/);

  it('une ligne : `text-sm` (12,6 px dès `lg`), 15 px au tiroir, `px-2`, `gap-2.5` ; au repos, l’encre douce OPAQUE', () => {
    const { container } = monter(SCENARIOS['client sur ses visites']);
    const repos = container.querySelector('nav [data-ligne] a:not([aria-current])')!;
    expect(classes(repos)).toEqual(expect.arrayContaining(['text-sm', 'max-md:text-corps', 'px-2', 'gap-2.5', 'text-encre-douce']));
    expect(classes(repos)).not.toContain('text-foreground');
    expect(classes(repos).some((c) => /^text-encre-douce\//.test(c))).toBe(false);
    const actif = container.querySelector('nav a[aria-current="page"]')!;
    expect(classes(actif)).toEqual(expect.arrayContaining(['font-medium', 'text-foreground']));
    // L'icône : 18 px, 20 px au tiroir.
    expect(classes(repos.querySelector('svg'))).toEqual(expect.arrayContaining(['size-[18px]', 'max-md:size-5']));
  });

  it('un titre de groupe : `text-xs`, graisse 400 ; un compteur : `text-xs font-semibold` en `primary-deep`', () => {
    const { container } = monter(SCENARIOS['client sur ses visites']);
    const titre = container.querySelector('[data-groupe] [id$="-titre"]')!;
    expect(classes(titre)).toEqual(expect.arrayContaining(['text-xs', 'text-muted-foreground', 'px-2']));
    // Au bureau, ni marge sous le titre ni interstice entre les lignes : le pas de la maquette (32,4 px).
    expect(classes(titre)).not.toContain('mb-0.5');
    const liste = container.querySelector(`#${CSS.escape(titre.getAttribute('aria-controls') ?? titre.id.replace(/-titre$/, '-liste'))}`)!;
    const lignes = liste.querySelector('[data-ligne]')!.parentElement!;
    expect(classes(lignes)).toContain('max-md:space-y-px');
    expect(classes(lignes)).not.toContain('space-y-px');
    expect(classes(titre).some((c) => /^font-/.test(c))).toBe(false);
    const compteur = container.querySelector('[data-slot="compteur-entree"] span')!;
    expect(classes(compteur)).toEqual(expect.arrayContaining(['text-xs', 'font-semibold', 'text-primary-deep']));
  });

  it('le filet droit et celui du pied à l’encre de bord pleine ; la tête en `px-4`, le lien de la marque sans marge latérale', () => {
    const { container } = monter(SCENARIOS['agent sur la messagerie']);
    const aside = container.querySelector('aside')!;
    expect(classes(aside)).toContain('border-border');
    expect(classes(aside)).not.toContain('border-border/70');
    const marque = container.querySelector('[data-slot="marque"]')!;
    expect(classes(marque.parentElement)).toContain('px-4');
    expect(classes(marque).some((c) => /^px-/.test(c))).toBe(false);
    expect(classes(container.querySelector('[data-slot="pied-du-compte"]')!.closest('.border-t'))).toContain('border-border');
  });

  it('l’action principale : pastille `size-6`, libellé en 600', () => {
    const { container } = monter(SCENARIOS['agent sur la messagerie']);
    const action = container.querySelector('[data-slot="action-principale"]');
    expect(action).not.toBeNull();
    const [pastille, libelle] = Array.from(action!.children);
    expect(classes(pastille)).toContain('size-6');
    expect(classes(libelle)).toContain('font-semibold');
  });
});
// TCK-2691:fin
