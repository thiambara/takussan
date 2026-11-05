# TCK-2478 — Un menu par persona : plan d'implémentation

> **Pour les agents :** sous-compétence requise — `superpowers:subagent-driven-development` (recommandé)
> ou `superpowers:executing-plans`, tâche par tâche. Les étapes se cochent (`- [ ]`).
>
> ⚠ **Ne démarre qu'une fois TCK-2477 mergé sur `dev`** (règle 2 du backlog). Branche à tirer de
> `dev` à jour : `feat/menu-par-persona-tck-2478`.

**But :** remplacer les dispositions « miroir » de TCK-2477 par les huit dispositions validées par le
porteur le 2026-11-05 — action principale, groupes propres au persona, groupes repliés, « Plus »,
complément « Aussi … », espace suspendu, en-tête d'espace, carte du client, lien « Console
plateforme » — et faire entrer les pages d'administration d'agence au catalogue.

**Architecture :** le moteur de `src/lib/navigation/` rend désormais un `MenuCompose` structuré
(action, groupes, carte) au lieu d'une liste plate à sections. L'accès se juge sur les **rôles du
persona** pour la disposition et « Plus », et sur l'**union de l'espace** pour le complément.
`AppSidebar` rend ce `MenuCompose` ; `buildNavItems`, `avecSectionAgence` et `NavSection`
disparaissent ; les tests qui figeaient le menu par rôle sont réécrits par persona.

**Pile :** Next.js 16, React 19, TypeScript 5, vitest 4 + Testing Library, next-intl, Base UI
(`DropdownMenu`), lucide-react.

**Références :** [ADR-0089](../adr/0089-le-menu-de-app-se-derive-du-profil-actif.md) ·
[TCK-2478](../backlog/tickets/done/TCK-2478-dispositions-par-persona.md) (la table des dispositions) ·
plan précédent : [TCK-2477](2026-11-05-tck-2477-moteur-du-menu.md).

## Contraintes globales

- **Aucun droit ne change.** Les prédicats d'accès du catalogue restent ceux de TCK-2477 ; ce lot ne
  change que la PLACE des entrées. Une destination accessible et non placée tombe sous « Plus » ;
  une destination ouverte seulement par un autre profil de l'espace va dans le complément.
- La section d'agence ne se juge toujours que par `PAGES_ADMIN` (via `AccesAdmin.chemins`) : le
  catalogue n'en recopie aucune exigence.
- Espace suspendu : ni action principale, ni entrée d'écriture (`publier-bien`, `proposer-bien`,
  `publier-annonce`).
- Le cadenas (`isProRouteLocked`) reste appliqué par `AppSidebar`.
- Chaque clé i18n neuve en `fr`, `en`, `wo` (le `wo` = le français tel quel). Les clés
  `nav.sidebar.sections.*` devenues muettes sont SUPPRIMÉES des trois fichiers.
- `md:` n'est pas le bureau dans cette coque (TCK-505) : rien de neuf ne se pose en colonnes.
- Pas de `useMemo`/`useCallback` neuf (React Compiler). Aucune dépendance neuve.
- Jamais de suite entière en local : les fichiers touchés, puis la CI.
- Commits en français, préfixés, citant `TCK-2478`, avec `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Arbitrages de ce plan (validés par le porteur le 2026-11-05)

1. **Client pur** : Baux, Paiements, Interventions et États des lieux lui restent accessibles
   (prédicats inchangés) ; absents de sa disposition validée, ils tombent sous « Plus ».
2. **Locataire** : « Chercher un bien » ouvre son groupe « Mes recherches ».
3. **Carte « Mettre un bien en location »** : client ET locataire (même prédicat, `isCustomerOnly`).
4. **Hôte** : « Finances » de « Mes locations » = `/app/agency/finances` ; les paiements du
   bailleur (`/app/payments`) tombent sous « Plus », libellés « Paiements » pour ne pas porter deux
   fois « Finances ».

## Carte des fichiers

| Fichier | Rôle |
|---|---|
| Modifier `src/lib/navigation/types.ts` | `ContexteDeMenu` + `cheminsAdmin`, `agenceSuspendue` ; retrait de `NavSection`, `SECTION_*` |
| Modifier `src/lib/navigation/catalogue.ts` | + `taches`, `chercher-bien`, 10 pages d'agence ; champs `espace`, `ecriture`, `publique` |
| Modifier `src/lib/navigation/personas.ts` | + `rolesDuPersona`, `TYPES_DU_PERSONA` |
| Réécrire `src/lib/navigation/dispositions.ts` | les huit dispositions validées |
| Réécrire `src/lib/navigation/composer-menu.ts` | `composerMenu` → `MenuCompose` ; `avecTitres` |
| Créer `src/components/layout/EnTeteDEspace.tsx` | la carte d'espace en haut de la barre |
| Modifier `src/components/profile/ProfileSwitcher.tsx` | variante `carte` du déclencheur |
| Créer `src/components/layout/CarteDeMiseEnLocation.tsx` | la carte du client |
| Réécrire le rendu de `src/components/layout/AppSidebar.tsx` | rend `MenuCompose` |
| Modifier `src/components/layout/AppShell.tsx` | passe `agencySuspended` à la barre |
| Modifier `src/messages/{fr,en,wo}.json` | libellés neufs ; retrait de `nav.sidebar.sections` |
| Tests : voir chaque tâche | |

---

### Tâche 1 : le contexte, le catalogue élargi, les rôles du persona

**Fichiers :**
- Modifier : `takussan-web/src/lib/navigation/types.ts`, `catalogue.ts`, `personas.ts`
- Tests : `src/lib/navigation/__tests__/catalogue.test.ts`, `personas.test.ts`

**Interfaces :**
- Produit : `ContexteDeMenu { roles; capacites; cheminsAdmin?: readonly string[]; agenceSuspendue?: boolean }` ;
  `Destination` + `espace?: 'nav.admin'`, `ecriture?: true`, `publique?: true` ;
  `estOuverte(d: Destination, ctx: ContexteDeMenu): boolean` (accès ET non-écriture en espace suspendu) ;
  `rolesDuPersona(roles: UserRole[], persona: Persona): UserRole[]` ;
  `autresTypes(roles: UserRole[], persona: Persona): ProfileType[]`.

- [ ] **Étape 1 : écrire les tests qui échouent** — ajouter à `catalogue.test.ts` :

```ts
import { PAGES_ADMIN } from '@/lib/access/pages-admin';
import { estOuverte } from '../catalogue';

describe('TCK-2478 — les pages d’agence entrent au catalogue, jugées par la table', () => {
  it('chaque page de PAGES_ADMIN qui a une place au menu a sa destination', () => {
    const hrefs = new Set(CATALOGUE.map((d) => d.href));
    const manquantes = PAGES_ADMIN.filter((p) => p.menu !== null && !hrefs.has(p.chemin)).map((p) => p.chemin);
    expect(manquantes).toEqual([]);
  });

  it('une page d’agence n’est ouverte que si `cheminsAdmin` la contient', () => {
    const equipe = CATALOGUE.find((d) => d.href === '/app/agency/team')!;
    expect(estOuverte(equipe, { roles: ['agency_admin'], capacites: [], cheminsAdmin: [] })).toBe(false);
    expect(estOuverte(equipe, { roles: ['agency_admin'], capacites: [], cheminsAdmin: ['/app/agency/team'] })).toBe(true);
  });

  it('espace suspendu : aucune entrée d’écriture', () => {
    const ctx = { roles: ['agency_admin'] as UserRole[], capacites: ['properties.create'], agenceSuspendue: true };
    expect(CATALOGUE.filter((d) => estOuverte(d, ctx)).map((d) => d.id)).not.toContain('publier-bien');
    expect(CATALOGUE.filter((d) => estOuverte(d, { ...ctx, agenceSuspendue: false })).map((d) => d.id)).toContain('publier-bien');
  });
});
```

et remplacer `toHaveLength(29)` par `toHaveLength(41)` (29 + `taches` + `chercher-bien` + 10 pages
d'agence), son libellé devenant « compte les 41 destinations ».

Ajouter à `personas.test.ts` :

```ts
import { autresTypes, rolesDuPersona } from '../personas';

describe('TCK-2478 — les rôles du persona', () => {
  it('garde les rôles dérivés et le super-admin, et le seul type du persona', () => {
    expect(rolesDuPersona(['customer', 'tenant', 'agency_admin', 'owner'], 'admin-agence')).toEqual(['customer', 'tenant', 'agency_admin']);
    expect(rolesDuPersona(['customer', 'agency_admin', 'owner'], 'hote')).toEqual(['customer', 'agency_admin', 'owner']);
    expect(rolesDuPersona(['customer', 'super_admin', 'agent'], 'agent')).toEqual(['customer', 'super_admin', 'agent']);
  });

  it('nomme les autres profils de l’espace', () => {
    expect(autresTypes(['customer', 'agency_admin', 'owner'], 'admin-agence')).toEqual(['owner']);
    expect(autresTypes(['customer', 'agency_admin', 'owner'], 'hote')).toEqual([]);
  });
});
```

- [ ] **Étape 2 : lancer, constater l'échec**

Run : `npx vitest run src/lib/navigation/__tests__/catalogue.test.ts src/lib/navigation/__tests__/personas.test.ts`
Attendu : FAIL (`estOuverte`, `rolesDuPersona` absents ; 29 ≠ 41).

- [ ] **Étape 3 : élargir `types.ts`**

Remplacer `ContexteDeMenu` par :

```ts
export interface ContexteDeMenu {
  readonly roles: UserRole[];
  readonly capacites: readonly string[] | null;
  /** TCK-2478 — les pages d'administration que le profil actif peut ouvrir (`AccesAdmin.chemins`). */
  readonly cheminsAdmin?: readonly string[];
  /** TCK-2478 — l'agence du profil actif est suspendue (TCK-600) : aucune écriture au menu. */
  readonly agenceSuspendue?: boolean;
}
```

(`NavSection`, `SECTION_ORDER`, `SECTION_LABEL_KEYS` sont retirés en tâche 4, avec leurs derniers lecteurs.)

- [ ] **Étape 4 : élargir `catalogue.ts`**

Dans `interface Destination`, ajouter :

```ts
  /** Espace de la clé de libellé : `nav.sidebar` par défaut, `nav.admin` pour une page d'agence. */
  readonly espace?: 'nav.admin';
  /** Une entrée dont le seul objet est une écriture : retirée d'un espace suspendu (TCK-600). */
  readonly ecriture?: true;
  /** Une page du site public : son `href` se localise au rendu (`cheminLocalise`, ADR-0026). */
  readonly publique?: true;
```

Poser `ecriture: true` sur `publier-bien`, `proposer-bien`, `publier-annonce`. Ajouter les imports
`ListChecks`, `Search` (lucide) et `PAGES_ADMIN, type CheminAdmin` (`@/lib/access/pages-admin`), puis,
dans `TABLE`, après `credits` :

```ts
  // TCK-591 §3 — « Mes tâches » : même garde que son layout (`assertCanReachAgentArea`).
  { id: 'taches', href: '/app/tasks', cle: 'myTasks', icone: ListChecks, accessible: ({ roles }) => peutOuvrirMesBiens(roles) },
  // ADR-0089 — l'action principale du client : la recherche du site public.
  { id: 'chercher-bien', href: '/properties', cle: 'searchProperty', icone: Search, publique: true, accessible: client },
```

et, en fin de `TABLE` :

```ts
  pageAgence('agence-equipe', '/app/agency/team'),
  pageAgence('agence-roles', '/app/agency/roles'),
  pageAgence('agence-fiche', '/app/agency'),
  pageAgence('agence-kyc', '/app/agency/kyc'),
  pageAgence('agence-facturation', '/app/agency/billing'),
  pageAgence('agence-finances', '/app/agency/finances'),
  pageAgence('agence-moderation-avis', '/app/agency/moderation', 'reviewModeration'),
  pageAgence('agence-moderation-biens', '/app/agency/moderation/properties', 'propertyModeration'),
  pageAgence('agence-journal', '/app/agency/audit'),
  pageAgence('agence-integrations', '/app/agency/integrations'),
```

avec, au-dessus de `TABLE` :

```ts
/**
 * TCK-2478 (ADR-0089 §1, ADR-0064 §2) — une page d'agence au catalogue. Son libellé et son icône
 * viennent de `PAGES_ADMIN`, et son accès de `AccesAdmin.chemins` : la table reste le seul juge.
 */
function pageAgence<const I extends string>(id: I, chemin: CheminAdmin, compteur?: NavCounterKey) {
  const page = PAGES_ADMIN.find((p) => p.chemin === chemin);
  if (!page?.menu) throw new Error(`TCK-2478 — ${chemin} n'a pas de place au menu dans PAGES_ADMIN`);
  return {
    id,
    href: chemin,
    cle: page.menu.cle,
    icone: page.menu.icone,
    espace: 'nav.admin' as const,
    accessible: (ctx: ContexteDeMenu) => (ctx.cheminsAdmin ?? []).includes(chemin),
    ...(compteur ? { compteur } : {}),
  };
}
```

et, sous `iconeDe` :

```ts
/** Ouverte au compte : son prédicat d'accès, et jamais une écriture dans un espace suspendu. */
export function estOuverte(destination: Destination, ctx: ContexteDeMenu): boolean {
  return destination.accessible(ctx) && !(destination.ecriture && ctx.agenceSuspendue);
}
```

- [ ] **Étape 5 : `rolesDuPersona` et `autresTypes` dans `personas.ts`**

```ts
/** Les types de profil qu'un persona REPRÉSENTE. L'hôte en fusionne deux (TCK-497). */
export const TYPES_DU_PERSONA: Record<Persona, readonly ProfileType[]> = {
  client: [],
  locataire: [],
  bailleur: ['owner'],
  agent: ['agent'],
  'admin-agence': ['agency_admin'],
  hote: ['agency_admin', 'owner'],
  prestataire: ['service_provider'],
  plateforme: [],
};

const ROLES_TOUJOURS_GARDES: readonly UserRole[] = ['customer', 'tenant', 'super_admin'];

/**
 * ADR-0089 §2 — les rôles sur lesquels se juge la DISPOSITION : les rôles dérivés (`customer`,
 * `tenant`), le super-admin (global), et les seuls types que le persona représente. Le reste de
 * l'union de l'espace nourrit le complément « Aussi … ».
 */
export function rolesDuPersona(roles: UserRole[], persona: Persona): UserRole[] {
  const types: readonly UserRole[] = TYPES_DU_PERSONA[persona];
  return roles.filter((r) => ROLES_TOUJOURS_GARDES.includes(r) || types.includes(r));
}

/** Les autres types de profil que le compte tient dans l'espace, dans l'ordre de `PROFILE_TYPES`. */
export function autresTypes(roles: UserRole[], persona: Persona): ProfileType[] {
  return PROFILE_TYPES.filter((t) => roles.includes(t) && !TYPES_DU_PERSONA[persona].includes(t));
}
```

- [ ] **Étape 6 : lancer, constater le vert** — même commande qu'à l'étape 2. Attendu : PASS.

- [ ] **Étape 7 : ablation** — retirer `&& !(destination.ecriture && ctx.agenceSuspendue)` de
  `estOuverte` : « espace suspendu » rougit. Rétablir.

- [ ] **Étape 8 : commit** — `feat(web): les pages d'agence au catalogue, les rôles du persona (TCK-2478)`.

---

### Tâche 2 : les huit dispositions et la composition structurée

**Fichiers :**
- Réécrire : `src/lib/navigation/dispositions.ts`, `src/lib/navigation/composer-menu.ts`
- Réécrire : `src/lib/navigation/__tests__/composer-menu.test.ts`
- Créer : `src/lib/navigation/__tests__/dispositions-validees.test.ts`

**Interfaces :**
- Produit :

```ts
// dispositions.ts
export interface GroupeDeDisposition {
  readonly id: string;
  /** Clé sous `nav.sidebar.groupes`, ou `null` : groupe sans titre. */
  readonly titre: string | null;
  readonly entrees: readonly IdDestination[];
  readonly replie?: true;
}
export interface Disposition {
  /** La première destination OUVERTE de la liste ; vide : aucune action principale. */
  readonly action: readonly IdDestination[];
  /** Clé sous `nav.sidebar.actions` qui remplace le libellé de l'action. */
  readonly libelleAction?: string;
  /** Rendue en carte au pied de la barre, hors des groupes. */
  readonly carte?: IdDestination;
  readonly groupes: readonly GroupeDeDisposition[];
  /** Les entrées secondaires, dans l'ordre ; le reste des destinations ouvertes s'y ajoute. */
  readonly plus: readonly IdDestination[];
  /** Libellés propres au persona : clé dans l'espace de la destination. */
  readonly libelles?: Partial<Record<IdDestination, string>>;
}
export const DISPOSITIONS: Record<Persona, Disposition>;

// composer-menu.ts
export interface EntreeComposee {
  readonly id: IdDestination; readonly href: string; readonly labelKey: string;
  readonly labelSpace?: 'nav.admin'; readonly icon: LucideIcon; readonly groupe: string;
  readonly emphasized?: boolean; readonly counterKey?: NavCounterKey; readonly publique?: true;
}
export interface GroupeCompose {
  readonly id: string; readonly titre: string | null;
  /** Paramètres du titre (`{ profil }` pour « Aussi … »). */
  readonly titreValeurs?: Readonly<Record<string, string>>;
  readonly replie: boolean; readonly entrees: readonly EntreeComposee[];
}
export interface MenuCompose {
  readonly persona: Persona;
  readonly action: EntreeComposee | null;
  readonly carte: EntreeComposee | null;
  readonly groupes: readonly GroupeCompose[];
}
export function composerMenu(ctx: ContexteDeMenu, persona: Persona, disposition?: Disposition): MenuCompose;
export function avecTitres(groupes: readonly GroupeCompose[]): boolean;
export function entreesDuMenu(menu: MenuCompose): EntreeComposee[]; // groupes à plat, action exclue
```

- [ ] **Étape 1 : écrire le test des dispositions validées (la spec du porteur)**

`src/lib/navigation/__tests__/dispositions-validees.test.ts` — un compte « simple » par persona, et
ce qu'il doit voir, groupe par groupe :

```ts
import { describe, expect, it } from 'vitest';
import type { UserRole } from '@/types/user';
import { composerMenu } from '../composer-menu';
import type { Persona } from '../personas';
import type { ContexteDeMenu } from '../types';

const TOUTES_LES_PAGES_D_AGENCE = [
  '/app/agency/team', '/app/agency/roles', '/app/agency', '/app/agency/kyc', '/app/agency/billing',
  '/app/agency/finances', '/app/agency/moderation', '/app/agency/moderation/properties',
  '/app/agency/audit', '/app/agency/integrations',
];
const PAGES_DE_L_HOTE = ['/app/agency', '/app/agency/kyc', '/app/agency/billing', '/app/agency/finances', '/app/agency/integrations'];

const COMPTES: Record<Persona, ContexteDeMenu> = {
  client: { roles: ['customer'], capacites: null },
  locataire: { roles: ['customer', 'tenant'], capacites: null },
  bailleur: { roles: ['customer', 'owner'], capacites: null },
  agent: { roles: ['customer', 'agent'], capacites: ['properties.create'] },
  'admin-agence': { roles: ['customer', 'agency_admin'], capacites: ['properties.create'], cheminsAdmin: TOUTES_LES_PAGES_D_AGENCE },
  hote: { roles: ['customer', 'agency_admin', 'owner'], capacites: ['properties.create'], cheminsAdmin: PAGES_DE_L_HOTE },
  prestataire: { roles: ['customer', 'service_provider'], capacites: [] },
  plateforme: { roles: ['customer', 'super_admin'], capacites: [], cheminsAdmin: TOUTES_LES_PAGES_D_AGENCE },
};

/** `[action, carte, [groupe, titre, replié, ids…]…]` — lu sur le menu composé, rien d'autre. */
function lecture(persona: Persona) {
  const menu = composerMenu(COMPTES[persona], persona);
  return {
    action: menu.action ? [menu.action.id, menu.action.labelKey] : null,
    carte: menu.carte?.id ?? null,
    groupes: menu.groupes.map((g) => [g.id, g.titre, g.replie, ...g.entrees.map((e) => e.id)]),
  };
}

describe('TCK-2478 — les dispositions validées par le porteur le 2026-11-05', () => {
  it('client', () => {
    expect(lecture('client')).toEqual({
      action: ['chercher-bien', 'searchProperty'],
      carte: 'publier-annonce',
      groupes: [
        ['tete', null, false, 'tableau-de-bord', 'messagerie'],
        ['mes-recherches', 'mesRecherches', false, 'favoris', 'recherches'],
        ['mes-demarches', 'mesDemarches', false, 'visites', 'reservations'],
        // Arbitrage 1 : les quatre derniers restent accessibles au client pur.
        ['plus', 'plus', true, 'documents', 'avis', 'statistiques', 'maintenance', 'baux', 'paiements', 'etats-des-lieux'],
      ],
    });
  });

  it('locataire', () => {
    expect(lecture('locataire')).toEqual({
      action: ['paiements', 'payRent'],
      carte: 'publier-annonce',
      groupes: [
        ['tete', null, false, 'tableau-de-bord', 'messagerie'],
        ['mon-logement', 'monLogement', false, 'baux', 'paiements', 'maintenance', 'etats-des-lieux', 'documents'],
        ['mes-recherches', 'mesRecherches', true, 'chercher-bien', 'favoris', 'recherches', 'visites', 'reservations'],
        ['plus', 'plus', true, 'avis', 'statistiques'],
      ],
    });
  });

  it('bailleur', () => {
    expect(lecture('bailleur')).toEqual({
      action: ['proposer-bien', 'proposeProperty'],
      carte: null,
      groupes: [
        ['tete', null, false, 'tableau-de-bord', 'messagerie'],
        ['mon-patrimoine', 'monPatrimoine', false, 'mes-biens', 'baux', 'paiements', 'etats-des-lieux'],
        ['activite', 'activite', false, 'demandes', 'visites', 'reservations', 'calendrier', 'maintenance'],
        ['plus', 'plus', true, 'clients', 'avis', 'documents', 'statistiques', 'exports', 'favoris', 'recherches', 'taches'],
      ],
    });
  });

  it('agent', () => {
    expect(lecture('agent')).toEqual({
      action: ['publier-bien', 'publishProperty'],
      carte: null,
      groupes: [
        ['tete', null, false, 'tableau-de-bord', 'messagerie', 'taches'],
        ['prospection', 'prospection', false, 'demandes', 'clients', 'visites', 'calendrier'],
        ['catalogue', 'catalogue', false, 'mes-biens', 'reservations'],
        ['gestion', 'gestion', false, 'baux', 'entrees-en-attente', 'etats-des-lieux', 'maintenance', 'commissions'],
        ['plus', 'plus', true, 'avis', 'documents', 'statistiques', 'exports', 'favoris', 'recherches'],
      ],
    });
  });

  it('admin d’agence standard', () => {
    expect(lecture('admin-agence')).toEqual({
      action: ['publier-bien', 'publishProperty'],
      carte: null,
      groupes: [
        ['tete', null, false, 'tableau-de-bord', 'vue-agence', 'messagerie'],
        ['activite', 'activite', false, 'demandes', 'visites', 'reservations', 'calendrier'],
        ['portefeuille', 'portefeuille', false, 'mes-biens', 'proprietaires', 'clients', 'baux', 'entrees-en-attente'],
        ['finances', 'finances', false, 'agence-finances', 'commissions', 'credits', 'agence-facturation'],
        ['agence', 'agence', true, 'agence-equipe', 'agence-roles', 'agence-fiche', 'agence-kyc', 'agence-moderation-avis', 'agence-moderation-biens', 'agence-journal', 'agence-integrations'],
        ['pilotage', 'pilotage', true, 'statistiques', 'kpis', 'alertes', 'exports'],
        ['plus', 'plus', true, 'maintenance', 'carnet-prestataires', 'etats-des-lieux', 'documents', 'avis', 'taches', 'favoris', 'recherches'],
      ],
    });
  });

  it('hôte', () => {
    expect(lecture('hote')).toEqual({
      action: ['publier-bien', 'publishProperty'],
      carte: null,
      groupes: [
        ['tete', null, false, 'tableau-de-bord', 'messagerie'],
        ['mes-biens', 'mesBiens', false, 'mes-biens', 'reservations', 'visites', 'calendrier', 'demandes'],
        ['mes-locations', 'mesLocations', false, 'baux', 'agence-finances', 'etats-des-lieux', 'maintenance', 'carnet-prestataires'],
        ['mon-espace', 'monEspace', false, 'agence-fiche', 'agence-kyc', 'agence-facturation', 'credits', 'agence-integrations'],
        // Arbitrage 4 : les paiements du bailleur, libellés « Paiements ».
        ['plus', 'plus', true, 'clients', 'statistiques', 'exports', 'kpis', 'alertes', 'avis', 'documents', 'taches', 'favoris', 'recherches', 'paiements', 'commissions', 'entrees-en-attente', 'vue-agence', 'proprietaires'],
      ],
    });
  });

  it('prestataire : aucune action, quatre entrées en tête', () => {
    const { action, groupes } = lecture('prestataire');
    expect(action).toBeNull();
    expect(groupes[0]).toEqual(['tete', null, false, 'tableau-de-bord', 'maintenance', 'messagerie', 'documents']);
  });

  it('plateforme : la disposition de l’admin d’agence', () => {
    expect(lecture('plateforme').groupes.map((g) => g[0])).toEqual(lecture('admin-agence').groupes.map((g) => g[0]));
  });
});
```

> ⚠ L'ordre des entrées AJOUTÉES à « Plus » (celles qu'aucune disposition ne cite) est celui du
> catalogue. Si l'étape 4 rend un autre ordre pour une entrée ajoutée, c'est l'attente qu'on corrige
> — pas l'ordre du catalogue — après avoir vérifié qu'elle n'est pas une entrée validée mal placée.

- [ ] **Étape 2 : réécrire `composer-menu.test.ts`**

Remplacer son contenu par :

```ts
import { describe, expect, it } from 'vitest';
import { USER_ROLES, type UserRole } from '@/types/user';
import { CATALOGUE, estOuverte, type IdDestination } from '../catalogue';
import { avecTitres, composerMenu, entreesDuMenu } from '../composer-menu';
import { DISPOSITIONS, type Disposition } from '../dispositions';
import { PERSONAS, rolesDuPersona } from '../personas';
import type { ContexteDeMenu } from '../types';

const IDS = new Set<string>(CATALOGUE.map((d) => d.id));

function contextes(): ContexteDeMenu[] {
  const sortie: ContexteDeMenu[] = [];
  for (let masque = 0; masque < 1 << USER_ROLES.length; masque++) {
    const roles = USER_ROLES.filter((_, i) => masque & (1 << i)) as UserRole[];
    for (const capacites of [null, ['properties.create']]) sortie.push({ roles, capacites, cheminsAdmin: [] });
  }
  return sortie;
}

describe('TCK-2478 — les dispositions', () => {
  it.each(PERSONAS)('%s : tout identifiant cité existe au catalogue', (persona) => {
    const d = DISPOSITIONS[persona];
    const cites = [...d.action, ...(d.carte ? [d.carte] : []), ...d.plus, ...d.groupes.flatMap((g) => g.entrees)];
    for (const id of cites) expect(IDS.has(id), `${persona} — ${id}`).toBe(true);
  });

  it.each(PERSONAS)('%s : aucun identifiant n’est cité deux fois dans les groupes et « Plus »', (persona) => {
    const d = DISPOSITIONS[persona];
    const cites = [...d.plus, ...d.groupes.flatMap((g) => g.entrees)];
    expect(new Set(cites).size).toBe(cites.length);
  });
});

describe('TCK-2478 — composerMenu (ADR-0089 §4)', () => {
  it.each(PERSONAS)('%s : rien n’est perdu — persona d’un côté, complément de l’autre', (persona) => {
    for (const ctx of contextes()) {
      const menu = composerMenu(ctx, persona);
      const rendus = new Set([...entreesDuMenu(menu).map((e) => e.href), ...(menu.carte ? [menu.carte.href] : [])]);
      const attendus = new Set(CATALOGUE.filter((d) => estOuverte(d, ctx)).map((d) => d.href));
      // L'action seule peut porter un href que rien d'autre ne porte (« Proposer un bien »).
      if (menu.action) rendus.add(menu.action.href);
      expect(rendus, `${persona} / ${ctx.roles.join('+')}`).toEqual(attendus);
    }
  });

  it('une destination ouverte que la disposition ne place pas tombe sous « Plus », replié', () => {
    const disposition: Disposition = { action: [], groupes: [{ id: 'tete', titre: null, entrees: ['tableau-de-bord'] }], plus: [] };
    const menu = composerMenu({ roles: ['customer'], capacites: null }, 'client', disposition);
    const plus = menu.groupes.find((g) => g.id === 'plus');
    expect(plus?.replie).toBe(true);
    expect(plus?.entrees.map((e) => e.href)).toContain('/app/messages');
  });

  it('le complément « Aussi bailleur » ne porte que ce que seul le profil bailleur ouvre', () => {
    const ctx: ContexteDeMenu = { roles: ['customer', 'agency_admin', 'owner'], capacites: ['properties.create'], cheminsAdmin: [] };
    const aussi = composerMenu(ctx, 'admin-agence').groupes.find((g) => g.id === 'aussi');
    expect(aussi).toMatchObject({ titre: 'aussi', titreValeurs: { profil: 'owner' }, replie: true });
    const attendus = CATALOGUE.filter(
      (d) => estOuverte(d, ctx) && !estOuverte(d, { ...ctx, roles: rolesDuPersona(ctx.roles, 'admin-agence') }),
    ).map((d) => d.id);
    expect(aussi?.entrees.map((e) => e.id)).toEqual(attendus);
    expect(attendus).toContain('paiements');
  });

  it('espace suspendu : ni action principale ni entrée d’écriture', () => {
    const ctx: ContexteDeMenu = { roles: ['customer', 'agency_admin'], capacites: ['properties.create'], cheminsAdmin: [], agenceSuspendue: true };
    const menu = composerMenu(ctx, 'admin-agence');
    expect(menu.action).toBeNull();
    expect(entreesDuMenu(menu).map((e) => e.id)).not.toContain('publier-bien');
  });

  it('l’action principale prend la première destination ouverte de sa liste', () => {
    const menu = composerMenu({ roles: ['customer', 'agent'], capacites: [] }, 'agent');
    expect(menu.action).toBeNull(); // ni « Publier » (sans properties.create) ni « Proposer » (pas bailleur)
  });

  it('les titres ne paraissent que si un groupe titré porte deux entrées ou plus (TCK-377)', () => {
    const g = (titre: string | null, n: number) => ({ id: String(titre), titre, replie: false, entrees: Array.from({ length: n }) as never[] });
    expect(avecTitres([g(null, 4)])).toBe(false);
    expect(avecTitres([g(null, 4), g('plus', 1)])).toBe(false);
    expect(avecTitres([g(null, 2), g('plus', 2)])).toBe(true);
  });

  it('un identifiant inconnu est ignoré', () => {
    const disposition: Disposition = { action: [], groupes: [{ id: 'tete', titre: null, entrees: ['disparue' as IdDestination] }], plus: [] };
    expect(() => composerMenu({ roles: ['customer'], capacites: null }, 'client', disposition)).not.toThrow();
  });
});
```

- [ ] **Étape 3 : lancer, constater l'échec**

Run : `npx vitest run src/lib/navigation/__tests__/composer-menu.test.ts src/lib/navigation/__tests__/dispositions-validees.test.ts`
Attendu : FAIL (exports `avecTitres`, `entreesDuMenu` absents ; formes de `Disposition`).

- [ ] **Étape 4 : réécrire `dispositions.ts`**

```ts
import type { IdDestination } from './catalogue';
import type { Persona } from './personas';

/**
 * TCK-2478 (ADR-0089 §3) — la disposition du menu de chaque persona, validée par le porteur le
 * 2026-11-05 (table de TCK-2478). Ce fichier ORDONNE, il n'accorde rien : chaque entrée n'est rendue
 * que si le catalogue l'ouvre au compte, et une destination ouverte que rien ne place tombe sous
 * « Plus ».
 *
 * `Record<Persona, …>` est EXHAUSTIF : un persona ajouté sans disposition casse `tsc`.
 */
export interface GroupeDeDisposition {
  readonly id: string;
  /** Clé sous `nav.sidebar.groupes`, ou `null` : groupe sans titre. */
  readonly titre: string | null;
  readonly entrees: readonly IdDestination[];
  readonly replie?: true;
}

export interface Disposition {
  readonly action: readonly IdDestination[];
  readonly libelleAction?: string;
  readonly carte?: IdDestination;
  readonly groupes: readonly GroupeDeDisposition[];
  readonly plus: readonly IdDestination[];
  readonly libelles?: Partial<Record<IdDestination, string>>;
}

const PUBLIER: readonly IdDestination[] = ['publier-bien', 'proposer-bien'];

const ADMIN_AGENCE: Disposition = {
  action: PUBLIER,
  groupes: [
    { id: 'tete', titre: null, entrees: ['tableau-de-bord', 'vue-agence', 'messagerie'] },
    { id: 'activite', titre: 'activite', entrees: ['demandes', 'visites', 'reservations', 'calendrier'] },
    { id: 'portefeuille', titre: 'portefeuille', entrees: ['mes-biens', 'proprietaires', 'clients', 'baux', 'entrees-en-attente'] },
    { id: 'finances', titre: 'finances', entrees: ['agence-finances', 'commissions', 'credits', 'agence-facturation'] },
    {
      id: 'agence',
      titre: 'agence',
      replie: true,
      entrees: [
        'agence-equipe', 'agence-roles', 'agence-fiche', 'agence-kyc',
        'agence-moderation-avis', 'agence-moderation-biens', 'agence-journal', 'agence-integrations',
      ],
    },
    { id: 'pilotage', titre: 'pilotage', replie: true, entrees: ['statistiques', 'kpis', 'alertes', 'exports'] },
  ],
  plus: ['maintenance', 'carnet-prestataires', 'etats-des-lieux', 'documents', 'avis'],
  libelles: { 'mes-biens': 'allProperties' },
};

export const DISPOSITIONS: Record<Persona, Disposition> = {
  client: {
    action: ['chercher-bien'],
    carte: 'publier-annonce',
    groupes: [
      { id: 'tete', titre: null, entrees: ['tableau-de-bord', 'messagerie'] },
      { id: 'mes-recherches', titre: 'mesRecherches', entrees: ['favoris', 'recherches'] },
      { id: 'mes-demarches', titre: 'mesDemarches', entrees: ['visites', 'reservations'] },
    ],
    plus: ['documents', 'avis', 'statistiques'],
  },
  locataire: {
    action: ['paiements'],
    libelleAction: 'payRent',
    carte: 'publier-annonce',
    groupes: [
      { id: 'tete', titre: null, entrees: ['tableau-de-bord', 'messagerie'] },
      { id: 'mon-logement', titre: 'monLogement', entrees: ['baux', 'paiements', 'maintenance', 'etats-des-lieux', 'documents'] },
      {
        id: 'mes-recherches',
        titre: 'mesRecherches',
        replie: true,
        entrees: ['chercher-bien', 'favoris', 'recherches', 'visites', 'reservations'],
      },
    ],
    plus: ['avis', 'statistiques'],
    libelles: { baux: 'myLease', maintenance: 'interventions' },
  },
  bailleur: {
    action: PUBLIER,
    groupes: [
      { id: 'tete', titre: null, entrees: ['tableau-de-bord', 'messagerie'] },
      { id: 'mon-patrimoine', titre: 'monPatrimoine', entrees: ['mes-biens', 'baux', 'paiements', 'etats-des-lieux'] },
      { id: 'activite', titre: 'activite', entrees: ['demandes', 'visites', 'reservations', 'calendrier', 'maintenance'] },
    ],
    plus: ['clients', 'avis', 'documents', 'statistiques', 'exports', 'favoris', 'recherches'],
    libelles: { maintenance: 'interventions' },
  },
  agent: {
    action: PUBLIER,
    groupes: [
      { id: 'tete', titre: null, entrees: ['tableau-de-bord', 'messagerie', 'taches'] },
      { id: 'prospection', titre: 'prospection', entrees: ['demandes', 'clients', 'visites', 'calendrier'] },
      { id: 'catalogue', titre: 'catalogue', entrees: ['mes-biens', 'reservations'] },
      { id: 'gestion', titre: 'gestion', entrees: ['baux', 'entrees-en-attente', 'etats-des-lieux', 'maintenance', 'commissions'] },
    ],
    plus: ['avis', 'documents', 'statistiques', 'exports', 'favoris', 'recherches'],
    libelles: { maintenance: 'interventions' },
  },
  'admin-agence': ADMIN_AGENCE,
  hote: {
    action: PUBLIER,
    groupes: [
      { id: 'tete', titre: null, entrees: ['tableau-de-bord', 'messagerie'] },
      { id: 'mes-biens', titre: 'mesBiens', entrees: ['mes-biens', 'reservations', 'visites', 'calendrier', 'demandes'] },
      { id: 'mes-locations', titre: 'mesLocations', entrees: ['baux', 'agence-finances', 'etats-des-lieux', 'maintenance', 'carnet-prestataires'] },
      { id: 'mon-espace', titre: 'monEspace', entrees: ['agence-fiche', 'agence-kyc', 'agence-facturation', 'credits', 'agence-integrations'] },
    ],
    plus: ['clients', 'statistiques', 'exports', 'kpis', 'alertes', 'avis', 'documents'],
    libelles: { maintenance: 'interventions', paiements: 'payments', 'agence-facturation': 'payouts' },
  },
  prestataire: {
    action: [],
    groupes: [{ id: 'tete', titre: null, entrees: ['tableau-de-bord', 'maintenance', 'messagerie', 'documents'] }],
    plus: [],
  },
  plateforme: ADMIN_AGENCE,
};
```

- [ ] **Étape 5 : réécrire `composer-menu.ts`**

```ts
import type { LucideIcon } from 'lucide-react';
import { CATALOGUE, cleDe, estOuverte, iconeDe, type Destination, type IdDestination } from './catalogue';
import { DISPOSITIONS, type Disposition } from './dispositions';
import { autresTypes, rolesDuPersona, type Persona } from './personas';
import type { ContexteDeMenu, NavCounterKey } from './types';

export interface EntreeComposee {
  readonly id: IdDestination;
  readonly href: string;
  readonly labelKey: string;
  readonly labelSpace?: 'nav.admin';
  readonly icon: LucideIcon;
  readonly groupe: string;
  readonly emphasized?: boolean;
  readonly counterKey?: NavCounterKey;
  readonly publique?: true;
}

export interface GroupeCompose {
  readonly id: string;
  readonly titre: string | null;
  readonly titreValeurs?: Readonly<Record<string, string>>;
  readonly replie: boolean;
  readonly entrees: readonly EntreeComposee[];
}

export interface MenuCompose {
  readonly persona: Persona;
  readonly action: EntreeComposee | null;
  readonly carte: EntreeComposee | null;
  readonly groupes: readonly GroupeCompose[];
}

type DestinationDuCatalogue = Destination & { readonly id: IdDestination };

const PAR_ID: ReadonlyMap<string, DestinationDuCatalogue> = new Map(CATALOGUE.map((d) => [d.id, d]));

/**
 * TCK-2478 (ADR-0089 §4) — LE menu : une fonction pure du compte, du persona et de sa disposition.
 *
 * 1. L'action principale : la première destination OUVERTE de `disposition.action`. Elle ne prend
 *    pas l'`href` : le locataire garde « Paiements » dans son groupe sous « Payer mon loyer ».
 * 2. Les groupes, puis « Plus » (ses entrées citées, puis toute destination ouverte au persona que
 *    rien ne place) — jugés sur les RÔLES DU PERSONA ; une seule entrée par `href`.
 * 3. Le complément « Aussi … » : ce que l'union de l'espace ouvre et que le persona n'ouvre pas.
 * 4. Un groupe vide ne se rend pas ; un identifiant inconnu est ignoré.
 */
export function composerMenu(
  ctx: ContexteDeMenu,
  persona: Persona,
  disposition: Disposition = DISPOSITIONS[persona],
): MenuCompose {
  const ctxPersona: ContexteDeMenu = { ...ctx, roles: rolesDuPersona(ctx.roles, persona) };
  const hrefsPris = new Set<string>();
  const places = new Set<string>([...disposition.action, ...(disposition.carte ? [disposition.carte] : [])]);

  const composer = (d: DestinationDuCatalogue, groupe: string, cle?: string): EntreeComposee => ({
    id: d.id,
    href: d.href,
    labelKey: cle ?? disposition.libelles?.[d.id] ?? cleDe(d, ctx),
    icon: iconeDe(d, ctx),
    groupe,
    ...(d.espace ? { labelSpace: d.espace } : {}),
    ...(d.misEnAvant ? { emphasized: true } : {}),
    ...(d.compteur ? { counterKey: d.compteur } : {}),
    ...(d.publique ? { publique: true as const } : {}),
  });

  const prendre = (d: DestinationDuCatalogue | undefined, groupe: string, c: ContexteDeMenu): EntreeComposee | null => {
    if (!d || hrefsPris.has(d.href) || !estOuverte(d, c)) return null;
    hrefsPris.add(d.href);
    return composer(d, groupe);
  };

  const actionDestination = disposition.action.map((id) => PAR_ID.get(id)).find((d) => d && estOuverte(d, ctxPersona));
  const action = actionDestination ? composer(actionDestination, 'action', disposition.libelleAction) : null;

  const carteDestination = disposition.carte ? PAR_ID.get(disposition.carte) : undefined;
  const carte = carteDestination && estOuverte(carteDestination, ctxPersona) ? composer(carteDestination, 'carte') : null;

  const groupes: GroupeCompose[] = [];
  for (const groupe of disposition.groupes) {
    const entrees: EntreeComposee[] = [];
    for (const id of groupe.entrees) {
      places.add(id);
      const entree = prendre(PAR_ID.get(id), groupe.id, ctxPersona);
      if (entree) entrees.push(entree);
    }
    groupes.push({ id: groupe.id, titre: groupe.titre, replie: groupe.replie === true, entrees });
  }

  const plus: EntreeComposee[] = [];
  for (const id of disposition.plus) {
    places.add(id);
    const entree = prendre(PAR_ID.get(id), 'plus', ctxPersona);
    if (entree) plus.push(entree);
  }
  for (const d of CATALOGUE) {
    if (places.has(d.id)) continue;
    const entree = prendre(d, 'plus', ctxPersona);
    if (entree) plus.push(entree);
  }
  groupes.push({ id: 'plus', titre: 'plus', replie: true, entrees: plus });

  const aussi: EntreeComposee[] = [];
  for (const d of CATALOGUE) {
    if (estOuverte(d, ctxPersona)) continue;
    const entree = prendre(d, 'aussi', ctx);
    if (entree) aussi.push(entree);
  }
  const autres = autresTypes(ctx.roles, persona);
  groupes.push({
    id: 'aussi',
    titre: autres.length === 1 ? 'aussi' : 'aussiPlusieurs',
    ...(autres.length === 1 ? { titreValeurs: { profil: autres[0] } } : {}),
    replie: true,
    entrees: aussi,
  });

  return { persona, action, carte, groupes: groupes.filter((g) => g.entrees.length > 0) };
}

/** TCK-377 — un titre ne paraît que s'il sépare : au moins un groupe titré de deux entrées. */
export function avecTitres(groupes: readonly GroupeCompose[]): boolean {
  if (groupes.length <= 1) return false;
  return groupes.some((g) => g.titre !== null && g.entrees.length > 1);
}

/** Les entrées des groupes, à plat (l'action et la carte n'en sont pas). */
export function entreesDuMenu(menu: MenuCompose): EntreeComposee[] {
  return menu.groupes.flatMap((g) => g.entrees);
}
```

- [ ] **Étape 6 : lancer, constater le vert** — commande de l'étape 3. Attendu : PASS. Puis
  `npx vitest run src/lib/navigation` : `arborescence.test.ts` doit rester vert (`/app/tasks`
  quitte `HORS_MENU` à l'étape suivante — s'il rougit sur « HORS_MENU ne garde … une page déjà au
  menu », c'est attendu).

- [ ] **Étape 7 : retirer `/app/tasks` de `HORS_MENU`** — l'entrée est au catalogue. Relancer
  `npx vitest run src/lib/navigation/__tests__/arborescence.test.ts` : PASS.

- [ ] **Étape 8 : ablations**
  1. Dans `composerMenu`, juger les groupes sur `ctx` au lieu de `ctxPersona` : le test du complément
     rougit (« Aussi bailleur » vide, « Paiements » remonté chez l'admin).
  2. Retirer la boucle `for (const d of CATALOGUE) { if (places.has …` : « tombe sous Plus » rougit.
  Rétablir.

- [ ] **Étape 9 : commit** — `feat(web): les huit dispositions validées et le menu composé (TCK-2478)`.

---

### Tâche 3 : les libellés

**Fichiers :** `src/messages/fr.json`, `en.json`, `wo.json`

- [ ] **Étape 1 : ajouter sous `nav.sidebar`** (le `wo` reprend le `fr` tel quel) :

| Clé | fr | en |
|---|---|---|
| `myTasks` | Mes tâches | My tasks |
| `searchProperty` | Chercher un bien | Find a property |
| `myLease` | Mon bail | My lease |
| `allProperties` | Biens | Properties |
| `actions.payRent` | Payer mon loyer | Pay my rent |
| `groupes.mesRecherches` | Mes recherches | My searches |
| `groupes.mesDemarches` | Mes démarches | My requests |
| `groupes.monLogement` | Mon logement | My home |
| `groupes.monPatrimoine` | Mon patrimoine | My portfolio |
| `groupes.activite` | Activité | Activity |
| `groupes.prospection` | Prospection | Prospecting |
| `groupes.catalogue` | Catalogue | Listings |
| `groupes.gestion` | Gestion | Management |
| `groupes.portefeuille` | Portefeuille | Portfolio |
| `groupes.finances` | Finances | Finances |
| `groupes.agence` | Agence | Agency |
| `groupes.pilotage` | Pilotage | Insights |
| `groupes.mesBiens` | Mes biens | My properties |
| `groupes.mesLocations` | Mes locations | My rentals |
| `groupes.monEspace` | Mon espace | My space |
| `groupes.plus` | Plus | More |
| `groupes.aussi` | `{profil, select, agency_admin {Aussi administrateur} owner {Aussi bailleur} agent {Aussi agent} service_provider {Aussi prestataire} other {Aussi}}` | `{profil, select, agency_admin {Also administrator} owner {Also landlord} agent {Also agent} service_provider {Also service provider} other {Also}}` |
| `groupes.aussiPlusieurs` | Vos autres profils | Your other profiles |
| `personas.client` | Client | Client |
| `personas.locataire` | Locataire | Tenant |
| `personas.bailleur` | Bailleur | Landlord |
| `personas.agent` | Agent | Agent |
| `personas.admin-agence` | Administrateur | Administrator |
| `personas.hote` | Hôte | Host |
| `personas.prestataire` | Prestataire | Service provider |
| `personas.plateforme` | Plateforme | Platform |
| `enTete.changer` | Changer d’espace | Switch space |
| `carteLocation.titre` | Mettre un bien en location | List a property |
| `carteLocation.texte` | Publiez votre premier bien en quelques minutes. | Publish your first property in minutes. |
| `console` | Console plateforme | Platform console |
| `groupeReplie` | `{titre} — afficher` | `{titre} — show` |

Sous `nav.admin` : `payouts` — « Reversements » / « Payouts ».

**Supprimer** `nav.sidebar.sections` des trois fichiers (ses derniers lecteurs partent en tâche 4).

- [ ] **Étape 2 :** `npm run check:i18n` — attendu : sortie 0 (parité tenue). Commit avec la tâche 4.

---

### Tâche 4 : la barre rend le menu composé

**Fichiers :**
- Réécrire le rendu : `src/components/layout/AppSidebar.tsx`
- Modifier : `src/components/layout/AppShell.tsx` (passe `agencySuspended` aux deux `AppSidebar`)
- Modifier : `src/lib/navigation/types.ts` (retrait de `NavSection`, `SECTION_ORDER`, `SECTION_LABEL_KEYS`)
- Créer : `src/components/layout/CarteDeMiseEnLocation.tsx`
- Tests : voir tâche 6 (ils sont réécrits APRÈS, contre la spec de la tâche 2 : ce lot change
  délibérément le menu).

**Interfaces :**
- Consomme : `composerMenu`, `avecTitres`, `entreesDuMenu`, `MenuCompose` (tâche 2) ; `resoudrePersona`.
- Produit : `AppSidebar` (props + `agencySuspended?: boolean`), exports conservés : `AppSidebar`,
  `countersToPoll(entrees: readonly { counterKey?: NavCounterKey; locked?: boolean }[])`.
  Retirés : `buildNavItems`, `avecSectionAgence`, `groupBySection`, `withSectionHeadings`,
  `NavItem`, `NavSection`, `SECTION_ORDER`, `SECTION_LABEL_KEYS`.

- [ ] **Étape 1 : la carte du client** — `CarteDeMiseEnLocation.tsx`, sur le patron visuel de
  `ProUpgradeCard` (même bordure, même rayon, `Sparkles` → `Home`), lien vers `entree.href`,
  `onClick={onNavigate}`, titre `nav.sidebar.carteLocation.titre`, texte `…texte`. Props :
  `{ readonly href: string; readonly onNavigate?: () => void }`.

- [ ] **Étape 2 : réécrire le corps d'`AppSidebar`**

Dans le composant, à la place du calcul `navItems` / `groups` / `withHeadings` :

```tsx
  const persona = resoudrePersona({
    roles: user.roles,
    typeProfilActif: typeProfilActif ?? null,
    agenceIndividuelle: accesAdmin.espaceIndividuel || agencyIsStandard === false,
  });
  const menu = composerMenu(
    { roles: user.roles, capacites, cheminsAdmin: accesAdmin.chemins, agenceSuspendue: agencySuspended },
    persona,
  );
  const verrouille = (href: string) => isProRouteLocked(user, agencyIsStandard, href);
  const entrees = entreesDuMenu(menu).map((e) => ({ ...e, locked: verrouille(e.href) }));
  const counted = countersToPoll(entrees);
  // … compteurs et solde inchangés, lus sur `entrees` …
  const activeHref = resolveActiveHref(pathname, entrees.map((e) => e.href), APP_EXACT_ROOTS);
  const titres = avecTitres(menu.groupes);
```

Rendu, dans l'ordre, à l'intérieur de l'`aside` :

1. le logo du tiroir (inchangé) ;
2. `<EnTeteDEspace …/>` (tâche 5 — d'ici là, rien) ;
3. l'action principale, si `menu.action` : un `Link` plein (`bg-primary text-primary-foreground`,
   `rounded-md px-3 py-2 text-sm font-semibold`, `FOCUS_RING`, icône à gauche), libellé résolu
   comme une entrée (`nav.sidebar.actions.<cle>` si la clé vient de `libelleAction`, sinon la clé de
   l'entrée), `href` localisé si `publique` (`cheminLocalise(href, useLocale())`) ;
4. le `<nav>` (inchangé : `aria-label`, `relative`, défilement) avec un bloc par groupe :
   - titre affiché si `titres && groupe.titre !== null` : `nav.sidebar.groupes.<titre>` (avec
     `titreValeurs`) ;
   - un groupe `replie` se rend repliable : le titre devient un `<button>` (`aria-expanded`,
     `aria-controls` vers la liste, chevron qui pivote) ; état local `useState(groupe.replie && !contientLActif)`,
     où `contientLActif = groupe.entrees.some((e) => e.href === activeHref)` (AC4 : l'entrée active
     n'est jamais cachée). Repliée, la liste a l'attribut `hidden` ;
   - les entrées par `SidebarItem`, comme aujourd'hui (`labelSpace`, compteur, valeur des crédits,
     cadenas) — `href` localisé si `publique` ;
   - `role="group"` + `aria-labelledby` quand un titre est rendu (inchangé) ;
5. au pied : la carte de `menu.carte` (`CarteDeMiseEnLocation`), la `ProUpgradeCard` (inchangée),
   pour le persona `plateforme` un lien « Console plateforme » vers `/super-admin`
   (`nav.sidebar.console`, icône `ShieldCheck`, style d'une entrée), puis `SidebarUserFooter`.

Supprimer `buildNavItems`, `avecSectionAgence`, `groupBySection`, `withSectionHeadings`,
`COMPTEUR_DE_PAGE` (les compteurs de modération sont au catalogue), `NavItem` (remplacé par
`EntreeComposee & { locked?: boolean }`), et les ré-exports de `types.ts`. Retirer de `types.ts`
`NavSection`, `SECTION_ORDER`, `SECTION_LABEL_KEYS`.

- [ ] **Étape 3 :** `AppShell.tsx` — passer `agencySuspended={agencySuspended}` aux deux
  `<AppSidebar …>`.

- [ ] **Étape 4 :** `npx tsc --noEmit` — attendu : les seules erreurs sont dans les fichiers de test
  qui importent les symboles retirés (réécrits en tâche 6). Les lister, n'en corriger aucune ici.

- [ ] **Étape 5 : commit** (avec la tâche 3) —
  `feat(web): la barre de /app rend le menu du persona — action, groupes repliables, carte (TCK-2478)`.

---

### Tâche 5 : l'en-tête d'espace

**Fichiers :**
- Modifier : `src/components/profile/ProfileSwitcher.tsx` (prop `variante?: 'barre' | 'carte'`)
- Créer : `src/components/layout/EnTeteDEspace.tsx`
- Test : `src/components/layout/__tests__/EnTeteDEspace.test.tsx`

**Interfaces :**
- Produit : `EnTeteDEspace({ user, persona }: { readonly user: User; readonly persona: Persona })`.

- [ ] **Étape 1 : écrire le test qui échoue** — `EnTeteDEspace.test.tsx`, en moquant
  `@/hooks/useProfiles` (`useMyProfiles`, `useSwitchActiveProfile`) comme le fait
  `src/components/profile/__tests__/ProfileSwitcher.test.tsx` :
  1. deux profils (admin `agency_admin:12` « Agence Teranga » actif, bailleur `owner:3`) : un bouton
     dont le nom accessible contient « Agence Teranga » et « Administrateur » ; `userEvent.keyboard`
     (Tab jusqu'à lui, Entrée) ouvre le menu, qui liste le profil bailleur ;
  2. un seul profil : une carte statique (aucun bouton) nommant l'agence et le persona ;
  3. aucun profil (client) : une carte statique « Client », sans agence ;
  4. chargement : un squelette `aria-hidden`, aucun texte.

- [ ] **Étape 2 : lancer, constater l'échec.**

- [ ] **Étape 3 : implémenter.**
  - `ProfileSwitcher` reçoit `variante = 'barre'` par défaut (rendu actuel inchangé) ; en
    `'carte'`, le déclencheur est une carte pleine largeur (`w-full rounded-lg border bg-muted/60
    px-3 py-2 text-left`, texte `text-foreground`), deux lignes : le nom de l'agence en gras, le
    libellé du persona (`nav.sidebar.personas.<persona>`, reçu en prop `libelle`) en
    `text-xs text-muted-foreground`, chevron à droite ; `aria-label` = `enTete.changer` + nom + libellé.
    Les cas « un seul profil » et « aucun profil » de la variante `carte` rendent la même carte sans
    bouton ni chevron, et **visibles à toutes les largeurs** (la variante `barre` garde son `lg:inline-flex`).
  - `EnTeteDEspace` : `<div className="px-3 pb-2 md:pt-5">` + `<ProfileSwitcher variante="carte" …/>`.
  - Dans `AppSidebar`, le monter en tête du bloc qui précède le `<nav>` ; le `md:pt-5` du `<nav>`
    passe à l'en-tête.

- [ ] **Étape 4 : lancer, constater le vert** ; relancer `src/components/profile/__tests__/` (la
  variante `barre` ne doit pas bouger).

- [ ] **Étape 5 : ablation** — rendre la variante `carte` avec le `hidden lg:inline-flex` de la
  barre : le cas 2 rougit (carte invisible sous `lg` → absente du tiroir). Rétablir.

- [ ] **Étape 6 : commit** — `feat(web): l'en-tête d'espace de la barre, qui ouvre le sélecteur de profil (TCK-2478)`.

---

### Tâche 6 : réécrire les tests du menu par persona

Les tests d'avant figeaient le menu PAR RÔLE, ce que ce lot change exprès. Chaque test retiré est
remplacé par sa version persona ; aucune garde n'est perdue. L'écart est écrit dans les notes du
ticket (étape 7).

**Fichiers :**
- `src/components/layout/__tests__/AppSidebar.test.tsx`
- `src/components/layout/__tests__/AppSidebar.audience.test.tsx`
- `src/components/layout/__tests__/AppSidebar.proposition.test.ts` → **supprimé**, ses sept cas
  déplacés dans `src/lib/navigation/__tests__/catalogue.test.ts` (ils jugent `publier-bien` /
  `proposer-bien` par `estOuverte`, mêmes comptes, mêmes attentes)
- `src/components/layout/__tests__/AppSidebar.acces-admin.test.tsx` → **supprimé** (`avecSectionAgence`
  n'existe plus) ; ses trois propriétés sont dans `catalogue.test.ts` (tâche 1) et
  `dispositions-validees.test.ts` (ordre de la section « Agence »)
- `src/components/layout/__tests__/AppSidebar.section-agence.test.tsx`
- `src/lib/__tests__/roles-derives.test.ts`
- `src/components/dashboard/admin/__tests__/AgencyQueues.source-unique.test.tsx` (relire : il monte
  la barre et lit les compteurs de modération ; les entrées sont désormais dans « Agence », repliée
  — ouvrir le groupe avant de lire, ou rendre sur `/app/agency/moderation`, qui l'ouvre)

- [ ] **Étape 1 : `AppSidebar.test.tsx`**
  - `renderSidebar(roles, at, options?)` passe `typeProfilActif` et `agencySuspended` facultatifs.
  - AC1/AC2/AC3 (surlignage) : inchangés, sauf le libellé attendu sur `/app/properties/42` chez
    l'admin d'agence : « Biens » (`allProperties`) ; « Maintenance » et « États des lieux » sont
    dans « Plus », qui s'ouvre sur la page active (c'est l'AC4 du ticket, désormais éprouvée ici).
  - Supprimer `HREFS_PAR_ROLE`, le bloc « AC4 — le regroupement ne change AUCUN droit », le bloc
    « TCK-646 — six entrées en tête » et les tests d'ordre des en-têtes : ils sont remplacés par
    `dispositions-validees.test.ts` (fonction pure) et par le bloc suivant (composant monté).
  - Ajouter `describe('TCK-2478 — la barre montée suit la disposition du persona')` :
    pour chacun des huit comptes de `dispositions-validees.test.ts` (même table, recopiée — pas
    importée, pour que les deux ne se valident pas l'un l'autre), sur `/app` : (a) le premier lien
    du `<nav>` précédé de l'action dont le libellé est attendu (« Chercher un bien », « Payer mon
    loyer », « Proposer un bien à mon agence », « Publier un bien », aucune chez le prestataire) ;
    (b) les titres de groupe rendus, dans l'ordre ; (c) les groupes repliés ont `aria-expanded="false"`
    et leur liste `hidden`.
  - AC5/AC6 (compteurs) : `sondesAttendues` dérive désormais de la table par PERSONA (même
    principe : écrite à la main, jamais tirée de `countersToPoll`) ; « la branche « pas de sondage »
    est atteinte par un rôle réel » reste, sur le prestataire.
  - TCK-642 (solde de crédits) : inchangé, sur l'admin d'agence (Crédits est dans « Finances »).
  - Ajouter : espace suspendu (`agencySuspended`) → aucun lien « Publier un bien » ; plateforme →
    lien « Console plateforme » vers `/super-admin` ; client → carte « Mettre un bien en location »
    vers `/publish`, et aucune ligne de menu `/publish`.

- [ ] **Étape 2 : `AppSidebar.audience.test.tsx`** — garder le bloc TCK-495 (`TYPE_MAP`) en
  remplaçant `buildNavItems(...)` par
  `entreesDuMenu(composerMenu({ roles, capacites: ['properties.create'] }, resoudrePersona({ roles })))`.
  Remplacer « table des href par rôle » par sa version persona : chaque persona voit EXACTEMENT
  l'ensemble de `href` de sa table (union des groupes + action + carte). Le cas « un compte
  prestataire ET locataire garde ses baux » reste : `['service_provider','tenant','customer']`
  → les baux sont dans « Plus » ou dans le menu (le test lit l'ensemble rendu).

- [ ] **Étape 3 : `AppSidebar.section-agence.test.tsx`** — « Administration » devient le groupe
  « Agence » (replié) chez l'admin standard, et ses pages se répartissent entre « Finances »
  (Finances, Facturation) et « Agence » (huit pages) ; chez l'admin `individual` (persona hôte),
  « Mon espace » porte Agence, KYC, Reversements, Crédits, Intégrations, et Finances est dans « Mes
  locations ». Les blocs « files de modération », « surlignage dans la section », « carte Passer en
  agence », « tiroir mobile », « deux entrées ne portent jamais le même libellé » restent, attentes
  de libellé de groupe corrigées. Le test « la section vient APRÈS les entrées de travail » est
  supprimé (la disposition décide de l'ordre, éprouvé par `dispositions-validees.test.ts`).

- [ ] **Étape 4 : `roles-derives.test.ts`** — remplacer `hrefs(roles)` / `libelles(roles)` par la
  lecture du menu composé du persona résolu (`resoudrePersona({ roles })`), action comprise. Les
  assertions restent : un acheteur pur porte réservations, visites et baux (dans « Plus » pour les
  baux, arbitrage 1) ; un bailleur ne reçoit pas « Mes avis » ; un agent garde « Publier un bien »
  et « Clients ».

- [ ] **Étape 5 : lancer le périmètre**

```bash
npx vitest run src/lib/navigation src/components/layout src/components/profile src/lib/__tests__/roles-derives.test.ts src/components/dashboard/admin/__tests__/AgencyQueues.source-unique.test.tsx "src/app/(dashboard)/app"
npx tsc --noEmit && npm run lint && npm run check:i18n
```

Attendu : tout vert, sortie 0.

- [ ] **Étape 6 : ablations sur le composant monté**
  1. Forcer `useState(groupe.replie)` (sans `&& !contientLActif`) : le test « Maintenance sur
     `/app/maintenance/9` » rougit (entrée active cachée dans « Plus » replié).
  2. Ignorer `agencySuspended` dans `AppSidebar` : le test « espace suspendu » rougit.
  3. Inverser deux groupes dans la disposition de l'agent : le test monté « titres dans l'ordre »
     rougit.
  Rétablir chaque fois.

- [ ] **Étape 7 : notes du ticket et commit** — dans TCK-2478 : les tests supprimés et ce qui les
  remplace ; les quatre arbitrages ; l'écart avec l'ancien menu rôle par rôle (entrées passées sous
  « Plus », complément, libellés « Biens », « Mon bail », « Interventions », « Reversements ») ; les
  ablations. `status: doing`, `node docs/backlog/ranger-tickets.mjs`. Commit :
  `test(web): le menu s'éprouve par persona, plus par rôle (TCK-2478)`.

---

### Tâche 7 : mesure au navigateur et livraison

- [ ] **Étape 1 :** `./dev.sh` (API + front), un compte par persona du seeder (relever les e-mails
  dans `takussan-api/database/seeders/`). Mesurer à 390, 768 et 1366 px (méthode
  `docs/qa/responsive-2026-09-02.md`, CDP direct) : `scrollWidth − innerWidth = 0` sur `/app`, barre
  fixe et tiroir ; l'en-tête d'espace visible dans le tiroir ; l'action principale atteignable
  au clavier en premier après l'en-tête. Joindre les relevés aux notes du ticket (AC8).
- [ ] **Étape 2 :** les gardes du dépôt (`for g in scripts/check-*.mjs …`), puis demander au porteur
  l'accord de push ; avec l'accord : push, PR vers `dev`, la CI joue les suites.
