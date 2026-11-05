# TCK-2477 — Le moteur du menu de `/app` : plan d'implémentation

> **Pour les agents :** sous-compétence requise — `superpowers:subagent-driven-development` (recommandé)
> ou `superpowers:executing-plans`, tâche par tâche. Les étapes se cochent (`- [ ]`).

**But :** remplacer la procédure `buildNavItems` par un catalogue de destinations, une résolution de
persona d'après le profil actif, des dispositions par persona et une composition pure — **sans
changer un pixel** du menu des sept rôles éprouvés.

**Architecture :** cinq modules purs sous `takussan-web/src/lib/navigation/` (`types`, `catalogue`,
`personas`, `dispositions`, `composer-menu`) et une liste `hors-menu`. `AppSidebar` garde ses
exports publics (`buildNavItems` devient un adaptateur déprécié, retiré par TCK-2478) pour que les
cinq fichiers de tests existants passent **sans retouche de leurs attentes**. Le layout de `/app` lit
le type du profil actif (cookie `active_profile_id`) et le descend jusqu'à la barre.

**Pile :** Next.js 16 (App Router), React 19, TypeScript 5, vitest 4 + Testing Library, next-intl,
lucide-react.

**Références :** [ADR-0089](../adr/0089-le-menu-de-app-se-derive-du-profil-actif.md) ·
[TCK-2477](../backlog/tickets/doing/TCK-2477-moteur-du-menu-par-persona.md) ·
`docs/features.md` § « Navigation de la console selon le profil actif ».

## Contraintes globales

- **Identité de rendu** pour les sept rôles simples (`customer`, `tenant`, `agent`, `agency_admin`,
  `owner`, `service_provider`, `super_admin`) : jeu d'`href`, ordre par section, libellés, compteurs
  armés, cadenas. Les attentes de `AppSidebar.test.tsx`, `AppSidebar.audience.test.tsx`,
  `AppSidebar.proposition.test.ts`, `AppSidebar.acces-admin.test.tsx`,
  `AppSidebar.section-agence.test.tsx`, `src/lib/__tests__/roles-derives.test.ts` et
  `AgencyQueues.source-unique.test.tsx` ne sont **pas modifiées**.
- **Écart assumé, à écrire dans les notes du ticket** : pour un compte CUMULANT plusieurs profils,
  le jeu d'`href` est inchangé (l'accès se juge toujours sur l'union de `roles` dans ce lot), mais
  l'ordre à l'intérieur d'une section suit la disposition du persona. Mesuré : seul le couple
  `service_provider` + `customer` change d'ordre (« Engagements » : Baux puis Documents, au lieu de
  Documents puis Baux).
- Le persona se résout d'après le **profil actif**, jamais d'après l'union seule (ADR-0089 §2).
- La section d'agence reste dérivée de `PAGES_ADMIN` par `avecSectionAgence`, inchangée.
- Aucune nouvelle dépendance. Aucun `useMemo`/`useCallback` neuf (React Compiler, ADR-0015).
- Chaque clé i18n neuve en `fr`, `en`, `wo` ; le `wo` porte le texte français tel quel (wolof en
  pause).
- **Jamais de suite entière en local** : on lance les fichiers touchés ; la CI joue les suites.
- Commits en français, préfixés, citant `TCK-2477`, terminés par
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Aucun push sans accord du porteur.
- Toutes les commandes `npx` se lancent depuis `takussan-web/`.

## Carte des fichiers

| Fichier | Rôle |
|---|---|
| Créer `src/lib/navigation/types.ts` | `NavSection`, `SECTION_ORDER`, `SECTION_LABEL_KEYS`, `NavCounterKey`, `ContexteDeMenu` — déplacés d'`AppSidebar`, plus la section `plus` |
| Créer `src/lib/navigation/catalogue.ts` | Les 29 destinations, leur prédicat d'accès, leur libellé |
| Créer `src/lib/navigation/personas.ts` | `PERSONAS`, `Persona`, `typeDuProfilActif`, `resoudrePersona` |
| Créer `src/lib/navigation/dispositions.ts` | `Disposition`, `DISPOSITIONS` (miroir du menu actuel) |
| Créer `src/lib/navigation/composer-menu.ts` | `composerMenu`, `menuDuPersona`, `EntreeComposee` |
| Créer `src/lib/navigation/hors-menu.ts` | `HORS_MENU` : les pages de `/app` sans entrée, avec leur raison |
| Créer `src/lib/navigation/__tests__/catalogue.test.ts` | identifiants uniques, `href` partagés exclusifs |
| Créer `src/lib/navigation/__tests__/personas.test.ts` | table de résolution |
| Créer `src/lib/navigation/__tests__/composer-menu.test.ts` | composition, « Plus », rien de perdu |
| Créer `src/lib/navigation/__tests__/arborescence.test.ts` | garde catalogue ⇄ `page.tsx` |
| Modifier `src/components/layout/AppSidebar.tsx` | adaptateur `buildNavItems`, prop `typeProfilActif` |
| Modifier `src/components/layout/AppShell.tsx` | descend `typeProfilActif` |
| Modifier `src/app/(dashboard)/app/layout.tsx` | lit le type du profil actif |
| Modifier `src/messages/{fr,en,wo}.json` | `nav.sidebar.sections.more` |

---

### Tâche 1 : les types et le catalogue des destinations

**Fichiers :**
- Créer : `takussan-web/src/lib/navigation/types.ts`
- Créer : `takussan-web/src/lib/navigation/catalogue.ts`
- Test : `takussan-web/src/lib/navigation/__tests__/catalogue.test.ts`

**Interfaces :**
- Produit : `type NavSection`, `SECTION_ORDER`, `SECTION_LABEL_KEYS`, `type NavCounterKey`,
  `interface ContexteDeMenu { roles: UserRole[]; capacites: readonly string[] | null }` (dans
  `types.ts`) ; `interface Destination`, `type IdDestination`, `CATALOGUE`,
  `cleDe(d, ctx): string`, `iconeDe(d, ctx): LucideIcon` (dans `catalogue.ts`).

- [ ] **Étape 1 : écrire le test qui échoue**

`takussan-web/src/lib/navigation/__tests__/catalogue.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { USER_ROLES, type UserRole } from '@/types/user';
import { CATALOGUE } from '../catalogue';
import type { ContexteDeMenu } from '../types';

/** Tous les sous-ensembles de rôles, chacun sous trois états des capacités. */
function contextes(): ContexteDeMenu[] {
  const sortie: ContexteDeMenu[] = [];
  for (let masque = 0; masque < 1 << USER_ROLES.length; masque++) {
    const roles = USER_ROLES.filter((_, i) => masque & (1 << i)) as UserRole[];
    for (const capacites of [null, [], ['properties.create']]) sortie.push({ roles, capacites });
  }
  return sortie;
}

describe('TCK-2477 — le catalogue des destinations', () => {
  it('chaque identifiant est unique', () => {
    const ids = CATALOGUE.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('compte les 29 destinations du menu de dev 0b7deae44', () => {
    expect(CATALOGUE).toHaveLength(29);
  });

  it('deux destinations d’un même href ne sont jamais accessibles ensemble', () => {
    for (const ctx of contextes()) {
      const hrefs = CATALOGUE.filter((d) => d.accessible(ctx)).map((d) => d.href);
      expect(new Set(hrefs).size, `${ctx.roles.join('+')} / ${JSON.stringify(ctx.capacites)}`).toBe(hrefs.length);
    }
  });

  it('le socle — tableau de bord, messagerie, documents — est ouvert à tout compte', () => {
    for (const id of ['tableau-de-bord', 'messagerie', 'documents']) {
      const d = CATALOGUE.find((x) => x.id === id);
      expect(d?.accessible({ roles: [], capacites: null }), id).toBe(true);
    }
  });
});
```

- [ ] **Étape 2 : lancer le test, constater l'échec**

Run : `npx vitest run src/lib/navigation/__tests__/catalogue.test.ts`
Attendu : FAIL — `Failed to resolve import "../catalogue"`.

- [ ] **Étape 3 : écrire `types.ts`**

Déplacer ici, **avec leurs docblocks tels quels**, `NavSection`, `SECTION_ORDER`,
`SECTION_LABEL_KEYS` et `NavCounterKey` d'`AppSidebar.tsx` (lignes 72-128 sur `dev` 0b7deae44),
en ajoutant la section `plus` :

```ts
import type { UserRole } from '@/types/user';

// (docblock TCK-377 / TCK-649 / TCK-646 repris d'AppSidebar.tsx, inchangé)
//
// TCK-2477 (ADR-0089 §4) — `plus` : les destinations accessibles qu'aucune disposition ne place.
// Elle ferme la marche : une destination n'est jamais PERDUE, elle tombe ici.
export type NavSection =
  | 'primary'
  | 'discover'
  | 'requests'
  | 'engagements'
  | 'manage'
  | 'admin'
  | 'plus';

export const SECTION_ORDER: readonly NavSection[] = [
  'primary',
  'discover',
  'requests',
  'engagements',
  'manage',
  'admin',
  'plus',
];

/** `null` = section rendue SANS en-tête. Clés sous `nav.sidebar.sections`. */
export const SECTION_LABEL_KEYS: Record<NavSection, string | null> = {
  primary: null,
  discover: 'discover',
  requests: 'requests',
  engagements: 'engagements',
  manage: 'manage',
  admin: 'admin',
  plus: 'more',
};

// (docblock de NavCounterKey repris tel quel)
export type NavCounterKey =
  | 'unreadMessages'
  | 'pendingVisits'
  | 'unhandledLeads'
  | 'reviewModeration'
  | 'propertyModeration';

/**
 * Ce que le catalogue sait du compte pour juger une destination : les rôles de l'espace actif
 * (ADR-0005 amendé) et les capacités du profil actif — `null` tant qu'elles ne sont pas lues
 * (P152.03 : le personnel n'a alors aucune entrée de création).
 */
export interface ContexteDeMenu {
  readonly roles: UserRole[];
  readonly capacites: readonly string[] | null;
}
```

- [ ] **Étape 4 : écrire `catalogue.ts`**

Chaque prédicat reprend, à l'identique, la garde de `buildNavItems` qui poussait l'entrée ; les
commentaires de ticket (TCK-379, TCK-492, TCK-587, TCK-625, P152.03…) qui justifient une garde
la suivent ici, sur sa destination.

```ts
import {
  BarChart3,
  BellRing,
  BookmarkCheck,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Coins,
  CreditCard,
  Download,
  FileText,
  FolderOpen,
  Gauge,
  HandCoins,
  Heart,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  MessageSquareQuote,
  PlusCircle,
  Users,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  isAdmin,
  isAgent,
  isCustomer,
  isCustomerOnly,
  isOwner,
  isServiceProvider,
  isSuperAdmin,
  isTenant,
} from '@/lib/roles';
import type { UserRole } from '@/types/user';
import { HREF_CREDITS, HREF_MES_BIENS, peutOuvrirMesBiens, voitLePortefeuille } from './acces-app';
import type { ContexteDeMenu, NavCounterKey } from './types';

/**
 * TCK-2477 (ADR-0089 §1) — LE catalogue des destinations de `/app`. Il n'y en a qu'un.
 *
 * Une destination y est déclarée une fois : identifiant stable, `href`, libellé, icône, prédicat
 * d'accès. Le prédicat décide de l'ÉCRAN, jamais de la donnée : chaque API rejuge. Il reprend la
 * garde que `buildNavItems` posait sur la même entrée — l'historique de chaque garde est dans le
 * `git log` d'`AppSidebar.tsx` avant ce ticket.
 *
 * Les pages d'administration d'agence n'y sont PAS : `PAGES_ADMIN` reste leur seul juge (ADR-0064),
 * et `avecSectionAgence` les ajoute au menu.
 *
 * ⚠ Deux destinations peuvent partager un `href` (« Publier » et « Proposer » un bien) : leurs
 * prédicats sont alors EXCLUSIFS, ce que `catalogue.test.ts` éprouve sur tous les comptes.
 */
export interface Destination {
  readonly id: string;
  readonly href: string;
  /** Clé sous `nav.sidebar` — ou la fonction qui la choisit (`myBookings` / `bookings`). */
  readonly cle: string | ((ctx: ContexteDeMenu) => string);
  readonly icone: LucideIcon;
  /** Quand l'icône dépend du compte. Un champ à part : une icône lucide est un composant. */
  readonly iconeSelon?: (ctx: ContexteDeMenu) => LucideIcon;
  readonly accessible: (ctx: ContexteDeMenu) => boolean;
  readonly misEnAvant?: boolean;
  readonly compteur?: NavCounterKey;
}

/**
 * TCK-379 — qui occupe ou gère un logement. Prédicat POSITIF, et non `!isServiceProvider` : `roles`
 * est un tableau, et un compte prestataire ET locataire garde ses baux (cf. le docblock d'origine,
 * `git show 0b7deae44:takussan-web/src/components/layout/AppSidebar.tsx`, l. 162-189).
 */
function occupeUnLogement(roles: UserRole[]): boolean {
  return (
    isCustomer(roles) || isTenant(roles) || isOwner(roles) || isAgent(roles) || isAdmin(roles)
  );
}

function personnel(roles: UserRole[]): boolean {
  return isAgent(roles) || isAdmin(roles);
}

/** P152.03 — « Publier » sous `properties.create` ; le super-admin passe tout, sans lecture. */
function peutPublier({ roles, capacites }: ContexteDeMenu): boolean {
  return personnel(roles) && (isSuperAdmin(roles) || (capacites ?? []).includes('properties.create'));
}

/** TCK-492 — `isCustomerOnly`, jamais `isCustomer` : `customer` est le plancher de tout compte. */
function client({ roles }: ContexteDeMenu): boolean {
  return isCustomerOnly(roles);
}

const TABLE = [
  { id: 'tableau-de-bord', href: '/app', cle: 'dashboard', icone: LayoutDashboard, accessible: () => true },
  {
    id: 'mes-biens',
    href: HREF_MES_BIENS,
    cle: 'myProperties',
    icone: Building2,
    accessible: ({ roles }) => peutOuvrirMesBiens(roles),
  },
  {
    id: 'publier-bien',
    href: '/app/properties/new',
    cle: 'publishProperty',
    icone: PlusCircle,
    misEnAvant: true,
    accessible: peutPublier,
  },
  {
    // TCK-587 (ADR-0031) — le bailleur hors personnel PROPOSE un bien à son agence. Tant que les
    // capacités du personnel ne sont pas lues, aucune entrée de création (P152.03).
    id: 'proposer-bien',
    href: '/app/properties/new',
    cle: 'proposeProperty',
    icone: PlusCircle,
    misEnAvant: true,
    accessible: (ctx) =>
      !peutPublier(ctx) && isOwner(ctx.roles) && (!personnel(ctx.roles) || ctx.capacites !== null),
  },
  // TCK-625 — un client peut devenir hôte : l'entrée mène à `/publish`.
  { id: 'publier-annonce', href: '/publish', cle: 'publishProperty', icone: PlusCircle, accessible: client },
  {
    id: 'messagerie',
    href: '/app/messages',
    cle: 'messaging',
    icone: MessageSquare,
    compteur: 'unreadMessages',
    accessible: () => true,
  },
  {
    id: 'reservations',
    href: '/app/bookings',
    cle: (ctx) => (client(ctx) ? 'myBookings' : 'bookings'),
    icone: CalendarCheck,
    accessible: (ctx) => client(ctx) || occupeUnLogement(ctx.roles),
  },
  {
    id: 'visites',
    href: '/app/visits',
    cle: (ctx) => (client(ctx) ? 'myVisits' : 'visits'),
    icone: CalendarClock,
    compteur: 'pendingVisits',
    accessible: (ctx) => client(ctx) || occupeUnLogement(ctx.roles),
  },
  // TCK-633 lot F (ADR-0061 §1) — le portefeuille de l'espace ; l'API tranche (`boost.spend`).
  { id: 'credits', href: HREF_CREDITS, cle: 'credits', icone: Coins, accessible: ({ roles }) => voitLePortefeuille(roles) },
  { id: 'favoris', href: '/app/favorites', cle: 'myFavorites', icone: Heart, accessible: ({ roles }) => occupeUnLogement(roles) },
  {
    id: 'recherches',
    href: '/app/saved-searches',
    cle: 'savedSearches',
    icone: BookmarkCheck,
    accessible: ({ roles }) => occupeUnLogement(roles),
  },
  {
    // Le bailleur reçoit « Maintenance » avant que le prestataire ne reçoive « Interventions » :
    // c'était l'ordre des poussées, donc le libellé retenu par le dédoublonnage.
    id: 'maintenance',
    href: '/app/maintenance',
    cle: ({ roles }) => (isServiceProvider(roles) && !isOwner(roles) ? 'interventions' : 'maintenance'),
    icone: Wrench,
    accessible: (ctx) =>
      client(ctx) || isOwner(ctx.roles) || personnel(ctx.roles) || isServiceProvider(ctx.roles),
  },
  // TCK-260 — le carnet des prestataires : admin d'agence, et le super-admin par `isAdmin`.
  {
    id: 'carnet-prestataires',
    href: '/app/maintenance/providers',
    cle: 'providerBook',
    icone: Wrench,
    accessible: ({ roles }) => isAdmin(roles),
  },
  // TCK-590 — les demandes laissées sur le site public.
  {
    id: 'demandes',
    href: '/app/leads',
    cle: 'leads',
    icone: Inbox,
    compteur: 'unhandledLeads',
    accessible: ({ roles }) => isAgent(roles) || isOwner(roles) || isAdmin(roles),
  },
  {
    id: 'baux',
    href: '/app/leases',
    cle: (ctx) => (client(ctx) ? 'myLeases' : 'leases'),
    icone: FileText,
    accessible: (ctx) => client(ctx) || occupeUnLogement(ctx.roles),
  },
  {
    id: 'paiements',
    href: '/app/payments',
    cle: (ctx) => (client(ctx) ? 'payments' : 'finances'),
    icone: CreditCard,
    accessible: (ctx) => client(ctx) || isOwner(ctx.roles),
  },
  {
    // TCK-597 (A15) — « Mes avis » chez le client, la boîte des avis reçus ailleurs.
    id: 'avis',
    href: '/app/profile/reviews',
    cle: (ctx) => (client(ctx) ? 'myReviews' : 'receivedReviews'),
    icone: MessageSquareQuote,
    iconeSelon: (ctx) => (client(ctx) ? BookmarkCheck : MessageSquareQuote),
    accessible: (ctx) => client(ctx) || isOwner(ctx.roles) || personnel(ctx.roles),
  },
  // TCK-595 (ADR-0049 §3) — le grand livre des commissions.
  { id: 'commissions', href: '/app/commissions', cle: 'commissions', icone: HandCoins, accessible: ({ roles }) => personnel(roles) },
  { id: 'documents', href: '/app/documents', cle: 'documents', icone: FolderOpen, accessible: () => true },
  {
    id: 'etats-des-lieux',
    href: '/app/inventories',
    cle: 'inventories',
    icone: ClipboardList,
    accessible: (ctx) => client(ctx) || personnel(ctx.roles) || isOwner(ctx.roles),
  },
  // TCK-266 — les locataires dont l'état des lieux d'entrée attend depuis plus de 7 jours.
  {
    id: 'entrees-en-attente',
    href: '/app/leases/onboarding-pending',
    cle: 'onboardingPending',
    icone: ClipboardCheck,
    accessible: ({ roles }) => personnel(roles),
  },
  // TCK-379 — aucun tableau de bord pour le prestataire (`docs/features.md` §2.5).
  { id: 'statistiques', href: '/app/overview', cle: 'statistics', icone: BarChart3, accessible: ({ roles }) => occupeUnLogement(roles) },
  {
    id: 'exports',
    href: '/app/overview/exports',
    cle: 'exports',
    icone: Download,
    accessible: ({ roles }) => isAdmin(roles) || isAgent(roles) || isOwner(roles),
  },
  // TCK-595 (AC17 bis) — plus pour l'agent : `reports.view_agency`, rôle d'admin d'agence.
  { id: 'vue-agence', href: '/app/overview/agency', cle: 'agencyView', icone: BarChart3, accessible: ({ roles }) => isAdmin(roles) },
  // TCK-284 — PAS standard-only (`docs/features.md` §1.12, liste fermée).
  { id: 'kpis', href: '/app/overview/kpis', cle: 'kpis', icone: Gauge, accessible: ({ roles }) => isAdmin(roles) },
  { id: 'alertes', href: '/app/overview/alerts', cle: 'alerts', icone: BellRing, accessible: ({ roles }) => isAdmin(roles) },
  // TCK-256 — l'annuaire des propriétaires ; standard-only par la page et par l'API.
  { id: 'proprietaires', href: '/app/owners', cle: 'owners', icone: Users, accessible: ({ roles }) => isAdmin(roles) },
  { id: 'clients', href: '/app/customers', cle: 'crm', icone: Users, accessible: ({ roles }) => personnel(roles) || isOwner(roles) },
  // TCK-072 — le calendrier agrégé de qui gère un catalogue.
  {
    id: 'calendrier',
    href: '/app/calendar',
    cle: 'calendar',
    icone: CalendarDays,
    accessible: ({ roles }) => isAgent(roles) || isOwner(roles) || isAdmin(roles),
  },
] as const satisfies readonly Destination[];

export type IdDestination = (typeof TABLE)[number]['id'];

export const CATALOGUE: readonly (Destination & { readonly id: IdDestination })[] = TABLE;

export function cleDe(destination: Destination, ctx: ContexteDeMenu): string {
  return typeof destination.cle === 'function' ? destination.cle(ctx) : destination.cle;
}

export function iconeDe(destination: Destination, ctx: ContexteDeMenu): LucideIcon {
  return destination.iconeSelon?.(ctx) ?? destination.icone;
}
```

- [ ] **Étape 5 : lancer le test, constater le vert**

Run : `npx vitest run src/lib/navigation/__tests__/catalogue.test.ts`
Attendu : PASS (4 tests).

- [ ] **Étape 6 : ablation**

Dans `proposer-bien`, retirer `!peutPublier(ctx) &&`. Relancer : le test « deux destinations d'un
même href » doit ÉCHOUER (un admin d'agence aussi bailleur, avec `properties.create`, a les deux).
Rétablir, relancer : PASS.

- [ ] **Étape 7 : commit**

```bash
git add takussan-web/src/lib/navigation/types.ts takussan-web/src/lib/navigation/catalogue.ts takussan-web/src/lib/navigation/__tests__/catalogue.test.ts
git commit -m "feat(web): le catalogue des destinations de /app (TCK-2477)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tâche 2 : le persona du profil actif

**Fichiers :**
- Créer : `takussan-web/src/lib/navigation/personas.ts`
- Test : `takussan-web/src/lib/navigation/__tests__/personas.test.ts`

**Interfaces :**
- Consomme : `PROFILE_TYPES`, `ProfileType` (`@/types/profile`) ; `isSuperAdmin`, `isTenant`.
- Produit : `PERSONAS`, `type Persona`, `typeDuProfilActif(id: string | null | undefined): ProfileType | null`,
  `interface ContexteDePersona { roles: UserRole[]; typeProfilActif?: ProfileType | null; agenceIndividuelle?: boolean }`,
  `resoudrePersona(ctx: ContexteDePersona): Persona`.

- [ ] **Étape 1 : écrire le test qui échoue**

`takussan-web/src/lib/navigation/__tests__/personas.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { UserRole } from '@/types/user';
import type { ProfileType } from '@/types/profile';
import { resoudrePersona, typeDuProfilActif, type Persona } from '../personas';

describe('TCK-2477 — typeDuProfilActif', () => {
  it.each<[string | undefined, ProfileType | null]>([
    ['agency_admin:12', 'agency_admin'],
    ['owner:3', 'owner'],
    ['agent:4', 'agent'],
    ['service_provider:9', 'service_provider'],
    ['platform:1', null],
    ['', null],
    [undefined, null],
  ])('%s → %s', (cookie, attendu) => {
    expect(typeDuProfilActif(cookie)).toBe(attendu);
  });
});

describe('TCK-2477 — resoudrePersona (ADR-0089 §2)', () => {
  it.each<[string, UserRole[], ProfileType | null, boolean, Persona]>([
    ['client', ['customer'], null, false, 'client'],
    ['locataire', ['customer', 'tenant'], null, false, 'locataire'],
    ['bailleur', ['customer', 'owner'], null, false, 'bailleur'],
    ['agent', ['customer', 'agent'], null, false, 'agent'],
    ['admin d’agence standard', ['customer', 'agency_admin'], null, false, 'admin-agence'],
    ['admin d’agence individuelle', ['customer', 'agency_admin', 'owner'], null, true, 'hote'],
    ['bailleur de son agence individuelle', ['customer', 'agency_admin', 'owner'], 'owner', true, 'hote'],
    ['prestataire', ['customer', 'service_provider'], null, false, 'prestataire'],
    ['super-admin sans profil actif', ['customer', 'super_admin'], null, false, 'plateforme'],
    // Le cas qui motive l'ADR : un admin ET bailleur d'une même agence standard.
    ['admin+bailleur, profil actif admin', ['customer', 'agency_admin', 'owner'], 'agency_admin', false, 'admin-agence'],
    ['admin+bailleur, profil actif bailleur', ['customer', 'agency_admin', 'owner'], 'owner', false, 'bailleur'],
    ['agent+bailleur, profil actif bailleur', ['customer', 'agent', 'owner'], 'owner', false, 'bailleur'],
    // Un cookie périmé (profil suspendu, absent de `roles`) ne décide de rien.
    ['cookie périmé', ['customer', 'agent'], 'owner', false, 'agent'],
    ['super-admin dans un espace d’agence', ['customer', 'super_admin', 'agency_admin'], 'agency_admin', false, 'admin-agence'],
  ])('%s', (_, roles, typeProfilActif, agenceIndividuelle, attendu) => {
    expect(resoudrePersona({ roles, typeProfilActif, agenceIndividuelle })).toBe(attendu);
  });
});
```

- [ ] **Étape 2 : lancer le test, constater l'échec**

Run : `npx vitest run src/lib/navigation/__tests__/personas.test.ts`
Attendu : FAIL — `Failed to resolve import "../personas"`.

- [ ] **Étape 3 : écrire `personas.ts`**

```ts
import { isSuperAdmin, isTenant } from '@/lib/roles';
import { PROFILE_TYPES, type ProfileType } from '@/types/profile';
import type { UserRole } from '@/types/user';

/**
 * TCK-2477 (ADR-0089 §2) — les huit personas du menu de `/app`.
 *
 * `hote` est l'admin d'une agence `individual` : l'assistant hôte y crée DEUX profils (admin et
 * bailleur) pour une seule personne, que le sélecteur présente déjà comme un seul espace
 * (`espacesAProposer`, TCK-497). Le menu suit.
 */
export const PERSONAS = [
  'client',
  'locataire',
  'bailleur',
  'agent',
  'admin-agence',
  'hote',
  'prestataire',
  'plateforme',
] as const;

export type Persona = (typeof PERSONAS)[number];

/** Le type de profil le plus « fort » quand aucun profil actif n'est connu — l'ordre de `RANG` (`lib/roles.ts`). */
const TYPE_DOMINANT: readonly ProfileType[] = ['agency_admin', 'agent', 'owner', 'service_provider'];

/** `agency_admin:12` → `agency_admin`. Tout autre jeton (dont le profil de plateforme) → `null`. */
export function typeDuProfilActif(identifiant: string | null | undefined): ProfileType | null {
  const type = identifiant?.split(':')[0] ?? '';
  return (PROFILE_TYPES as readonly string[]).includes(type) ? (type as ProfileType) : null;
}

export interface ContexteDePersona {
  readonly roles: UserRole[];
  /** Le type du profil actif (cookie `active_profile_id`), `null` s'il n'est pas connu. */
  readonly typeProfilActif?: ProfileType | null;
  /** L'agence du profil actif est `individual` (`agencyIsStandard === false`). */
  readonly agenceIndividuelle?: boolean;
}

/**
 * Le persona d'après le PROFIL ACTIF, jamais d'après l'union de `roles` seule : `roles` additionne
 * les profils actifs de l'espace (ADR-0005, amendement du 2026-10-23), et un admin d'agence qui est
 * aussi bailleur y porte les deux.
 *
 * Un profil actif absent de `roles` (cookie périmé, profil suspendu) ne décide de rien : on retombe
 * sur le type dominant, comme l'auto-bascule de l'API retient d'abord `agency_admin`.
 */
export function resoudrePersona({
  roles,
  typeProfilActif = null,
  agenceIndividuelle = false,
}: ContexteDePersona): Persona {
  const actif = typeProfilActif !== null && roles.includes(typeProfilActif) ? typeProfilActif : null;
  if (actif === null && isSuperAdmin(roles)) return 'plateforme';
  const type = actif ?? TYPE_DOMINANT.find((t) => roles.includes(t)) ?? null;
  switch (type) {
    case 'agency_admin':
      return agenceIndividuelle ? 'hote' : 'admin-agence';
    case 'owner':
      return agenceIndividuelle && roles.includes('agency_admin') ? 'hote' : 'bailleur';
    case 'agent':
      return 'agent';
    case 'service_provider':
      return 'prestataire';
    default:
      return isTenant(roles) ? 'locataire' : 'client';
  }
}
```

- [ ] **Étape 4 : lancer le test, constater le vert**

Run : `npx vitest run src/lib/navigation/__tests__/personas.test.ts`
Attendu : PASS (21 tests).

- [ ] **Étape 5 : ablation (AC2 du ticket)**

Remplacer la première ligne du corps par `const actif = null;`. Relancer : les cas « profil actif
bailleur » et « super-admin dans un espace d'agence » doivent ÉCHOUER. Rétablir, relancer : PASS.

- [ ] **Étape 6 : commit**

```bash
git add takussan-web/src/lib/navigation/personas.ts takussan-web/src/lib/navigation/__tests__/personas.test.ts
git commit -m "feat(web): le persona se résout d'après le profil actif (TCK-2477)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tâche 3 : les dispositions miroir et la composition

**Fichiers :**
- Créer : `takussan-web/src/lib/navigation/dispositions.ts`
- Créer : `takussan-web/src/lib/navigation/composer-menu.ts`
- Test : `takussan-web/src/lib/navigation/__tests__/composer-menu.test.ts`

**Interfaces :**
- Consomme : `CATALOGUE`, `IdDestination`, `cleDe`, `iconeDe` (tâche 1) ; `Persona`, `PERSONAS` (tâche 2) ;
  `NavSection`, `NavCounterKey`, `ContexteDeMenu` (tâche 1).
- Produit : `interface GroupeDeDisposition { id: NavSection; entrees: readonly IdDestination[] }`,
  `interface Disposition { groupes: readonly GroupeDeDisposition[] }`, `DISPOSITIONS: Record<Persona, Disposition>` ;
  `interface EntreeComposee { id: IdDestination; href: string; labelKey: string; icon: LucideIcon; section: NavSection; emphasized?: boolean; counterKey?: NavCounterKey }`,
  `composerMenu(ctx: ContexteDeMenu, disposition: Disposition): EntreeComposee[]`,
  `menuDuPersona(ctx: ContexteDeMenu, persona: Persona): EntreeComposee[]`.

- [ ] **Étape 1 : écrire le test qui échoue**

`takussan-web/src/lib/navigation/__tests__/composer-menu.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { USER_ROLES, type UserRole } from '@/types/user';
import { CATALOGUE, type IdDestination } from '../catalogue';
import { composerMenu, menuDuPersona } from '../composer-menu';
import { DISPOSITIONS, type Disposition } from '../dispositions';
import { PERSONAS } from '../personas';
import type { ContexteDeMenu } from '../types';

const IDS = new Set<string>(CATALOGUE.map((d) => d.id));

function contextes(): ContexteDeMenu[] {
  const sortie: ContexteDeMenu[] = [];
  for (let masque = 0; masque < 1 << USER_ROLES.length; masque++) {
    const roles = USER_ROLES.filter((_, i) => masque & (1 << i)) as UserRole[];
    for (const capacites of [null, ['properties.create']]) sortie.push({ roles, capacites });
  }
  return sortie;
}

describe('TCK-2477 — les dispositions', () => {
  it.each(PERSONAS)('%s : tout identifiant cité existe au catalogue', (persona) => {
    for (const groupe of DISPOSITIONS[persona].groupes) {
      for (const id of groupe.entrees) expect(IDS.has(id), `${persona} — ${id}`).toBe(true);
    }
  });

  // Propre au LOT 1 (miroir du menu de dev) : rien ne tombe sous « Plus ». TCK-2478 retire ce test.
  it.each(PERSONAS)('%s : le miroir place chaque destination du catalogue', (persona) => {
    const places = new Set(DISPOSITIONS[persona].groupes.flatMap((g) => g.entrees));
    expect([...IDS].filter((id) => !places.has(id as IdDestination))).toEqual([]);
  });
});

describe('TCK-2477 — composerMenu (ADR-0089 §4)', () => {
  it.each(PERSONAS)('%s : aucune destination accessible n’est perdue, aucune n’est doublée', (persona) => {
    for (const ctx of contextes()) {
      const rendus = menuDuPersona(ctx, persona).map((e) => e.href);
      const attendus = new Set(CATALOGUE.filter((d) => d.accessible(ctx)).map((d) => d.href));
      expect(new Set(rendus), `${persona} / ${ctx.roles.join('+')}`).toEqual(attendus);
      expect(rendus).toHaveLength(attendus.size);
    }
  });

  it('une destination accessible que la disposition ne place pas tombe sous « Plus »', () => {
    const disposition: Disposition = { groupes: [{ id: 'primary', entrees: ['tableau-de-bord'] }] };
    const menu = composerMenu({ roles: ['customer'], capacites: null }, disposition);
    expect(menu[0]).toMatchObject({ href: '/app', section: 'primary' });
    expect(menu.find((e) => e.href === '/app/messages')?.section).toBe('plus');
  });

  it('un identifiant inconnu est ignoré', () => {
    const disposition: Disposition = {
      groupes: [{ id: 'primary', entrees: ['tableau-de-bord', 'disparue' as IdDestination] }],
    };
    expect(() => composerMenu({ roles: ['customer'], capacites: null }, disposition)).not.toThrow();
  });

  it('une destination inaccessible n’est jamais rendue', () => {
    const menu = menuDuPersona({ roles: ['customer'], capacites: null }, 'client');
    expect(menu.map((e) => e.href)).not.toContain('/app/commissions');
  });

  it('le libellé et la mise en avant suivent le compte (« Proposer » chez le bailleur)', () => {
    const menu = menuDuPersona({ roles: ['customer', 'owner'], capacites: null }, 'bailleur');
    expect(menu.find((e) => e.href === '/app/properties/new')).toMatchObject({
      labelKey: 'proposeProperty',
      emphasized: true,
    });
  });
});
```

- [ ] **Étape 2 : lancer le test, constater l'échec**

Run : `npx vitest run src/lib/navigation/__tests__/composer-menu.test.ts`
Attendu : FAIL — `Failed to resolve import "../composer-menu"`.

- [ ] **Étape 3 : écrire `dispositions.ts`**

Les ordres sont RELEVÉS sur `buildNavItems` (`dev` 0b7deae44), section par section, pour les sept
rôles simples : un seul ordre convient à tous, sauf « Engagements », où le client lit États des
lieux avant Documents et le personnel l'inverse.

```ts
import type { IdDestination } from './catalogue';
import type { Persona } from './personas';
import type { NavSection } from './types';

/**
 * TCK-2477 (ADR-0089 §3) — la disposition du menu, par persona.
 *
 * ⚠ **Ce lot les écrit en MIROIR du menu de `dev` (0b7deae44)** : chaque persona place les 29
 * destinations, dans l'ordre que `buildNavItems` produisait pour son rôle — l'accès, lui, filtre.
 * TCK-2478 les fait diverger (dispositions validées par le porteur le 2026-11-05).
 *
 * `Record<Persona, …>` est EXHAUSTIF : un persona ajouté sans disposition casse `tsc`.
 */
export interface GroupeDeDisposition {
  readonly id: NavSection;
  readonly entrees: readonly IdDestination[];
}

export interface Disposition {
  readonly groupes: readonly GroupeDeDisposition[];
}

/** TCK-646 — la tête, dans l'ordre du porteur : accueil, biens, publier, messagerie, réservations, visites, crédits. */
const TETE: readonly IdDestination[] = [
  'tableau-de-bord',
  'mes-biens',
  'publier-bien',
  'proposer-bien',
  'publier-annonce',
  'messagerie',
  'reservations',
  'visites',
  'credits',
];
const DECOUVRIR: readonly IdDestination[] = ['favoris', 'recherches'];
const DEMANDES: readonly IdDestination[] = ['maintenance', 'carnet-prestataires', 'demandes'];
const ENGAGEMENTS_PERSONNEL: readonly IdDestination[] = [
  'baux',
  'paiements',
  'avis',
  'commissions',
  'documents',
  'etats-des-lieux',
  'entrees-en-attente',
];
/** TCK-173 — le parcours du client : bail, paiements, états des lieux, ses avis, puis ses documents. */
const ENGAGEMENTS_CLIENT: readonly IdDestination[] = [
  'baux',
  'paiements',
  'etats-des-lieux',
  'avis',
  'documents',
  'commissions',
  'entrees-en-attente',
];
const PILOTAGE: readonly IdDestination[] = [
  'statistiques',
  'exports',
  'vue-agence',
  'kpis',
  'alertes',
  'proprietaires',
  'clients',
  'calendrier',
];

function miroir(engagements: readonly IdDestination[]): Disposition {
  return {
    groupes: [
      { id: 'primary', entrees: TETE },
      { id: 'discover', entrees: DECOUVRIR },
      { id: 'requests', entrees: DEMANDES },
      { id: 'engagements', entrees: engagements },
      { id: 'manage', entrees: PILOTAGE },
    ],
  };
}

const MIROIR_PERSONNEL = miroir(ENGAGEMENTS_PERSONNEL);
const MIROIR_CLIENT = miroir(ENGAGEMENTS_CLIENT);

export const DISPOSITIONS: Record<Persona, Disposition> = {
  client: MIROIR_CLIENT,
  locataire: MIROIR_CLIENT,
  bailleur: MIROIR_PERSONNEL,
  agent: MIROIR_PERSONNEL,
  'admin-agence': MIROIR_PERSONNEL,
  hote: MIROIR_PERSONNEL,
  prestataire: MIROIR_PERSONNEL,
  plateforme: MIROIR_PERSONNEL,
};
```

- [ ] **Étape 4 : écrire `composer-menu.ts`**

```ts
import type { LucideIcon } from 'lucide-react';
import { CATALOGUE, cleDe, iconeDe, type Destination, type IdDestination } from './catalogue';
import { DISPOSITIONS, type Disposition } from './dispositions';
import type { Persona } from './personas';
import type { ContexteDeMenu, NavCounterKey, NavSection } from './types';

/** Une entrée prête à rendre : la forme de `NavItem` (`AppSidebar`), plus son identifiant. */
export interface EntreeComposee {
  readonly id: IdDestination;
  readonly href: string;
  readonly labelKey: string;
  readonly icon: LucideIcon;
  readonly section: NavSection;
  readonly emphasized?: boolean;
  readonly counterKey?: NavCounterKey;
}

const PAR_ID: ReadonlyMap<string, Destination & { readonly id: IdDestination }> = new Map(
  CATALOGUE.map((d) => [d.id, d]),
);

/**
 * TCK-2477 (ADR-0089 §4) — LE menu : une fonction pure du compte et de la disposition.
 *
 * 1. Les groupes de la disposition, dans leur ordre : une entrée n'y paraît que si elle est
 *    accessible, et une seule fois par `href` (« Publier » et « Proposer » se le partagent).
 * 2. Toute destination accessible que la disposition ne place pas tombe sous « Plus » : une
 *    destination n'est jamais PERDUE.
 * 3. Un identifiant inconnu (préférence périmée, destination retirée) est ignoré.
 *
 * La section d'agence n'est pas composée ici : `avecSectionAgence` l'ajoute depuis `PAGES_ADMIN`.
 */
export function composerMenu(ctx: ContexteDeMenu, disposition: Disposition): EntreeComposee[] {
  const sortie: EntreeComposee[] = [];
  const hrefsPris = new Set<string>();
  const places = new Set<string>();

  const poser = (destination: Destination & { readonly id: IdDestination }, section: NavSection) => {
    if (hrefsPris.has(destination.href) || !destination.accessible(ctx)) return;
    hrefsPris.add(destination.href);
    sortie.push({
      id: destination.id,
      href: destination.href,
      labelKey: cleDe(destination, ctx),
      icon: iconeDe(destination, ctx),
      section,
      ...(destination.misEnAvant ? { emphasized: true } : {}),
      ...(destination.compteur ? { counterKey: destination.compteur } : {}),
    });
  };

  for (const groupe of disposition.groupes) {
    for (const id of groupe.entrees) {
      places.add(id);
      const destination = PAR_ID.get(id);
      if (destination) poser(destination, groupe.id);
    }
  }
  for (const destination of CATALOGUE) {
    if (!places.has(destination.id)) poser(destination, 'plus');
  }
  return sortie;
}

export function menuDuPersona(ctx: ContexteDeMenu, persona: Persona): EntreeComposee[] {
  return composerMenu(ctx, DISPOSITIONS[persona]);
}
```

- [ ] **Étape 5 : lancer le test, constater le vert**

Run : `npx vitest run src/lib/navigation/__tests__/composer-menu.test.ts`
Attendu : PASS.

- [ ] **Étape 6 : ablation (AC5 du ticket)**

Supprimer la boucle `for (const destination of CATALOGUE) …`. Relancer : « tombe sous Plus »
doit ÉCHOUER. Rétablir, relancer : PASS.

Puis (AC3) : ajouter `'essai'` à `PERSONAS` dans `personas.ts` et lancer `npx tsc --noEmit` — il doit
échouer sur `DISPOSITIONS` (`Property 'essai' is missing`). Rétablir.

- [ ] **Étape 7 : commit**

```bash
git add takussan-web/src/lib/navigation/dispositions.ts takussan-web/src/lib/navigation/composer-menu.ts takussan-web/src/lib/navigation/__tests__/composer-menu.test.ts
git commit -m "feat(web): dispositions par persona et composition pure du menu (TCK-2477)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tâche 4 : brancher la barre latérale sur le moteur

**Fichiers :**
- Modifier : `takussan-web/src/components/layout/AppSidebar.tsx`
- Modifier : `takussan-web/src/components/layout/AppShell.tsx`
- Modifier : `takussan-web/src/app/(dashboard)/app/layout.tsx`
- Modifier : `takussan-web/src/messages/fr.json`, `en.json`, `wo.json`
- Tests (inchangés, ils sont le filet) : `src/components/layout/__tests__/AppSidebar*.test.ts(x)`,
  `src/lib/__tests__/roles-derives.test.ts`,
  `src/components/dashboard/admin/__tests__/AgencyQueues.source-unique.test.tsx`

**Interfaces :**
- Consomme : `menuDuPersona` (tâche 3), `resoudrePersona`, `typeDuProfilActif` (tâche 2), `getActiveProfileId` (`@/lib/session`).
- Produit : prop `typeProfilActif?: ProfileType | null` sur `AppSidebar` et `AppShell` ;
  `buildNavItems(user, capacites?, typeProfilActif?, agenceIndividuelle?)` déprécié.

- [ ] **Étape 1 : lancer le filet AVANT toute modification**

Run :
```bash
npx vitest run src/components/layout/__tests__/AppSidebar.test.tsx src/components/layout/__tests__/AppSidebar.audience.test.tsx src/components/layout/__tests__/AppSidebar.proposition.test.ts src/components/layout/__tests__/AppSidebar.acces-admin.test.tsx src/components/layout/__tests__/AppSidebar.section-agence.test.tsx src/lib/__tests__/roles-derives.test.ts src/components/dashboard/admin/__tests__/AgencyQueues.source-unique.test.tsx
```
Attendu : PASS. Noter le nombre de tests (il doit être le même à l'étape 6).

- [ ] **Étape 2 : la clé « Plus » dans les trois langues**

Sous `nav.sidebar.sections`, après `"admin"` :
- `src/messages/fr.json` : `"more": "Plus"`
- `src/messages/en.json` : `"more": "More"`
- `src/messages/wo.json` : `"more": "Plus"` (wolof en pause : le texte français tel quel)

- [ ] **Étape 3 : réécrire le haut d'`AppSidebar.tsx`**

1. Supprimer les imports d'icônes qui ne servent plus que `buildNavItems` (garder `Lock` et
   `UserRound`, utilisés par le rendu) et les prédicats de rôle devenus inutiles (garder `isAgent`,
   `isAdmin`, `isSuperAdmin`, utilisés par la lecture des capacités).
2. Supprimer les définitions de `NavSection`, `SECTION_ORDER`, `SECTION_LABEL_KEYS`,
   `NavCounterKey` (déplacées en tâche 1), `occupeUnLogement`, `RANG_EN_TETE`, `rangEnTete`, et le
   corps de `buildNavItems`. Les remplacer par :

```ts
import {
  SECTION_LABEL_KEYS,
  SECTION_ORDER,
  type NavCounterKey,
  type NavSection,
} from '@/lib/navigation/types';
import { menuDuPersona } from '@/lib/navigation/composer-menu';
import { resoudrePersona } from '@/lib/navigation/personas';
import type { ProfileType } from '@/types/profile';

// TCK-2477 — déplacés vers `@/lib/navigation/types` ; ré-exportés pour les appelants existants.
export { SECTION_LABEL_KEYS, SECTION_ORDER };
export type { NavCounterKey, NavSection };
```

et, à la place de l'ancien `buildNavItems` :

```ts
/**
 * @deprecated TCK-2477 — adaptateur du moteur (`@/lib/navigation`, ADR-0089). Il garde la
 * signature d'avant pour que les tests qui figent le menu des sept rôles passent SANS retouche ;
 * TCK-2478 les réécrit sur le moteur et retire cet adaptateur.
 */
export function buildNavItems(
  user: User,
  capacites: readonly string[] | null = null,
  typeProfilActif: ProfileType | null = null,
  agenceIndividuelle = false,
): NavItem[] {
  const persona = resoudrePersona({ roles: user.roles, typeProfilActif, agenceIndividuelle });
  return menuDuPersona({ roles: user.roles, capacites }, persona);
}
```

3. Dans `interface NavItem`, ajouter en tête : `id?: string;`.
4. Dans `AppSidebarProps`, ajouter :

```ts
  /**
   * TCK-2477 (ADR-0089 §2) — le type du profil actif, lu par le layout sur le cookie
   * `active_profile_id`. `null` ou absent : le persona se déduit des rôles.
   */
  typeProfilActif?: ProfileType | null;
```

5. Dans `AppSidebar`, déstructurer `typeProfilActif` et remplacer la ligne qui construit `navItems` :

```ts
  const navItems = avecSectionAgence(
    buildNavItems(user, capacites, typeProfilActif ?? null, agencyIsStandard === false),
    accesAdmin,
  ).map((item) => ({
    ...item,
    locked: isProRouteLocked(user, agencyIsStandard, item.href),
  }));
```

- [ ] **Étape 4 : descendre la prop dans `AppShell.tsx`**

Ajouter à `AppShellProps` :

```ts
  /** TCK-2477 — le type du profil actif, pour le persona du menu (ADR-0089). */
  typeProfilActif?: ProfileType | null;
```

l'importer (`import type { ProfileType } from '@/types/profile';`), le déstructurer, et le passer
aux DEUX `<AppSidebar …>` (barre fixe et tiroir) : `typeProfilActif={typeProfilActif}`.

- [ ] **Étape 5 : lire le profil actif dans le layout de `/app`**

Dans `src/app/(dashboard)/app/layout.tsx` :

```ts
import { getActiveProfileId, getToken } from '@/lib/session';
import { typeDuProfilActif } from '@/lib/navigation/personas';
```

avant le `return` :

```ts
  // TCK-2477 (ADR-0089 §2) — le persona du menu se juge sur le profil ACTIF. Pendant une
  // impersonation, `getActiveProfileId` ne rend rien (TCK-600) : le persona se déduit des rôles.
  const typeProfilActif = typeDuProfilActif(await getActiveProfileId());
```

et sur `<AppShell …>` : `typeProfilActif={typeProfilActif}`.

- [ ] **Étape 6 : relancer le filet**

Run : la commande de l'étape 1.
Attendu : PASS, **même nombre de tests**, aucun fichier de test modifié
(`git diff --stat -- 'takussan-web/src/**/__tests__/**'` ne liste que les fichiers neufs de
`src/lib/navigation/__tests__/`).

- [ ] **Étape 7 : ablation (AC1 du ticket)**

Dans `dispositions.ts`, échanger `'reservations'` et `'visites'` dans `TETE`. Relancer
`npx vitest run src/components/layout/__tests__/AppSidebar.test.tsx` : le bloc « TCK-646 — six
entrées en tête » doit ÉCHOUER. Rétablir, relancer : PASS.

- [ ] **Étape 8 : types, lint, i18n**

Run (depuis `takussan-web/`) :
```bash
npx tsc --noEmit && npm run lint && npm run check:i18n
```
Attendu : sortie 0 pour les trois. Si le scan de texte en dur signale `AppSidebar.tsx` (compte qui
DESCEND), lancer `node scripts/check-i18n.mjs --update` et ajouter `scripts/i18n-baseline.json` au
commit.

- [ ] **Étape 9 : commit**

```bash
git add takussan-web/src/components/layout/AppSidebar.tsx takussan-web/src/components/layout/AppShell.tsx "takussan-web/src/app/(dashboard)/app/layout.tsx" takussan-web/src/messages/fr.json takussan-web/src/messages/en.json takussan-web/src/messages/wo.json
git commit -m "refactor(web): la barre de /app rend le moteur de menu, lu sur le profil actif (TCK-2477)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tâche 5 : la garde d'arborescence et les pages hors menu

**Fichiers :**
- Créer : `takussan-web/src/lib/navigation/hors-menu.ts`
- Test : `takussan-web/src/lib/navigation/__tests__/arborescence.test.ts`

**Interfaces :**
- Consomme : `CATALOGUE` (tâche 1), `PAGES_ADMIN` (`@/lib/access/pages-admin`),
  `MOTIFS_DE_ROUTE` (`@/test/routes-publiques`, motifs de route dérivés des `page.*`, groupes retirés).
- Produit : `HORS_MENU: Readonly<Record<string, string>>` (motif de route → raison).

- [ ] **Étape 1 : écrire le test qui échoue**

`takussan-web/src/lib/navigation/__tests__/arborescence.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { MOTIFS_DE_ROUTE } from '@/test/routes-publiques';
import { PAGES_ADMIN } from '@/lib/access/pages-admin';
import { CATALOGUE } from '../catalogue';
import { HORS_MENU } from '../hors-menu';

/**
 * TCK-2477 (ADR-0089 §1) — chaque page de `/app` a une place, et chaque entrée a sa page.
 *
 * Une page est à sa place si elle est au menu (catalogue ou `PAGES_ADMIN`), si elle est la FILLE
 * d'une entrée du menu (`/app/leases/7` sous « Baux »), ou si `HORS_MENU` dit pourquoi elle n'en a
 * pas. *Une page qu'aucune entrée ne mène et qu'aucune raison ne justifie est une page perdue* —
 * c'est ainsi que « Mes tâches » (TCK-591) n'avait aucune entrée.
 */
const AU_MENU: readonly string[] = [...CATALOGUE.map((d) => d.href), ...PAGES_ADMIN.map((p) => p.chemin)];
const PARENTS = AU_MENU.filter((href) => href !== '/app');
const PAGES_DE_APP = MOTIFS_DE_ROUTE.filter((m) => m === '/app' || m.startsWith('/app/'));

function aSaPlace(motif: string): boolean {
  return (
    AU_MENU.includes(motif) ||
    HORS_MENU[motif] !== undefined ||
    PARENTS.some((parent) => motif.startsWith(`${parent}/`))
  );
}

describe('TCK-2477 — le menu et l’arborescence de /app', () => {
  it('chaque page de /app est au menu, fille d’une entrée, ou hors menu avec sa raison', () => {
    expect(PAGES_DE_APP.filter((motif) => !aSaPlace(motif))).toEqual([]);
  });

  it('chaque destination du catalogue a sa page', () => {
    expect(CATALOGUE.map((d) => d.href).filter((href) => !MOTIFS_DE_ROUTE.includes(href))).toEqual([]);
  });

  it('HORS_MENU ne garde ni une page disparue, ni une page déjà au menu', () => {
    for (const motif of Object.keys(HORS_MENU)) {
      expect(MOTIFS_DE_ROUTE, motif).toContain(motif);
      expect(AU_MENU, motif).not.toContain(motif);
    }
  });

  it('chaque page hors menu dit pourquoi', () => {
    for (const [motif, raison] of Object.entries(HORS_MENU)) {
      expect(raison.trim().length, motif).toBeGreaterThan(10);
    }
  });
});
```

- [ ] **Étape 2 : lancer le test, constater l'échec**

Run : `npx vitest run src/lib/navigation/__tests__/arborescence.test.ts`
Attendu : FAIL — `Failed to resolve import "../hors-menu"`.

- [ ] **Étape 3 : écrire `hors-menu.ts`**

Relevé le 2026-11-05 sur `dev` 0b7deae44 : neuf pages de `/app` ne sont ni au menu ni filles d'une
entrée.

```ts
/**
 * TCK-2477 (ADR-0089 §1) — les pages de `/app` qui n'ont PAS d'entrée de menu, et pourquoi.
 *
 * Clé : le motif de route tel que `MOTIFS_DE_ROUTE` le calcule (groupes `(…)` retirés). Une page
 * neuve sans entrée ni ligne ici fait rougir `arborescence.test.ts`.
 */
export const HORS_MENU: Readonly<Record<string, string>> = {
  '/app/[...introuvable]': 'Attrape-tout des URL inconnues : rend l’« introuvable » du tableau de bord.',
  '/app/account/privacy': 'Atteinte depuis le profil (confidentialité, effacement du compte).',
  '/app/crm': 'Redirection permanente vers /app/customers (TCK-042), gardée pour les anciens favoris.',
  '/app/crm/pipeline': 'Atteinte depuis la liste des clients (le tableau du pipeline, TCK-083).',
  '/app/notifications': 'Atteinte par la cloche de la barre haute.',
  '/app/profile': 'Atteinte par la carte du compte, en pied de barre latérale.',
  '/app/profile/notifications': 'Atteinte depuis le profil (préférences de notification).',
  '/app/settings/agency/upgrade': 'Atteinte par la carte « Passer en pro » (TCK-267).',
  '/app/tasks':
    'Atteinte par la tuile « Tâches du jour » du tableau de bord (TCK-591) ; entre au menu de l’agent avec TCK-2478.',
};
```

- [ ] **Étape 4 : lancer le test, constater le vert**

Run : `npx vitest run src/lib/navigation/__tests__/arborescence.test.ts`
Attendu : PASS (4 tests). Si le premier test liste un motif inattendu, c'est une page apparue depuis
le relevé : l'inscrire au catalogue si elle doit être au menu, sinon dans `HORS_MENU` avec sa raison
— jamais élargir la règle des pages filles.

- [ ] **Étape 5 : ablation (AC4 et AC6 du ticket)**

1. Retirer la ligne `'/app/tasks'` de `HORS_MENU` : le premier test doit ÉCHOUER en nommant
   `/app/tasks`. Rétablir.
2. Changer l'`href` de `calendrier` en `/app/calendrier` dans `catalogue.ts` : le deuxième test doit
   ÉCHOUER. Rétablir, relancer : PASS.

- [ ] **Étape 6 : commit**

```bash
git add takussan-web/src/lib/navigation/hors-menu.ts takussan-web/src/lib/navigation/__tests__/arborescence.test.ts
git commit -m "test(web): chaque page de /app a sa place au menu, ou sa raison de ne pas y être (TCK-2477)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tâche 6 : vérification finale et ticket

**Fichiers :**
- Modifier : `docs/backlog/tickets/doing/TCK-2477-moteur-du-menu-par-persona.md` (notes, statut)

- [ ] **Étape 1 : rejouer tout ce que le lot touche**

Run (depuis `takussan-web/`) :
```bash
npx vitest run src/lib/navigation src/components/layout src/lib/__tests__/roles-derives.test.ts src/components/dashboard/admin/__tests__/AgencyQueues.source-unique.test.tsx src/data/__tests__/navigation.test.ts
npx tsc --noEmit && npm run lint && npm run check:i18n
```
Attendu : tout vert, sortie 0.

- [ ] **Étape 2 : les gardes du dépôt**

Run (depuis la racine) :
```bash
for g in scripts/check-*.mjs; do node "$g" >/dev/null 2>&1 || echo "✗ $g"; done
```
Attendu : aucune ligne `✗`.

- [ ] **Étape 3 : écrire les notes du ticket**

Dans « Notes d'implémentation » de TCK-2477 : les modules créés ; l'écart assumé pour les comptes
cumulants (cf. Contraintes globales, avec le couple mesuré) ; les quatre ablations faites et leur
résultat ; `buildNavItems` conservé comme adaptateur déprécié jusqu'à TCK-2478. Passer `status:`
à `doing` (la branche n'est pas mergée), `updated: ` à la date du jour, puis
`node docs/backlog/ranger-tickets.mjs`.

- [ ] **Étape 4 : commit**

```bash
git add docs/backlog
git commit -m "docs(backlog): notes d'implémentation de TCK-2477

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Étape 5 : proposer la suite au porteur**

Demander l'accord avant tout push. Avec l'accord : `git push -u origin feat/coque-dynamique-par-persona`
puis `gh pr create --base dev`, la CI jouant les suites entières (jamais en local).
