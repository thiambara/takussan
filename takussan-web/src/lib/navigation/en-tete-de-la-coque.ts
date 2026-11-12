import { PAGES_ADMIN } from '@/lib/access/pages-admin';
import { estPleinEcran } from '@/components/layout/plein-ecran';
import { listePour } from './app-sections';
import { CATALOGUE, cleDe, type IdDestination } from './catalogue';
import { destinationDuChemin } from './composer-menu';
import { DISPOSITIONS } from './dispositions';
import type { Persona } from './personas';
import type { ContexteDeMenu } from './types';

/**
 * TCK-2617 (décision 5 (a) du porteur) — ce que l'en-tête du TÉLÉPHONE de `/app` sait d'une route
 * avant que la page ne déclare quoi que ce soit : sa FORME, son TITRE dérivé et le REPLI de son retour.
 * Une fonction pure du chemin (et du compte pour le libellé) : le rendu serveur porte déjà le bon
 * en-tête, aucun titre n'apparaît après coup. La déclaration de la page (`DeclarerEnTete`) la précise.
 *
 * Quatre formes, celles de la maquette `app-coque` (`chrome-app.tsx`) :
 *  - `accueil` — `/app` : l'espace en bouton à gauche ; le salut reste le H1, dans le contenu ;
 *  - `racine` — une page du menu : le titre EST le H1 ;
 *  - `detail` — une route SOUS une page parente (`/app/leases/7`) : flèche de retour, titre court ;
 *  - `plein-ecran` — un formulaire de création (`…/new`) : « ✕ », titre, sans barre d'onglets.
 *
 * Éprouvée sur CHAQUE `page.tsx` de `/app` (`en-tete-de-la-coque.test.ts`) : une route neuve sans
 * titre ni forme fait rougir le test — « une page sans titre propre n'est jamais sans titre ».
 */
export type FormeDEnTete = 'accueil' | 'racine' | 'detail' | 'plein-ecran';

/** Un libellé : une clé sous un espace de traduction (`useTranslations(espace)(cle)`). */
export interface TitreDerive {
  readonly espace: string;
  readonly cle: string;
}

interface PageHorsMenu {
  readonly titre: TitreDerive;
  /** La page parente : la route est alors un DÉTAIL, et son retour y mène. Absente : une racine. */
  readonly parent?: string;
}

const PAGES = 'dashboard.pages';
const SOMMAIRE = 'profile.sommaire.rangees';

/**
 * Les routes qu'aucune entrée du menu ne porte, avec le titre de leur page (`generateMetadata` ou
 * `PageHeader` : le même libellé). Une racine ici (sans `parent`) n'est le détail de personne, même
 * sous un préfixe du menu (`/app/overview/owner` n'est pas un détail des statistiques).
 */
const HORS_MENU: Readonly<Record<string, PageHorsMenu>> = {
  // TCK-2635 — « Profil », comme la maquette et le titre du bureau.
  '/app/profile': { titre: { espace: 'profile.sommaire', cle: 'titre' } },
  '/app/profile/notifications': {
    titre: { espace: 'nav.sidebar', cle: 'compte.preferences' },
    parent: '/app/profile',
  },
  '/app/account/privacy': { titre: { espace: PAGES, cle: 'privacy.title' }, parent: '/app/profile' },
  // TCK-2635 — une page par section du profil, chacune un détail du sommaire (`/app/profile`).
  '/app/profile/contact': { titre: { espace: SOMMAIRE, cle: 'coordonnees' }, parent: '/app/profile' },
  '/app/profile/public-profile': { titre: { espace: SOMMAIRE, cle: 'fiche' }, parent: '/app/profile' },
  '/app/profile/professional': { titre: { espace: SOMMAIRE, cle: 'pro' }, parent: '/app/profile' },
  '/app/profile/search-preferences': { titre: { espace: SOMMAIRE, cle: 'recherche' }, parent: '/app/profile' },
  '/app/profile/payouts': { titre: { espace: SOMMAIRE, cle: 'versement' }, parent: '/app/profile' },
  '/app/profile/directory': { titre: { espace: SOMMAIRE, cle: 'annuaire' }, parent: '/app/profile' },
  '/app/profile/security': { titre: { espace: SOMMAIRE, cle: 'securite' }, parent: '/app/profile' },
  '/app/profile/spaces': { titre: { espace: SOMMAIRE, cle: 'espaces' }, parent: '/app/profile' },
  '/app/profile/menu': { titre: { espace: SOMMAIRE, cle: 'menu' }, parent: '/app/profile' },
  '/app/profile/language': { titre: { espace: SOMMAIRE, cle: 'langue' }, parent: '/app/profile' },
  '/app/profile/timezone': { titre: { espace: SOMMAIRE, cle: 'fuseau' }, parent: '/app/profile' },
  // « Mes avis » est aussi une entrée du menu de l'agent (« Avis reçus ») ; la maquette en fait une section
  // du profil, un détail du sommaire (« ← Mes avis »), d'où qu'on l'ouvre.
  '/app/profile/reviews': { titre: { espace: SOMMAIRE, cle: 'avis' }, parent: '/app/profile' },
  '/app/profile/delete-account': { titre: { espace: 'profile.sommaire', cle: 'supprimer' }, parent: '/app/profile' },
  '/app/notifications': { titre: { espace: PAGES, cle: 'notifications.title' } },
  '/app/crm': { titre: { espace: 'nav.sidebar', cle: 'crm' } },
  '/app/crm/pipeline': { titre: { espace: PAGES, cle: 'crmPipeline.metaTitle' } },
  '/app/overview/owner': { titre: { espace: PAGES, cle: 'overviewOwner.metaTitle' } },
  '/app/overview/tenant': { titre: { espace: PAGES, cle: 'overviewTenant.metaTitle' } },
  '/app/overview/agent': { titre: { espace: 'dashboard.agent', cle: 'title' } },
  '/app/settings/agency/upgrade': { titre: { espace: PAGES, cle: 'upgrade.metaTitle' } },
  '/app/payments/return': { titre: { espace: PAGES, cle: 'paymentReturn.metaTitle' }, parent: '/app/payments' },
  '/app/agency/finances/reconciliation': {
    titre: { espace: 'admin.reconciliation', cle: 'title' },
    parent: '/app/agency/finances',
  },
  // Les formulaires de création : plein écran au téléphone, leur « ✕ » ramène à la liste.
  '/app/customers/new': { titre: { espace: PAGES, cle: 'customerNew.title' }, parent: '/app/customers' },
  '/app/leases/new': { titre: { espace: PAGES, cle: 'leaseNew.title' }, parent: '/app/leases' },
  '/app/maintenance/new': { titre: { espace: PAGES, cle: 'maintenanceNew.title' }, parent: '/app/maintenance' },
  '/app/inventories/new': { titre: { espace: PAGES, cle: 'inventoryNew.metaTitle' }, parent: '/app/inventories' },
};

/** Les formulaires plein écran (au téléphone) : une création, jamais un détail. */
function estFormulaire(chemin: string): boolean {
  return chemin.startsWith('/app/') && chemin.endsWith('/new');
}

/** Le chemin sans requête ni ancre, sans barre finale. */
function cheminDe(pathname: string | null | undefined): string {
  const nu = (pathname ?? '').split(/[?#]/)[0] ?? '';
  return nu.length > 1 && nu.endsWith('/') ? nu.slice(0, -1) : nu;
}

/** Les `href` du menu et des pages d'agence : ce qu'une route peut avoir pour parente. */
const HREFS_DU_MENU: ReadonlySet<string> = new Set([
  ...CATALOGUE.map((d) => d.href).filter((h) => h.startsWith('/app')),
  ...PAGES_ADMIN.map((p) => p.chemin),
]);

/**
 * La page parente d'une route — le repli de son retour — ou `null` pour une racine.
 *
 * Dans l'ordre : la table hors menu ; une entrée du menu ou une page d'agence elle-même (racine) ;
 * la liste de sa section (`listePour`, la table de la page introuvable) ; le plus long `href` du menu
 * qui la PRÉCÈDE (`/app/agency/finances/reconciliation/12` → le rapprochement, `/app/x/y` → `/app/x`).
 */
export function parentDeLaRoute(pathname: string | null | undefined): string | null {
  const chemin = cheminDe(pathname);
  if (!chemin.startsWith('/app/')) return null;
  const horsMenu = HORS_MENU[chemin];
  if (horsMenu) return horsMenu.parent ?? null;
  if (HREFS_DU_MENU.has(chemin)) return null;
  const liste = listePour(chemin);
  if (liste && liste !== chemin) return liste;
  let parent: string | null = null;
  for (const href of [...HREFS_DU_MENU, ...Object.keys(HORS_MENU)]) {
    if (href === '/app' || !chemin.startsWith(`${href}/`)) continue;
    if (parent === null || href.length > parent.length) parent = href;
  }
  return parent;
}

/** La forme de l'en-tête du téléphone, avant toute déclaration de la page. */
export function formeDeLaRoute(pathname: string | null | undefined): FormeDEnTete {
  const chemin = cheminDe(pathname);
  if (chemin === '/app') return 'accueil';
  if (estPleinEcran(chemin) || estFormulaire(chemin)) return 'plein-ecran';
  return parentDeLaRoute(chemin) ? 'detail' : 'racine';
}

/**
 * Le libellé du menu pour cet `href` : la destination OUVERTE au compte d'abord (« Mes baux » / « Baux »),
 * sous le libellé propre au persona quand sa disposition en écrit un (TCK-2618 : « Loyers » du bailleur,
 * le mot de son onglet et de son entrée).
 */
function titreDuMenu(href: string, ctx: ContexteDeMenu, persona?: Persona): TitreDerive | null {
  const destination = destinationDuChemin(ctx, href);
  const propre = destination && persona ? DISPOSITIONS[persona].libelles?.[destination.id as IdDestination] : undefined;
  // Vérification de TCK-2671 — le libellé propre vit dans l'espace de SA destination, comme au menu
  // (`composer-menu`, `labelSpace`) : « Reversements » de l'hôte est `nav.admin.payouts`. Lu sous
  // `nav.sidebar`, il rendait une 500 (MISSING_MESSAGE) à `/app/agency/billing`.
  if (propre) return { espace: destination?.espace ?? 'nav.sidebar', cle: propre };
  if (destination) return { espace: destination.espace ?? 'nav.sidebar', cle: cleDe(destination, ctx) };
  const page = PAGES_ADMIN.find((p) => p.chemin === href);
  if (page?.menu) return { espace: 'nav.admin', cle: page.menu.cle };
  return null;
}

/**
 * Le titre dérivé d'une route : le libellé du menu qui la sert, sinon celui de la table hors menu,
 * sinon — un détail que la page n'a pas encore nommé — le titre de sa page parente. `null` hors `/app`.
 */
export function titreDeLaRoute(pathname: string | null | undefined, ctx: ContexteDeMenu, persona?: Persona): TitreDerive | null {
  const chemin = cheminDe(pathname);
  if (chemin !== '/app' && !chemin.startsWith('/app/')) return null;
  const horsMenu = HORS_MENU[chemin];
  if (horsMenu) return horsMenu.titre;
  const duMenu = titreDuMenu(chemin, ctx, persona);
  if (duMenu) return duMenu;
  const parent = parentDeLaRoute(chemin);
  return parent ? titreDeLaRoute(parent, ctx, persona) : null;
}
