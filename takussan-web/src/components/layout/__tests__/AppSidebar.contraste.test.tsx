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
  // Messagerie ACTIVE avec son compteur ; « Aujourd'hui » chargé ; « Démarrer ».
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
    const { container } = monter(SCENARIOS[nom]);
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

  it('l’épreuve voit bien l’entrée active : le compteur de la messagerie active est mesuré sur le voile de 8 %', () => {
    const { container } = monter(SCENARIOS['agent sur la messagerie']);
    const actif = container.querySelector('nav a[aria-current="page"]')!;
    expect(actif.getAttribute('href')).toBe('/app/messages');
    const compteur = Array.from(actif.querySelectorAll('span')).find((s) => s.textContent === '3' && s.className.includes('text-'))!;
    const fonds = fondsDe(compteur, JETONS_CLAIR);
    // Le lin (`--muted` à 45 % sur `--background`), puis l'encre à 8 %.
    const lin = composer(versRvb(JETONS_CLAIR.muted), versRvb(JETONS_CLAIR.background), 0.45);
    expect(fonds[0].hex).toBe(versHex(composer(versRvb(JETONS_CLAIR.foreground), lin, 0.08)));
  });
});
