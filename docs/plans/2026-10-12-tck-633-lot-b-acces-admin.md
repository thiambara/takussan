# TCK-633 — Lot B (accès admin dynamique) Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.
>
> **Dans TCK-633**, ce plan s'exécute par un sous-agent de la vague 1 du
> [plan maître](2026-10-12-tck-633-lot-retours-porteur.md) (`superpowers:subagent-driven-development`),
> dans l'**arbre partagé** : l'agent édite, la session commite. Cases `- [ ]` pour le suivi.

**Goal :** une table UNIQUE des pages `/admin/*` (chemin, exigence, place dans le menu) dont dérivent
le menu `AdminSidebar`, chaque lien « Administration » (barre `/app`, menu utilisateur, raccourcis,
états vides), la carte « Administration » du profil et la garde de chaque page — un solo ne voit plus
aucun lien qui le renvoie en arrière, lit « Mon espace », et se déconnecte vers l'accueil.

**Architecture :** `lib/access/pages-admin.ts` (pur, isomorphe) porte la table `PAGES_ADMIN` et les
fonctions qui en tirent les pages accessibles d'un *contexte* (rôles, `kind` de l'agence,
capacités). `lib/access/pages-admin-server.ts` construit ce contexte côté serveur
(`getMeAction`, `resolveAgencyOrNull`, `GET /api/me/capabilities`) et expose `accesAdmin()` (pour
peindre) et `garderPageAdmin(chemin)` (pour décider : première instruction de chaque page, renvoi
vers la première page accessible, `/app` s'il n'y en a aucune). Le résultat — une liste de chemins
et un drapeau « espace individuel », sérialisables — descend aux composants client par un contexte
React (`AccesAdminProvider`), monté par le layout `/admin` (et, sur accord, par le layout `/app`) ;
sans fournisseur, chaque composant retombe sur une dérivation **fail-closed** depuis les rôles.

**Tech Stack :** Next.js 16 (App Router, Server Components) / React 19 / next-intl / TanStack Query /
vitest 4 + Testing Library + user-event.

---

## Contraintes globales (reprises du plan maître, et ce qu'elles veulent dire ici)

- **Le ticket et le plan maître font foi ; re-mesurer avant de coder.** Chaque chemin, signature et
  numéro de ligne ci-dessous a été lu le 2026-10-12 sur `docs/tck-633-lot-retours-porteur`
  (`b3a4c6bf`). Si un numéro a bougé (un autre lot a édité un fichier co-tenu), **relire avant
  d'éditer**, et noter l'écart au rapport.
- **Règle 1 — aucune commande git qui écrit.** Ni `add`, `commit`, `checkout`, `stash`, `restore`,
  `reset`, `switch`, `merge`, `push`. Les étapes « commit » du gabarit sont remplacées par
  **« signaler à la session les fichiers à commiter »** (liste dans le rapport, champ `fichiers`).
- **Règle 2 — territoire.** Ce lot tient seul : `components/layout/AdminSidebar.tsx`,
  `components/layout/UserMenu.tsx`, `components/layout/AdminShell.tsx`, `lib/access/**`,
  `app/(dashboard)/admin/**` (pages, layout et leurs `__tests__`),
  `components/profile/ProfileAdminSection.tsx`, `components/dashboard/DashboardShortcuts.tsx`,
  `components/dashboard/DashboardEmpty.tsx`, `components/shared/NoAgencyState.tsx` (cf. E4),
  `scripts/check-pro-routes.mjs` — chemins front relatifs à `takussan-web/src/`. Les fichiers
  **hors territoire** que ce plan doit toucher sont listés en § Écarts relevés (E5) : **ne pas les
  éditer sans l'accord de la session** — sans accord, le bloc prévu va dans `collisions` du rapport.
- **Règle 3 — fichiers co-tenus.** `components/layout/AppSidebar.tsx` (B : l'entrée
  d'administration ; F : l'entrée « Crédits » vers `/app/credits`, qui exige `boost.spend` ou d'être
  admin de l'espace) et `src/messages/{fr,en,wo}.json` (tous les lots) : **outil Edit uniquement**,
  par petits blocs ancrés sur un texte stable, jamais `sed`, script ou `Write`. Si Edit signale un
  changement : relire, rejouer. `app/(dashboard)/app/profile/page.tsx` (B, C) : **ce lot ne le
  modifie pas** (la carte décide seule de se rendre, Task 13).
- **Règle 4 — i18n.** Toute chaîne visible en fr, en et wo ; vouvoiement. Ce lot écrit sous
  **`nav.admin.*`** (et non `admin.nav.*`, qui n'existe pas : E1) et **`profile.admin.*`**. Aucun
  reformatage des dictionnaires.
- **Règle 6 — tests.** Uniquement les fichiers de ce lot (`npx vitest run <fichier>`). **Jamais la
  suite entière, jamais `php bin/impacted-tests.php`.** Aucune commande de plus de 10 minutes.
- **Règle 7 — ablation** : sauvegarde par `cp` dans le scratchpad de l'agent, restauration par `cp`,
  preuve par `md5`. **Sur un fichier co-tenu** (`AppSidebar.tsx`, `messages/*.json`) : protocole
  co-tenu de la Task 0 (Edit inverse + triple `md5`). Jamais `git checkout`.
- **Avant de rendre** : `npx tsc --noEmit`, `npm run lint`, `npm run check:i18n`,
  `npm run check:i18n-namespaces`, `node scripts/check-pro-routes.mjs --report`.
- **Navigateur : en local seulement** (`http://localhost:3000`), **jamais `preview.takussan.com`**.
- **Rapport** : `docs/plans/rapports/tck-633-lot-b.json` (outil Write), **verdict en premier**, puis
  `fichiers`, `tests`, `ablations`, `ecarts_au_ticket`, `collisions`. Message final : **une ligne**.

## Ce que le lot NE fait pas

- Aucun endpoint nouveau (ticket, § Contrat — Lot B) : le front se juge avec les rôles, `agency.kind`
  et `GET /api/me/capabilities`.
- L'entrée « Crédits » (`/app/credits`) : lot F, dans `buildNavItems` d'`AppSidebar.tsx`. Ce lot
  n'édite **pas** `buildNavItems` (cf. Task 7) : les deux lots ne se croisent sur aucun bloc.
- La Navbar publique (`components/home/Navbar.tsx:248-249`) déconnecte DÉJÀ vers
  `hrefLocalise('/', locale)` : l'AC3 « depuis le site public » est tenu sans changement.
- Les liens codés en dur hors territoire (`BrandingBanner` → `/admin/agency`,
  `app/properties/new/page.tsx:102` → `/admin/agency/billing`) : relevés en E13, non modifiés.
- Le retrait de `ensureStandardAgencyOrRedirect` (sans appelant après ce lot) : E7, plus tard.

## Carte des fichiers

### Créés

| Fichier (sous `takussan-web/src/`) | Rôle |
|---|---|
| `lib/access/pages-admin.ts` | `PAGES_ADMIN`, `pageAccessible`, `accesDepuis`, `entreeAdmin`, `entreesDeMenu`, `liensDuProfil`, `contexteDeRepli` |
| `lib/access/pages-admin-server.ts` | `accesAdmin(user?)`, `garderPageAdmin(chemin)` |
| `lib/access/acces-admin-contexte.tsx` | `AccesAdminProvider`, `useAccesAdmin`, `useAccesAdminOuRepli` |
| `lib/access/__tests__/pages-admin.test.ts` | la table et ses dérivations |
| `lib/access/__tests__/pages-admin.i18n.test.ts` | les libellés du lot dans les trois langues |
| `lib/access/__tests__/pages-admin-server.test.ts` | la garde : renvoi, capacité, panne, super-admin |
| `lib/access/__tests__/acces-admin-contexte.test.tsx` | fournisseur et repli |
| `components/layout/__tests__/AdminSidebar.acces.test.tsx` | le menu ne liste que l'accessible |
| `components/layout/__tests__/AppSidebar.acces-admin.test.tsx` | l'entrée d'administration de `/app` |
| `components/layout/__tests__/UserMenu.test.tsx` | « Mon espace », déconnexion vers l'accueil |
| `app/(dashboard)/admin/__tests__/layout.acces.test.tsx` | le layout monte le fournisseur |
| `app/(dashboard)/admin/__tests__/gardes.test.tsx` | chaque page appelle sa garde EN PREMIER |
| `components/dashboard/__tests__/DashboardEmpty.test.tsx` | état vide de l'accueil |
| `components/shared/__tests__/NoAgencyState.test.tsx` | CTA de l'état « sans agence » |
| `components/profile/__tests__/ProfileAdminSection.test.tsx` | carte du profil |
| `app/(dashboard)/app/__tests__/layout.acces-admin.test.tsx` | *(hors territoire, E5, Task 14)* |
| `docs/plans/rapports/tck-633-lot-b.json` (racine du dépôt) | rapport |

### Modifiés

| Fichier (sous `takussan-web/src/`, sauf mention) | Lignes lues | Changement |
|---|---|---|
| `components/layout/AdminSidebar.tsx` | 7-26 (imports), 88-159 (`NavItem`, props, `buildAdminItems`), 161-207 (`AdminItem`, branche verrouillée), 235-265 (composant), 293-295 (en-tête, `aria-label`) | dérivé de `entreesDeMenu` ; plus de cadenas ; « Mon espace » |
| `components/layout/AdminShell.tsx` | 1-21, 44 | `aria-label` du tiroir |
| `app/(dashboard)/admin/layout.tsx` | 1-45 | monte `AccesAdminProvider` |
| `components/layout/AppSidebar.tsx` *(co-tenu B, F)* | 37 (import), 101-109 (`NavItem`), 410 (`FOCUS_RING`), 425-436 (`SidebarItem`), 589-592 (`navItems`), 625 (`labelKey` d'en-tête) | `labelSpace`, `avecEntreeAdmin`, en-tête masqué chez un solo |
| `components/layout/__tests__/AppSidebar.test.tsx` | 583-588 | 3 cadenas → 2 *(E5)* |
| `components/layout/__tests__/AdminSidebar.a11y.test.tsx` | 1-2, 30-42, 61-71, 89-110, 113-158, 228-230, 268-295 | les deux `describe` des cadenas remplacés *(E6)* |
| `app/(dashboard)/admin/**/page.tsx` (14 pages) | lues en entier | `await garderPageAdmin('<chemin>')` en première instruction |
| `app/(dashboard)/admin/properties/page.tsx` | 1-8 | réexport → enveloppe gardée |
| `app/(dashboard)/admin/__tests__/page.files-attente.test.tsx` | 20-25, 31, 40-43, 100, 145-150 | mock de la garde |
| `app/(dashboard)/admin/__tests__/redirection-tags.test.tsx` | 49-52 | mock de la garde |
| `app/(dashboard)/admin/agency/billing/__tests__/page.hote-individuel.test.tsx` | 23 | mock de la garde |
| `app/(dashboard)/admin/settings/integrations/__tests__/page.test.tsx` | 54 | mock de la garde |
| `app/(dashboard)/admin/agency/__tests__/page.watermarks.test.tsx` | 35 | mock de la garde |
| `lib/access/pro-features.ts` | 13-20, 54-67, 83-85 | plus aucune route `/admin` |
| `lib/access/__tests__/pro-features.test.ts` | 46 | + un test |
| `scripts/check-pro-routes.mjs` (racine) | 18-23, 23 (import), 401-407, 427 | refuse `/admin` dans `PRO_ROUTES` ; lit `PAGES_ADMIN` et chaque page admin |
| `components/layout/UserMenu.tsx` | 1-19, 37-45, 78-92 | entrée dérivée ; déconnexion localisée |
| `components/dashboard/DashboardShortcuts.tsx` | 1-29, 45-52, 88-90 | `'use client'`, entrée dérivée |
| `components/dashboard/__tests__/DashboardShortcuts.test.tsx` | 1-6, 48-54 | fournisseur, cas solo |
| `components/dashboard/DashboardEmpty.tsx` | 1-39 | `'use client'`, entrée dérivée |
| `components/shared/NoAgencyState.tsx` | 1-47 | `'use client'`, CTA dérivé |
| `components/profile/ProfileAdminSection.tsx` | 1-58 | `accesAdmin()`, libellés « Mon espace » |
| `messages/fr.json` *(co-tenu)* | 187-189, 8975-8981 | + 2 clés `nav.admin`, + 4 clés `profile.admin` |
| `messages/en.json` *(co-tenu)* | 187-189, 8975-8981 | idem |
| `messages/wo.json` *(co-tenu)* | 177-179, 8330-8336 | idem |
| `context/__tests__/AuthContext.session.test.tsx` | 191 | *(hors territoire, E5)* `'/auth/login'` → `'/fr'` |
| `app/(dashboard)/app/layout.tsx` | 1-8, 69-79 | *(hors territoire, E5, Task 14)* monte `AccesAdminProvider` |
| `app/(dashboard)/app/__tests__/bandeau-suspension.test.tsx` | 19-21 | *(hors territoire, E5, Task 14)* mock d'`accesAdmin` |

### Lus et NON modifiés (et pourquoi)

- `lib/access/server-guards.ts` : `resolveAgencyOrNull(token, agencyId, ou, usage)` (l. 124-211) et
  `ROUTE_VERIF_INDISPONIBLE` (l. 107) sont **réemployés** ; `agenceDuRendu` (l. 101-104) est
  `cache()`é par rendu : le layout, la page et la carte du profil ne paient qu'une requête d'agence.
  `ensureStandardAgencyOrRedirect` (l. 223-247) reste, sans appelant (E7).
- `lib/queries/dashboard.ts:200` (`fetchMyCapabilities`) : avale toute erreur en `[]` et n'envoie pas
  le hint de profil — impropre à une **décision** ; le module serveur fait sa propre lecture (E12).
- `app/(dashboard)/app/(accueil)/page.tsx` : rend `<DashboardEmpty roles={user.roles} />` (asserté
  mot pour mot par `lib/queries/__tests__/dashboard-me.tck-595.test.ts:33`) et
  `<DashboardShortcuts roles={user.roles} agencyId={user.agency_id} />` — **les props ne changent pas**.
- `app/(dashboard)/app/profile/page.tsx:43` : `{isAdmin(user.roles) && <ProfileAdminSection user={user} />}`
  — inchangé, la carte rend `null` quand il n'y a rien à montrer.
- `app/(dashboard)/app/__tests__/etats-de-route.test.ts:346` (`REFUS`) : ne balaie que `/app`, aucune
  page `/app` n'appelle `garderPageAdmin` — rien à changer (E7).
- `i18n/namespaces.json` : `nav`, `dashboard`, `errors` et `profile` sont déjà dans les frontières
  `(dashboard)/app` et `(dashboard)/admin` ; passer trois composants en client n'en ajoute aucun.
- `app/(dashboard)/admin/users/page.tsx` (`permanentRedirect('/admin/team')`) et
  `settings/tags/page.tsx` (`redirect(urlAdminAvecAvis(…))`) : souches, inchangées, reconnues comme
  telles par `check-pro-routes` (Task 10).
- Aucun `loading.tsx` sous `app/(dashboard)/admin/` ni au-dessus (`(dashboard)/` n'a que
  `error.tsx` et `layout.tsx`) : un `redirect()` de page garde son 307 (cf. TCK-426).

---

## Task 0 : Préparation et protocole d'ablation

**Files :** aucun.

- [ ] **Step 1 : relever l'état de départ**

```bash
cd /Users/aminethiam/Documents/perso/takussan
uptime; sysctl -n hw.ncpu
git rev-parse --abbrev-ref HEAD           # lecture seule
S="<scratchpad de l'agent>/tck-633-lot-b"; mkdir -p "$S"; echo "$S"
```

Expected : la branche `feat/tck-633-lot-retours-porteur` (posée par la session) ; noter la charge
au rapport.

⚠ **Les variables du shell ne survivent pas d'un appel d'outil à l'autre** : toute commande de ce
plan qui emploie `$S` ou `$F` commence par sa propre affectation, `S="<scratchpad de l'agent>/tck-633-lot-b";`.

- [ ] **Step 2 : relever que les tests voisins sont verts AVANT toute édition**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-web
npx vitest run src/lib/access/__tests__ \
  src/components/layout/__tests__/AdminSidebar.a11y.test.tsx \
  src/components/layout/__tests__/AdminSidebar.integrations.test.tsx \
  src/components/layout/__tests__/AppSidebar.test.tsx \
  src/components/layout/__tests__/AppSidebar.audience.test.tsx \
  src/components/layout/__tests__/Consoles.bandeaux.test.tsx \
  src/components/layout/__tests__/CoqueHauteur.test.tsx \
  src/components/dashboard/admin/__tests__/AgencyQueues.source-unique.test.tsx \
  src/test/__tests__/portees-sombres.test.tsx \
  src/components/dashboard/__tests__/DashboardShortcuts.test.tsx \
  "src/app/(dashboard)/admin" \
  src/context/__tests__/AuthContext.session.test.tsx \
  "src/app/(dashboard)/app/__tests__/bandeau-suspension.test.tsx" \
  "src/app/(dashboard)/app/__tests__/interruptions-autorisation.test.tsx" \
  src/lib/queries/__tests__/dashboard-me.tck-595.test.ts
cd .. && node scripts/check-pro-routes.mjs --report
```

Expected : tout vert ; `✓ surfaces pro : 7/7 routes redirigées côté SSR ET fail-closed`. Un rouge
ici n'est pas du lot : le noter au rapport (`ecarts_au_ticket`) et continuer sans le corriger.

- [ ] **Step 3 : mesurer la capacité `agency.update_billing` des deux comptes de démonstration**

La ligne `/admin/agency/billing` de la table exige `agency.update_billing` (ce que l'API exige pour
les reversements : `AgencyPolicy::viewPlatformPayouts`, `canActAt(Capability::AgencyUpdateBilling)`).
L'AC1 veut qu'un admin `standard` garde ses pages : le mesurer, ne pas le supposer.

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-api
php artisan tinker --execute='$r = app(App\Services\Membership\MembershipCapabilityResolver::class); foreach (["individual", "standard"] as $k) { $a = App\Models\Agency::where("kind", $k)->orderBy("id")->first(); $u = $a ? App\Models\User::where("email", "admin@agency".$a->id.".demo.takussan.sn")->first() : null; echo $k." agence=".($a?->id ?? "aucune")." ".($a?->name ?? "")." compte=".($u?->email ?? "aucun")." update_billing=".var_export($u && $a ? $r->allows($u, App\Models\Enums\Capability::AgencyUpdateBilling, $a) : null, true).PHP_EOL; }'
```

Expected : deux lignes, `update_billing=true` sur chacune. Noter au rapport les deux comptes (ils
servent en Task 15).
- **`false` pour l'admin `standard`** : écrire la ligne `/admin/agency/billing` de la Task 1 **sans**
  `capacite` (`exige: { role: 'admin' }`), retirer de la Task 3 les trois tests « la capacité »
  (ils deviennent sans objet), et noter E9 comme « mesuré : l'admin standard n'a pas la capacité ».
- **`false` pour le solo** : garder la table telle quelle (l'API lui refuse les reversements, la
  page ne doit pas lui être proposée) ; la Task 15 attend alors 4 entrées de menu au lieu de 5.
- **`aucun`** (base non semée) : `php artisan migrate:fresh --seed` est HORS de ce lot (~260 s,
  écrit la base partagée) — le demander à la session, ne pas le lancer.

- [ ] **Step 4 : retenir les deux protocoles d'ablation**

*Fichier tenu seul* :

```bash
S="<scratchpad de l'agent>/tck-633-lot-b"; F=<chemin>
cp "$F" "$S/$(basename "$F").ok"; md5 -q "$F" > "$S/$(basename "$F").md5"
# … retirer le correctif (Edit), lancer le test, constater le ROUGE …
cp "$S/$(basename "$F").ok" "$F"; md5 -q "$F" | diff - "$S/$(basename "$F").md5" && echo "restauré"
```

⚠ Deux fichiers du lot portent le même nom de base (`page.tsx`, `layout.tsx`) : préfixer la copie
par le dossier (`cp "$F" "$S/audit-page.tsx.ok"`), jamais `basename` seul pour eux.

*Fichier co-tenu* (`AppSidebar.tsx`, `messages/*.json`) : `md5 -q "$F" > "$S/avant.md5"` ; ablation
par **Edit** ; `md5 -q "$F" > "$S/ablate.md5"` ; test rouge ; **avant de restaurer**,
`md5 -q "$F" | diff - "$S/ablate.md5"` — identique : restaurer par `cp "$S/<fichier>.ok" "$F"` ;
différent (un autre lot a écrit pendant l'ablation) : restaurer par l'**Edit inverse**, puis vérifier
par lecture que seule l'édition de l'autre lot sépare le fichier de `$S/<fichier>.ok`. Dans les deux
cas, écrire au rapport les trois `md5`.

---

## Task 1 : la table `PAGES_ADMIN` et ses dérivations (pur)

**Files :**
- Create : `takussan-web/src/lib/access/pages-admin.ts`
- Test : `takussan-web/src/lib/access/__tests__/pages-admin.test.ts`

- [ ] **Step 1 : écrire le test qui échoue**

`takussan-web/src/lib/access/__tests__/pages-admin.test.ts` :

```ts
import { describe, expect, it } from 'vitest';

import {
  PAGES_ADMIN,
  accesDepuis,
  contexteDeRepli,
  entreeAdmin,
  entreesDeMenu,
  liensDuProfil,
  pageAccessible,
  type ContexteAdmin,
} from '../pages-admin';

/**
 * TCK-633 (lot B, AC1) — la table des pages `/admin/*` et ce qu'on en tire.
 *
 * Chaque propriété est écrite pour rougir sur la régression qu'elle garde : une ligne qui perd son
 * exigence `standard`, un super-admin qui cesse de tout ouvrir, un « je ne sais pas » lu comme « oui ».
 */
const SOLO: ContexteAdmin = {
  roles: ['agency_admin', 'owner', 'customer'],
  agence: { kind: 'individual' },
  capacites: ['agency.update_billing'],
};
const STANDARD: ContexteAdmin = {
  roles: ['agency_admin', 'customer'],
  agence: { kind: 'standard' },
  capacites: ['agency.update_billing'],
};
const SUPER_ADMIN: ContexteAdmin = { roles: ['super_admin'], agence: null, capacites: [] };

const PAGES_DU_SOLO = [
  '/admin/agency',
  '/admin/agency/kyc',
  '/admin/agency/billing',
  '/admin/finances',
  '/admin/finances/reconciliation',
  '/admin/settings/integrations',
];

describe('PAGES_ADMIN', () => {
  it('déclare chaque chemin une fois, tous sous /admin', () => {
    const chemins = PAGES_ADMIN.map((p) => p.chemin);
    expect(new Set(chemins).size).toBe(chemins.length);
    for (const c of chemins) expect(c === '/admin' || c.startsWith('/admin/')).toBe(true);
  });

  it("garde l'ordre du menu d'avant TCK-633", () => {
    expect(PAGES_ADMIN.filter((p) => p.menu !== null).map((p) => p.chemin)).toEqual([
      '/admin',
      '/admin/properties',
      '/admin/team',
      '/admin/roles',
      '/admin/agency',
      '/admin/agency/kyc',
      '/admin/agency/billing',
      '/admin/finances',
      '/admin/moderation',
      '/admin/moderation/properties',
      '/admin/audit',
      '/admin/settings/integrations',
      '/admin/settings',
    ]);
  });
});

describe('pageAccessible / accesDepuis', () => {
  it('le tableau de bord admin est refusé au solo', () => {
    expect(pageAccessible(PAGES_ADMIN[0], SOLO)).toBe(false);
  });

  it("un solo n'a que les pages sans exigence « standard », et c'est un espace individuel", () => {
    expect(accesDepuis(SOLO)).toEqual({ chemins: PAGES_DU_SOLO, espaceIndividuel: true });
  });

  it("un admin standard garde toutes les pages d'admin, sauf celles du super-admin", () => {
    const acces = accesDepuis(STANDARD);
    expect(acces.chemins).toEqual(
      PAGES_ADMIN.filter((p) => p.exige.role === 'admin').map((p) => p.chemin),
    );
    expect(acces.espaceIndividuel).toBe(false);
  });

  it('le super-admin ouvre tout, même rattaché à une agence individual (comme AgencyKindGuard)', () => {
    expect(accesDepuis(SUPER_ADMIN).chemins).toEqual(PAGES_ADMIN.map((p) => p.chemin));
    const dansUnSolo = accesDepuis({ ...SUPER_ADMIN, agence: { kind: 'individual' } });
    expect(dansUnSolo.chemins).toEqual(PAGES_ADMIN.map((p) => p.chemin));
    expect(dansUnSolo.espaceIndividuel).toBe(false);
  });

  it('kind inconnu : les pages « standard » sont refusées (fail-closed)', () => {
    const chemins = accesDepuis({ ...STANDARD, agence: { kind: null } }).chemins;
    expect(chemins).not.toContain('/admin');
    expect(chemins[0]).toBe('/admin/agency');
  });

  it('capacités inconnues : la page à capacité est refusée', () => {
    expect(accesDepuis({ ...STANDARD, capacites: null }).chemins).not.toContain('/admin/agency/billing');
  });

  it("sans agence rattachée, l'exigence « standard » ne bloque pas (comme AgencyKindGuard)", () => {
    expect(accesDepuis({ ...STANDARD, agence: null }).chemins).toContain('/admin');
  });

  it("un compte sans rôle d'admin n'a rien", () => {
    expect(accesDepuis({ roles: ['owner', 'customer'], agence: null, capacites: [] })).toEqual({
      chemins: [],
      espaceIndividuel: false,
    });
  });
});

describe('entreeAdmin', () => {
  it('solo : « Mon espace » vers sa première page', () => {
    expect(entreeAdmin(accesDepuis(SOLO))).toEqual({ href: '/admin/agency', cle: 'mySpace' });
  });

  it('standard : « Administration » vers /admin', () => {
    expect(entreeAdmin(accesDepuis(STANDARD))).toEqual({ href: '/admin', cle: 'sectionLabel' });
  });

  it('aucune page : aucune entrée', () => {
    expect(entreeAdmin({ chemins: [], espaceIndividuel: false })).toBeNull();
  });
});

describe('entreesDeMenu / liensDuProfil', () => {
  it("le menu du solo, sans la page qui n'a pas d'entrée (rapprochement)", () => {
    expect(entreesDeMenu(accesDepuis(SOLO)).map((e) => [e.chemin, e.cle])).toEqual([
      ['/admin/agency', 'agency'],
      ['/admin/agency/kyc', 'kyc'],
      ['/admin/agency/billing', 'billing'],
      ['/admin/finances', 'finances'],
      ['/admin/settings/integrations', 'integrations'],
    ]);
  });

  it('les liens du profil ne mènent qu’à des pages accessibles', () => {
    expect(liensDuProfil(accesDepuis(SOLO))).toEqual([{ chemin: '/admin/agency', cle: 'manageAgency' }]);
    expect(liensDuProfil(accesDepuis(STANDARD))).toEqual([
      { chemin: '/admin/agency', cle: 'manageAgency' },
      { chemin: '/admin/audit', cle: 'auditLog' },
    ]);
  });
});

describe('contexteDeRepli — ce que les composants client déduisent sans fournisseur', () => {
  it('pas d’agence : agence nulle, capacités inconnues', () => {
    expect(contexteDeRepli({ roles: ['agency_admin'], agencyId: null })).toEqual({
      roles: ['agency_admin'],
      agence: null,
      capacites: null,
    });
  });

  it('le kind vient du drapeau, et « inconnu » reste inconnu', () => {
    expect(contexteDeRepli({ roles: ['agency_admin'], agencyId: 7, agencyIsStandard: true }).agence)
      .toEqual({ kind: 'standard' });
    expect(contexteDeRepli({ roles: ['agency_admin'], agencyIsStandard: false }).agence)
      .toEqual({ kind: 'individual' });
    expect(contexteDeRepli({ roles: ['agency_admin'], agencyId: 7 }).agence).toEqual({ kind: null });
  });
});
```

- [ ] **Step 2 : le voir échouer**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-web
npx vitest run src/lib/access/__tests__/pages-admin.test.ts
```

Expected : FAIL — `Failed to resolve import "../pages-admin"`.

- [ ] **Step 3 : l'implémentation minimale**

`takussan-web/src/lib/access/pages-admin.ts` :

```ts
import {
  Briefcase,
  Building2,
  CreditCard,
  FileText,
  KeyRound,
  LayoutDashboard,
  Plug,
  Settings,
  Shield,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { isAdmin, isSuperAdmin } from '@/lib/roles';
import type { AgencyKind } from '@/types/agency';
import type { UserRole } from '@/types/user';

/**
 * TCK-633 (lot B, AC1) — LA table des pages `/admin/*`. Il n'y en a qu'une.
 *
 * Avant ce ticket, la même question — « cette page est-elle pour vous ? » — avait cinq réponses
 * écrites séparément : `buildAdminItems` (le menu), `PRO_ROUTES` (le cadenas), l'`isAdmin` du menu
 * utilisateur, les liens codés en dur de la carte du profil et des raccourcis, et la garde de chaque
 * page. Elles divergeaient : un admin d'agence `individual` voyait « Administration » partout, et
 * chaque clic le renvoyait sur `/app`. *Un lien qui mène à une redirection est une porte peinte sur
 * un mur.*
 *
 * Tout ce qui montre ou garde une page `/admin/*` dérive désormais de cette table : le menu
 * (`entreesDeMenu`), le lien « Administration » / « Mon espace » (`entreeAdmin`), la carte du profil
 * (`liensDuProfil`) et la garde serveur (`garderPageAdmin`, `./pages-admin-server`).
 * `scripts/check-pro-routes.mjs` vérifie que chaque `page.tsx` de `app/(dashboard)/admin` appelle la
 * garde de SON chemin.
 *
 * ⚠ La table DÉCIDE de l'écran, jamais de la donnée : chaque API rejuge (`AgencyKindGuard`,
 * policies). Les exigences sont écrites pour suivre l'API, pas pour la remplacer.
 */

export interface ExigenceAdmin {
  /** `admin` : `agency_admin` ou `super_admin` (`isAdmin`). `super_admin` : lui seul. */
  readonly role: 'admin' | 'super_admin';
  /** `standard` : refusée à une agence `individual` ET à un `kind` qu'on n'a pas pu lire. */
  readonly agence?: 'standard';
  /** Une valeur de `App\Models\Enums\Capability`, jugée sur `GET /api/me/capabilities`. */
  readonly capacite?: string;
}

export interface PageAdmin {
  readonly chemin: string;
  readonly exige: ExigenceAdmin;
  /** Place dans `AdminSidebar` — `cle` sous `nav.admin`. `null` : page atteinte par un lien de page. */
  readonly menu: { readonly cle: string; readonly icone: LucideIcon } | null;
  /** Lien de la carte « Administration » du profil — clé sous `profile.admin`. */
  readonly profil?: 'manageAgency' | 'auditLog';
}

/** L'ORDRE est celui du menu (celui de `buildAdminItems` avant TCK-633, à l'identique). */
const TABLE = [
  // Le tableau de bord de l'agence (files, KPI, activité) : réservé au `standard` (§1.12).
  {
    chemin: '/admin',
    exige: { role: 'admin', agence: 'standard' },
    menu: { cle: 'dashboard', icone: LayoutDashboard },
  },
  // La liste transverse des biens : super-admin seul.
  { chemin: '/admin/properties', exige: { role: 'super_admin' }, menu: { cle: 'properties', icone: Building2 } },
  { chemin: '/admin/team', exige: { role: 'admin', agence: 'standard' }, menu: { cle: 'team', icone: Users } },
  // TCK-279 — juste sous « Équipe » : on attribue un rôle là, on le définit ici.
  { chemin: '/admin/roles', exige: { role: 'admin', agence: 'standard' }, menu: { cle: 'roles', icone: KeyRound } },
  {
    chemin: '/admin/agency',
    exige: { role: 'admin' },
    menu: { cle: 'agency', icone: Briefcase },
    profil: 'manageAgency',
  },
  { chemin: '/admin/agency/kyc', exige: { role: 'admin' }, menu: { cle: 'kyc', icone: ShieldCheck } },
  // TCK-594 (AC18) — l'hôte individuel y lit ses reversements ; l'API les garde par
  // `agency.update_billing` (`AgencyPolicy::viewPlatformPayouts`). Le bloc d'abonnement, lui, reste
  // `standard` : c'est la page qui en décide.
  {
    chemin: '/admin/agency/billing',
    exige: { role: 'admin', capacite: 'agency.update_billing' },
    menu: { cle: 'billing', icone: CreditCard },
  },
  { chemin: '/admin/finances', exige: { role: 'admin' }, menu: { cle: 'finances', icone: CreditCard } },
  // TCK-593 — le rapprochement vit SOUS les finances : un lien de la page, pas une entrée de menu.
  // Le détail `[statementId]` est gardé par ce chemin-ci, son plus proche ancêtre statique.
  { chemin: '/admin/finances/reconciliation', exige: { role: 'admin' }, menu: null },
  // TCK-597 (ADR-0043 §1) — l'admin d'agence `standard` modère les avis de SON agence.
  {
    chemin: '/admin/moderation',
    exige: { role: 'admin', agence: 'standard' },
    menu: { cle: 'reviewModeration', icone: Shield },
  },
  // TCK-098 — la modération des biens.
  {
    chemin: '/admin/moderation/properties',
    exige: { role: 'admin', agence: 'standard' },
    menu: { cle: 'propertyModeration', icone: Building2 },
  },
  {
    chemin: '/admin/audit',
    exige: { role: 'admin', agence: 'standard' },
    menu: { cle: 'auditLog', icone: FileText },
    profil: 'auditLog',
  },
  // TCK-370 — `routes/api/integrations.php` ne pose qu'`auth:sanctum`, et `IntegrationController`
  // laisse entrer un `agency_admin` sur SON agence.
  { chemin: '/admin/settings/integrations', exige: { role: 'admin' }, menu: { cle: 'integrations', icone: Plug } },
  // `/api/admin/settings` est sous le middleware `super-admin` (`routes/api/admin.php`).
  { chemin: '/admin/settings', exige: { role: 'super_admin' }, menu: { cle: 'settings', icone: Settings } },
] as const satisfies readonly PageAdmin[];

export type CheminAdmin = (typeof TABLE)[number]['chemin'];

export const PAGES_ADMIN: readonly (PageAdmin & { readonly chemin: CheminAdmin })[] = TABLE;

/**
 * Ce qu'on sait du profil actif.
 *
 *  · `agence: null` — aucune agence rattachée : l'exigence `standard` ne bloque pas (même règle
 *    que `AgencyKindGuard::ensureStandardForNonGlobal` côté API, et qu'`ensureStandardAgencyOrRedirect`
 *    avant ce ticket).
 *  · `agence: { kind: null }` — une agence dont on n'a PAS PU lire le `kind` : refus. *Un écran
 *    réservé se refuse quand on ne sait pas, pas seulement quand on sait que non.*
 *  · `capacites: null` — capacités inconnues : refus de toute page qui en exige une.
 */
export interface ContexteAdmin {
  readonly roles: UserRole[];
  readonly agence: { readonly kind: AgencyKind | null } | null;
  readonly capacites: readonly string[] | null;
}

export function pageAccessible(page: PageAdmin, ctx: ContexteAdmin): boolean {
  const superAdmin = isSuperAdmin(ctx.roles);
  if (page.exige.role === 'super_admin') return superAdmin;
  if (!isAdmin(ctx.roles)) return false;
  // Le super-admin passe l'agence et la capacité, comme côté API.
  if (superAdmin) return true;
  if (page.exige.agence === 'standard' && ctx.agence !== null && ctx.agence.kind !== 'standard') {
    return false;
  }
  if (page.exige.capacite !== undefined && !(ctx.capacites ?? []).includes(page.exige.capacite)) {
    return false;
  }
  return true;
}

/** Ce qui descend aux composants : sérialisable, sans fonction ni icône. */
export interface AccesAdmin {
  /** Les chemins accessibles, dans l'ordre de la table. */
  readonly chemins: readonly CheminAdmin[];
  /** Admin d'une agence `individual` (pas un super-admin) : on lui parle de « son espace ». */
  readonly espaceIndividuel: boolean;
}

export function accesDepuis(ctx: ContexteAdmin): AccesAdmin {
  return {
    chemins: PAGES_ADMIN.filter((page) => pageAccessible(page, ctx)).map((page) => page.chemin),
    espaceIndividuel:
      isAdmin(ctx.roles) && !isSuperAdmin(ctx.roles) && ctx.agence?.kind === 'individual',
  };
}

export interface EntreeAdmin {
  readonly href: CheminAdmin;
  /** Clé sous `nav.admin`. */
  readonly cle: 'sectionLabel' | 'mySpace';
}

/** LE lien vers l'administration : la première page accessible, ou rien. */
export function entreeAdmin(acces: AccesAdmin): EntreeAdmin | null {
  const premier = acces.chemins[0];
  if (premier === undefined) return null;
  return { href: premier, cle: acces.espaceIndividuel ? 'mySpace' : 'sectionLabel' };
}

export function pageAdmin(chemin: string): (PageAdmin & { readonly chemin: CheminAdmin }) | undefined {
  return PAGES_ADMIN.find((page) => page.chemin === chemin);
}

export interface EntreeDeMenu {
  readonly chemin: CheminAdmin;
  /** Clé sous `nav.admin`. */
  readonly cle: string;
  readonly icone: LucideIcon;
}

export function entreesDeMenu(acces: AccesAdmin): EntreeDeMenu[] {
  const sortie: EntreeDeMenu[] = [];
  for (const page of PAGES_ADMIN) {
    if (page.menu !== null && acces.chemins.includes(page.chemin)) {
      sortie.push({ chemin: page.chemin, cle: page.menu.cle, icone: page.menu.icone });
    }
  }
  return sortie;
}

export interface LienDuProfil {
  readonly chemin: CheminAdmin;
  /** Clé sous `profile.admin`. */
  readonly cle: 'manageAgency' | 'auditLog';
}

export function liensDuProfil(acces: AccesAdmin): LienDuProfil[] {
  const sortie: LienDuProfil[] = [];
  for (const page of PAGES_ADMIN) {
    if (page.profil !== undefined && acces.chemins.includes(page.chemin)) {
      sortie.push({ chemin: page.chemin, cle: page.profil });
    }
  }
  return sortie;
}

export interface RepliAdmin {
  readonly roles: UserRole[];
  /** `null` : aucune agence rattachée. `undefined` : non transmis — le `kind` vient du drapeau. */
  readonly agencyId?: number | null;
  /** `true` standard, `false` individual, `undefined` inconnu. */
  readonly agencyIsStandard?: boolean;
}

/**
 * Le contexte qu'un composant client peut déduire SANS fournisseur — fail-closed : capacités
 * toujours inconnues, `kind` inconnu tant que le drapeau ne le dit pas.
 */
export function contexteDeRepli({ roles, agencyId, agencyIsStandard }: RepliAdmin): ContexteAdmin {
  if (agencyId === null) return { roles, agence: null, capacites: null };
  const kind: AgencyKind | null =
    agencyIsStandard === true ? 'standard' : agencyIsStandard === false ? 'individual' : null;
  return { roles, agence: { kind }, capacites: null };
}
```

Si la Task 0, Step 3 a mesuré `update_billing=false` pour l'admin `standard`, la ligne
`/admin/agency/billing` s'écrit `exige: { role: 'admin' }` et le test « capacités inconnues » se
réécrit sur une ligne qui n'existe plus : le retirer, et le dire au rapport (E9).

- [ ] **Step 4 : le voir passer**

```bash
npx vitest run src/lib/access/__tests__/pages-admin.test.ts
```

Expected : PASS (19 tests).

- [ ] **Step 5 : ablation**

```bash
S="<scratchpad de l'agent>/tck-633-lot-b"; F=src/lib/access/pages-admin.ts
cp "$F" "$S/pages-admin.ts.ok"; md5 -q "$F" > "$S/pages-admin.ts.md5"
```

1. Edit : retirer la ligne `  if (superAdmin) return true;` de `pageAccessible`.
   `npx vitest run src/lib/access/__tests__/pages-admin.test.ts` → **FAIL** sur « le super-admin
   ouvre tout, même rattaché à une agence individual ».
2. Restaurer (`cp` + `md5`, protocole tenu seul), puis Edit : sur la ligne `/admin`, remplacer
   `exige: { role: 'admin', agence: 'standard' }` par `exige: { role: 'admin' }`. Relancer → **FAIL**
   sur « le tableau de bord admin est refusé au solo » et « un solo n'a que les pages… ».

```bash
S="<scratchpad de l'agent>/tck-633-lot-b"; F=src/lib/access/pages-admin.ts
cp "$S/pages-admin.ts.ok" "$F"; md5 -q "$F" | diff - "$S/pages-admin.ts.md5" && echo "restauré"
```

- [ ] **Step 6 : signaler à la session** `takussan-web/src/lib/access/pages-admin.ts`,
  `takussan-web/src/lib/access/__tests__/pages-admin.test.ts` (champ `fichiers` du rapport).

---

## Task 2 : les libellés « Mon espace » (fr, en, wo)

**Files :**
- Modify : `takussan-web/src/messages/fr.json:187-189,8980-8981`, `en.json:187-189,8980-8981`,
  `wo.json:177-179,8335-8336` *(co-tenus : Edit seulement)*
- Test : `takussan-web/src/lib/access/__tests__/pages-admin.i18n.test.ts`

- [ ] **Step 1 : écrire le test qui échoue**

`takussan-web/src/lib/access/__tests__/pages-admin.i18n.test.ts` :

```ts
import { describe, expect, it } from 'vitest';

import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import { PAGES_ADMIN } from '../pages-admin';

/**
 * TCK-633 (lot B) — chaque libellé que la table ou les composants du lot demandent existe dans les
 * TROIS langues. `check:i18n` vérifie la parité ; ce test vérifie que la parité porte sur les clés
 * que le code lit vraiment.
 */
type Dico = {
  nav: { admin: Record<string, unknown> };
  profile: { admin: Record<string, unknown> };
};
const DICOS: Record<'fr' | 'en' | 'wo', Dico> = { fr, en, wo };

const NAV_ADMIN = ['sectionLabel', 'mySpace', 'openMySpace'];
const PROFILE_ADMIN = [
  'title',
  'subtitle',
  'roleLabel',
  'manageAgency',
  'auditLog',
  'adminSpace',
  'titleIndividual',
  'subtitleIndividual',
  'roleLabelIndividual',
  'roleIndividual',
];

describe.each(Object.entries(DICOS))('libellés du lot B — %s', (_langue, dico) => {
  it('nav.admin porte l’entrée et chaque entrée de menu de la table', () => {
    const cles = [...NAV_ADMIN, ...PAGES_ADMIN.flatMap((p) => (p.menu ? [p.menu.cle] : []))];
    for (const cle of cles) expect(typeof dico.nav.admin[cle], `nav.admin.${cle}`).toBe('string');
  });

  it('profile.admin porte la carte, dans ses deux variantes', () => {
    for (const cle of PROFILE_ADMIN) expect(typeof dico.profile.admin[cle], `profile.admin.${cle}`).toBe('string');
  });
});
```

- [ ] **Step 2 : le voir échouer**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-web
npx vitest run src/lib/access/__tests__/pages-admin.i18n.test.ts
```

Expected : FAIL — `nav.admin.mySpace: expected 'undefined' to be 'string'` (×3 langues), et
`profile.admin.titleIndividual` de même.

- [ ] **Step 3 : l'implémentation minimale** — six Edit, ancrés, aucun reformatage.

`src/messages/fr.json`, Edit 1 :

```
old:
      "roles": "Rôles",
      "integrations": "Intégrations"
    },
new:
      "roles": "Rôles",
      "integrations": "Intégrations",
      "mySpace": "Mon espace",
      "openMySpace": "Ouvrir mon espace"
    },
```

`src/messages/fr.json`, Edit 2 :

```
old:
      "adminSpace": "Espace administration"
    },
new:
      "adminSpace": "Espace administration",
      "titleIndividual": "Mon espace",
      "subtitleIndividual": "Les réglages de votre espace d'annonceur.",
      "roleLabelIndividual": "Votre rôle",
      "roleIndividual": "Titulaire de l'espace"
    },
```

`src/messages/en.json`, Edit 1 :

```
old:
      "roles": "Roles",
      "integrations": "Integrations"
    },
new:
      "roles": "Roles",
      "integrations": "Integrations",
      "mySpace": "My space",
      "openMySpace": "Open my space"
    },
```

`src/messages/en.json`, Edit 2 :

```
old:
      "adminSpace": "Administration area"
    },
new:
      "adminSpace": "Administration area",
      "titleIndividual": "My space",
      "subtitleIndividual": "The settings of your listing space.",
      "roleLabelIndividual": "Your role",
      "roleIndividual": "Holder of this space"
    },
```

`src/messages/wo.json`, Edit 1 :

```
old:
      "roles": "Wàll yi",
      "integrations": "Ay jokkoo"
    },
new:
      "roles": "Wàll yi",
      "integrations": "Ay jokkoo",
      "mySpace": "Sama barab",
      "openMySpace": "Ubbi sama barab"
    },
```

`src/messages/wo.json`, Edit 2 :

```
old:
      "adminSpace": "Barabu njiiteef"
    },
new:
      "adminSpace": "Barabu njiiteef",
      "titleIndividual": "Sama barab",
      "subtitleIndividual": "Tegtal yi ci sa barab.",
      "roleLabelIndividual": "Sa wàll",
      "roleIndividual": "Boroom barab bi"
    },
```

Chacune de ces six chaînes `old` est unique dans son fichier (mesuré : `"integrations": "…"` en fin
de bloc et `"adminSpace"` apparaissent une seule fois par dictionnaire). Le wolof est à faire relire
(E15).

- [ ] **Step 4 : le voir passer**

```bash
npx vitest run src/lib/access/__tests__/pages-admin.i18n.test.ts
npm run check:i18n
```

Expected : PASS (6 tests) ; `check:i18n` vert (parité fr/en/wo).

- [ ] **Step 5 : ablation (protocole co-tenu)**

```bash
S="<scratchpad de l'agent>/tck-633-lot-b"; F=src/messages/wo.json
cp "$F" "$S/wo.json.ok"; md5 -q "$F" > "$S/avant.md5"
```

Edit : retirer la ligne `      "openMySpace": "Ubbi sama barab"` (et la virgule de la ligne
au-dessus). `md5 -q "$F" > "$S/ablate.md5"`. Relancer le test → **FAIL** sur `nav.admin.openMySpace`
(wo seul). Puis `md5 -q "$F" | diff - "$S/ablate.md5"` : identique → `cp "$S/wo.json.ok" "$F"` ;
différent → Edit inverse. `md5 -q "$F" | diff - "$S/avant.md5" && echo "restauré"`. Trois `md5` au
rapport.

- [ ] **Step 6 : signaler à la session** les trois dictionnaires et le test.

---

## Task 3 : le module serveur — `accesAdmin()` et `garderPageAdmin(chemin)`

**Files :**
- Create : `takussan-web/src/lib/access/pages-admin-server.ts`
- Test : `takussan-web/src/lib/access/__tests__/pages-admin-server.test.ts`

- [ ] **Step 1 : écrire le test qui échoue**

`takussan-web/src/lib/access/__tests__/pages-admin-server.test.ts` :

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { User, UserRole } from '@/types/user';

/**
 * TCK-633 (lot B) — la garde des pages `/admin/*`.
 *
 * Trois issues, et chacune a son test : la page s'ouvre ; la page est refusée et l'on va à la
 * PREMIÈRE page accessible (`/app` s'il n'y en a aucune) ; on n'a pas pu vérifier, et l'on va à
 * `/verification-indisponible` — jamais « non » déguisé.
 */
const getMe = vi.fn();
const resolveAgency = vi.fn();
const apiRequest = vi.fn();
const getToken = vi.fn();
const getActiveProfileId = vi.fn();

vi.mock('@/app/actions/auth', () => ({ getMeAction: () => getMe() }));
vi.mock('@/lib/session', () => ({
  getToken: () => getToken(),
  getActiveProfileId: () => getActiveProfileId(),
}));
vi.mock('@/lib/access/server-guards', () => ({
  ROUTE_VERIF_INDISPONIBLE: '/verification-indisponible',
  resolveAgencyOrNull: (...a: unknown[]) => resolveAgency(...a),
}));
vi.mock('@/lib/api', () => {
  class ApiError extends Error {
    constructor(public readonly status: number) {
      super(`API error ${status}`);
    }
  }
  return { ApiError, apiRequest: (...a: unknown[]) => apiRequest(...a) };
});
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT ${url}`), { digest: `NEXT_REDIRECT;replace;${url};307;` });
  },
}));

const { ApiError } = await import('@/lib/api');
const { accesAdmin, garderPageAdmin } = await import('../pages-admin-server');

const moi = (roles: UserRole[], agency_id: number | null = 7) =>
  ({ id: 1, roles, agency_id }) as unknown as User;

function capacites(liste: string[]) {
  apiRequest.mockResolvedValue({ data: { agency_id: 7, capabilities: liste } });
}

beforeEach(() => {
  vi.clearAllMocks();
  getToken.mockResolvedValue('jeton');
  getActiveProfileId.mockResolvedValue('agency_admin:12');
  resolveAgency.mockResolvedValue({ id: 7, kind: 'standard' });
  capacites(['agency.update_billing']);
});

describe('garderPageAdmin — une page refusée renvoie à la première accessible', () => {
  it('un solo sur /admin est renvoyé vers /admin/agency', async () => {
    getMe.mockResolvedValue(moi(['agency_admin', 'customer']));
    resolveAgency.mockResolvedValue({ id: 7, kind: 'individual' });
    await expect(garderPageAdmin('/admin')).rejects.toThrow(/^NEXT_REDIRECT \/admin\/agency$/);
  });

  it("un solo ouvre /admin/agency, sans qu'on lise ni son agence ni ses capacités", async () => {
    getMe.mockResolvedValue(moi(['agency_admin']));
    await expect(garderPageAdmin('/admin/agency')).resolves.toBeUndefined();
    expect(resolveAgency).not.toHaveBeenCalled();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("un admin standard ouvre /admin, et l'agence est lue pour DÉCIDER", async () => {
    getMe.mockResolvedValue(moi(['agency_admin']));
    await expect(garderPageAdmin('/admin')).resolves.toBeUndefined();
    expect(resolveAgency).toHaveBeenCalledWith('jeton', 7, 'pages-admin', 'decision');
  });

  it('kind illisible : refus, vers une page qui ne l’exige pas', async () => {
    getMe.mockResolvedValue(moi(['agency_admin']));
    resolveAgency.mockResolvedValue(null);
    await expect(garderPageAdmin('/admin/audit')).rejects.toThrow(/^NEXT_REDIRECT \/admin\/agency$/);
  });

  it('sans jeton : refus, comme un kind illisible (fail-closed)', async () => {
    getMe.mockResolvedValue(moi(['agency_admin']));
    getToken.mockResolvedValue(undefined);
    await expect(garderPageAdmin('/admin/team')).rejects.toThrow(/^NEXT_REDIRECT \/admin\/agency$/);
    expect(resolveAgency).not.toHaveBeenCalled();
  });

  it("les paramètres globaux renvoient un admin d'agence standard vers /admin", async () => {
    getMe.mockResolvedValue(moi(['agency_admin']));
    await expect(garderPageAdmin('/admin/settings')).rejects.toThrow(/^NEXT_REDIRECT \/admin$/);
  });

  it("un compte sans aucune page d'admin est renvoyé vers /app", async () => {
    getMe.mockResolvedValue(moi(['owner', 'customer'], null));
    await expect(garderPageAdmin('/admin/agency')).rejects.toThrow(/^NEXT_REDIRECT \/app$/);
  });

  it('un super-admin ouvre tout, sans lire ni agence ni capacités', async () => {
    getMe.mockResolvedValue(moi(['super_admin'], null));
    for (const chemin of ['/admin', '/admin/settings', '/admin/properties', '/admin/agency/billing'] as const) {
      await expect(garderPageAdmin(chemin)).resolves.toBeUndefined();
    }
    expect(resolveAgency).not.toHaveBeenCalled();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});

describe('garderPageAdmin — la capacité', () => {
  it('reversements : ouverts avec agency.update_billing, hint de profil transmis', async () => {
    getMe.mockResolvedValue(moi(['agency_admin']));
    await expect(garderPageAdmin('/admin/agency/billing')).resolves.toBeUndefined();
    expect(apiRequest).toHaveBeenCalledWith('/api/me/capabilities', {
      token: 'jeton',
      activeProfileId: 'agency_admin:12',
    });
  });

  it('reversements : refusés sans la capacité', async () => {
    getMe.mockResolvedValue(moi(['agency_admin']));
    resolveAgency.mockResolvedValue({ id: 7, kind: 'individual' });
    capacites([]);
    await expect(garderPageAdmin('/admin/agency/billing')).rejects.toThrow(/^NEXT_REDIRECT \/admin\/agency$/);
  });

  it("capacités illisibles (500) : « je n'ai pas pu vérifier », pas « non »", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getMe.mockResolvedValue(moi(['agency_admin']));
    apiRequest.mockRejectedValue(new ApiError(500));
    await expect(garderPageAdmin('/admin/agency/billing')).rejects.toThrow(
      /^NEXT_REDIRECT \/verification-indisponible$/,
    );
  });

  it('403 sur les capacités : un refus, silencieux', async () => {
    getMe.mockResolvedValue(moi(['agency_admin']));
    apiRequest.mockRejectedValue(new ApiError(403));
    await expect(garderPageAdmin('/admin/agency/billing')).rejects.toThrow(/^NEXT_REDIRECT \/admin$/);
  });
});

describe('accesAdmin', () => {
  it('rend les pages du solo et « espace individuel », agence lue pour AFFICHER', async () => {
    getMe.mockResolvedValue(moi(['agency_admin']));
    resolveAgency.mockResolvedValue({ id: 7, kind: 'individual' });
    expect(await accesAdmin()).toEqual({
      chemins: [
        '/admin/agency',
        '/admin/agency/kyc',
        '/admin/agency/billing',
        '/admin/finances',
        '/admin/finances/reconciliation',
        '/admin/settings/integrations',
      ],
      espaceIndividuel: true,
    });
    expect(resolveAgency).toHaveBeenCalledWith('jeton', 7, 'pages-admin', 'affichage');
  });

  it("prend l'utilisateur qu'on lui passe, sans relire la session", async () => {
    await accesAdmin(moi(['agency_admin']));
    expect(getMe).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2 : le voir échouer**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-web
npx vitest run src/lib/access/__tests__/pages-admin-server.test.ts
```

Expected : FAIL — `Failed to resolve import "../pages-admin-server"`.

- [ ] **Step 3 : l'implémentation minimale**

`takussan-web/src/lib/access/pages-admin-server.ts` :

```ts
import { redirect } from 'next/navigation';
import { cache } from 'react';

import { getMeAction } from '@/app/actions/auth';
import { ApiError, apiRequest } from '@/lib/api';
import { ROUTE_VERIF_INDISPONIBLE, resolveAgencyOrNull } from '@/lib/access/server-guards';
import { isAdmin, isSuperAdmin } from '@/lib/roles';
import { getActiveProfileId, getToken } from '@/lib/session';
import type { User } from '@/types/user';

import {
  accesDepuis,
  pageAccessible,
  pageAdmin,
  type AccesAdmin,
  type CheminAdmin,
  type ContexteAdmin,
} from './pages-admin';

/**
 * TCK-633 (lot B) — la face SERVEUR de `PAGES_ADMIN` : construire le contexte du profil actif, et
 * en tirer la décision d'une page (`garderPageAdmin`) ou l'inventaire à peindre (`accesAdmin`).
 *
 * Coût : l'agence passe par `resolveAgencyOrNull`, donc par `agenceDuRendu`, `cache()`é par rendu —
 * le layout, la page et la carte du profil partagent UNE requête. Les capacités, de même, par
 * `capacitesDuRendu`. Elles ne sont lues que pour un `agency_admin` (le super-admin passe tout), et
 * seulement quand la page en exige une.
 */

/**
 * `GET /api/me/capabilities`, une fois par rendu.
 *
 * Trois issues, comme `resolveAgencyOrNull` : 401/403/404 sont une RÉPONSE (aucune capacité), une
 * autre panne n'en est pas une (`null` : « je ne sais pas »). `fetchMyCapabilities`
 * (`lib/queries/dashboard.ts`) ne convient pas ici : il avale tout en `[]` — une panne passerait pour
 * un refus — et n'envoie pas le hint de profil.
 */
const capacitesDuRendu = cache(
  async (token: string, activeProfileId?: string): Promise<readonly string[] | null> => {
    try {
      const reponse = await apiRequest<{ data: { capabilities?: readonly string[] } }>(
        '/api/me/capabilities',
        { token, activeProfileId },
      );
      return reponse.data.capabilities ?? [];
    } catch (e: unknown) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 404)) return [];
      console.error('[access] pages-admin : /api/me/capabilities illisible', e instanceof Error ? e.message : e);
      return null;
    }
  },
);

interface Besoins {
  readonly agence: boolean;
  readonly capacites: boolean;
}

const TOUT: Besoins = { agence: true, capacites: true };

async function contexteAdmin(
  user: User,
  besoins: Besoins,
  usage: 'decision' | 'affichage',
): Promise<ContexteAdmin> {
  const roles = user.roles;
  // Ni le super-admin (il passe tout) ni un non-admin (il n'a rien) n'ont besoin d'une lecture.
  if (!isAdmin(roles) || isSuperAdmin(roles)) return { roles, agence: null, capacites: [] };

  const token = await getToken();
  let agence: ContexteAdmin['agence'] = null;
  if (typeof user.agency_id === 'number') {
    // Sans besoin, `{ kind: null }` : la page en cours n'a pas d'exigence d'agence, la valeur n'est
    // pas consultée. Sans jeton, la même chose — et c'est un refus pour toute page qui l'exige.
    if (besoins.agence && token) {
      const lue = await resolveAgencyOrNull(token, user.agency_id, 'pages-admin', usage);
      agence = { kind: lue?.kind ?? null };
    } else {
      agence = { kind: null };
    }
  }

  let capacites: readonly string[] | null = null;
  if (besoins.capacites) {
    capacites = token ? await capacitesDuRendu(token, await getActiveProfileId()) : [];
  }
  return { roles, agence, capacites };
}

/** Les pages `/admin/*` accessibles au profil actif — pour PEINDRE (menu, liens, carte du profil). */
export async function accesAdmin(user?: User): Promise<AccesAdmin> {
  const moi = user ?? (await getMeAction());
  return accesDepuis(await contexteAdmin(moi, TOUT, 'affichage'));
}

/**
 * LA garde d'une page `/admin/*`. Première instruction de chaque page — `check-pro-routes` le vérifie.
 *
 *  · page accessible → rien ;
 *  · capacités ILLISIBLES sur une page qui en exige une → `/verification-indisponible` ;
 *    (le `kind` illisible y va déjà, par `resolveAgencyOrNull` en usage `decision`) ;
 *  · sinon → la première page accessible, `/app` s'il n'y en a aucune.
 *
 * *Une page refusée renvoie là où l'on peut aller, pas là où l'on était.*
 */
export async function garderPageAdmin(chemin: CheminAdmin): Promise<void> {
  const page = pageAdmin(chemin);
  if (page === undefined) {
    throw new Error(`garderPageAdmin : « ${chemin} » n'est pas dans PAGES_ADMIN.`);
  }
  const user = await getMeAction();
  const besoins: Besoins = {
    agence: page.exige.agence === 'standard',
    capacites: page.exige.capacite !== undefined,
  };
  const ctx = await contexteAdmin(user, besoins, 'decision');
  if (pageAccessible(page, ctx)) return;
  if (besoins.capacites && ctx.capacites === null) redirect(ROUTE_VERIF_INDISPONIBLE);

  const acces = accesDepuis(await contexteAdmin(user, TOUT, 'affichage'));
  redirect(acces.chemins.find((c) => c !== chemin) ?? '/app');
}
```

- [ ] **Step 4 : le voir passer**

```bash
npx vitest run src/lib/access/__tests__/pages-admin-server.test.ts
```

Expected : PASS (14 tests).

- [ ] **Step 5 : ablation**

```bash
S="<scratchpad de l'agent>/tck-633-lot-b"; F=src/lib/access/pages-admin-server.ts
cp "$F" "$S/pages-admin-server.ts.ok"; md5 -q "$F" > "$S/pages-admin-server.ts.md5"
```

1. Edit : retirer la ligne `  if (besoins.capacites && ctx.capacites === null) redirect(ROUTE_VERIF_INDISPONIBLE);`.
   Relancer → **FAIL** sur « capacités illisibles (500) » (reçu `NEXT_REDIRECT /admin`).
2. Restaurer, puis Edit : dans `garderPageAdmin`, `contexteAdmin(user, besoins, 'decision')` →
   `contexteAdmin(user, besoins, 'affichage')`. Relancer → **FAIL** sur « l'agence est lue pour
   DÉCIDER ».
3. Restaurer, puis Edit : `redirect(acces.chemins.find((c) => c !== chemin) ?? '/app');` →
   `redirect('/app');`. Relancer → **FAIL** sur « un solo sur /admin est renvoyé vers /admin/agency ».

```bash
S="<scratchpad de l'agent>/tck-633-lot-b"; F=src/lib/access/pages-admin-server.ts
cp "$S/pages-admin-server.ts.ok" "$F"; md5 -q "$F" | diff - "$S/pages-admin-server.ts.md5" && echo "restauré"
```

- [ ] **Step 6 : signaler à la session** le module et son test.

---

## Task 4 : le contexte client — `AccesAdminProvider`

**Files :**
- Create : `takussan-web/src/lib/access/acces-admin-contexte.tsx`
- Test : `takussan-web/src/lib/access/__tests__/acces-admin-contexte.test.tsx`

- [ ] **Step 1 : écrire le test qui échoue**

`takussan-web/src/lib/access/__tests__/acces-admin-contexte.test.tsx` :

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { UserRole } from '@/types/user';
import { AccesAdminProvider, useAccesAdmin, useAccesAdminOuRepli } from '../acces-admin-contexte';
import type { AccesAdmin } from '../pages-admin';

function Sonde({ roles, agencyIsStandard }: { roles: UserRole[]; agencyIsStandard?: boolean }) {
  const brut = useAccesAdmin();
  const acces = useAccesAdminOuRepli({ roles, agencyIsStandard });
  return (
    <>
      <output data-testid="brut">{JSON.stringify(brut)}</output>
      <output data-testid="acces">{JSON.stringify(acces)}</output>
    </>
  );
}

const SOLO: AccesAdmin = { chemins: ['/admin/agency'], espaceIndividuel: true };

describe('AccesAdminProvider (TCK-633)', () => {
  it('fournit sa valeur, et le repli est alors ignoré', () => {
    render(
      <AccesAdminProvider acces={SOLO}>
        <Sonde roles={['super_admin']} />
      </AccesAdminProvider>,
    );
    expect(JSON.parse(screen.getByTestId('brut').textContent!)).toEqual(SOLO);
    expect(JSON.parse(screen.getByTestId('acces').textContent!)).toEqual(SOLO);
  });

  it('sans fournisseur : null, et un repli fail-closed dérivé des rôles', () => {
    render(<Sonde roles={['agency_admin']} agencyIsStandard={false} />);
    expect(screen.getByTestId('brut').textContent).toBe('null');
    // Capacités inconnues : « Abonnement » (agency.update_billing) n'y est pas.
    expect(JSON.parse(screen.getByTestId('acces').textContent!)).toEqual({
      chemins: [
        '/admin/agency',
        '/admin/agency/kyc',
        '/admin/finances',
        '/admin/finances/reconciliation',
        '/admin/settings/integrations',
      ],
      espaceIndividuel: true,
    });
  });
});
```

- [ ] **Step 2 : le voir échouer**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-web
npx vitest run src/lib/access/__tests__/acces-admin-contexte.test.tsx
```

Expected : FAIL — `Failed to resolve import "../acces-admin-contexte"`.

- [ ] **Step 3 : l'implémentation minimale**

`takussan-web/src/lib/access/acces-admin-contexte.tsx` :

```tsx
'use client';

import { createContext, useContext, type ReactNode } from 'react';

import { accesDepuis, contexteDeRepli, type AccesAdmin, type RepliAdmin } from './pages-admin';

/**
 * TCK-633 (lot B) — les pages `/admin/*` accessibles au profil actif, calculées UNE fois par le
 * layout serveur (`accesAdmin()`) et lues par les composants client qui montrent un lien vers
 * l'administration : `AdminSidebar`, `AdminShell`, `AppSidebar`, `UserMenu`, les raccourcis et les
 * états vides de l'accueil.
 *
 * La valeur est une liste de chemins et un booléen : sérialisable, elle traverse la frontière
 * serveur → client sans fonction ni icône.
 */
const Contexte = createContext<AccesAdmin | null>(null);

export function AccesAdminProvider({ acces, children }: { acces: AccesAdmin; children: ReactNode }) {
  return <Contexte.Provider value={acces}>{children}</Contexte.Provider>;
}

/** `null` quand aucun layout ne l'a fourni. */
export function useAccesAdmin(): AccesAdmin | null {
  return useContext(Contexte);
}

/**
 * La valeur fournie, ou — sans fournisseur (tests, coque montée ailleurs) — une dérivation
 * FAIL-CLOSED depuis ce que le composant sait déjà : rôles, agence, drapeau `standard`. Capacités
 * toujours inconnues dans ce repli : une page qui en exige une n'y figure jamais.
 */
export function useAccesAdminOuRepli(repli: RepliAdmin): AccesAdmin {
  const acces = useContext(Contexte);
  return acces ?? accesDepuis(contexteDeRepli(repli));
}
```

- [ ] **Step 4 : le voir passer**

```bash
npx vitest run src/lib/access/__tests__/acces-admin-contexte.test.tsx
```

Expected : PASS (2 tests).

- [ ] **Step 5 : ablation**

```bash
S="<scratchpad de l'agent>/tck-633-lot-b"; F=src/lib/access/acces-admin-contexte.tsx
cp "$F" "$S/acces-admin-contexte.tsx.ok"; md5 -q "$F" > "$S/acces-admin-contexte.tsx.md5"
```

Edit : `  return acces ?? accesDepuis(contexteDeRepli(repli));` →
`  return accesDepuis(contexteDeRepli(repli));` (et retirer la ligne `const acces = …` au-dessus).
Relancer → **FAIL** sur « fournit sa valeur, et le repli est alors ignoré ». Restaurer :

```bash
S="<scratchpad de l'agent>/tck-633-lot-b"; F=src/lib/access/acces-admin-contexte.tsx
cp "$S/acces-admin-contexte.tsx.ok" "$F"; md5 -q "$F" | diff - "$S/acces-admin-contexte.tsx.md5" && echo "restauré"
```

- [ ] **Step 6 : signaler à la session** le contexte et son test.

---

## Task 5 : `AdminSidebar` et `AdminShell` dérivés de la table

**Files :**
- Modify : `takussan-web/src/components/layout/AdminSidebar.tsx:7-26,88-159,161-207,235-265,293-295`
- Modify : `takussan-web/src/components/layout/AdminShell.tsx:1-21,44`
- Modify : `takussan-web/src/components/layout/__tests__/AdminSidebar.a11y.test.tsx` (E6)
- Test : `takussan-web/src/components/layout/__tests__/AdminSidebar.acces.test.tsx`

- [ ] **Step 1 : écrire les tests qui échouent**

`takussan-web/src/components/layout/__tests__/AdminSidebar.acces.test.tsx` :

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { AccesAdminProvider } from '@/lib/access/acces-admin-contexte';
import type { AccesAdmin } from '@/lib/access/pages-admin';
import type { User } from '@/types/user';
import { AdminSidebar } from '../AdminSidebar';

/**
 * TCK-633 (lot B, AC1) — la barre `/admin` ne liste QUE les pages que le profil actif peut ouvrir.
 * Elle les reçoit du layout (`AccesAdminProvider`) ; ce fichier les lui fournit directement.
 */
const { fetchModerationQueue } = vi.hoisted(() => ({
  fetchModerationQueue: vi.fn(async () => ({ meta: { pending_count: 3 } })),
}));

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/agency' }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));
vi.mock('@/lib/queries/reviews-moderation', () => ({
  fetchModerationQueue: () => fetchModerationQueue(),
}));
vi.mock('@/lib/queries/property-moderation', () => ({
  fetchPropertyModerationQueue: async () => ({ meta: { pending_count: 0 } }),
}));

const ADMIN = {
  id: 1,
  first_name: 'Awa',
  last_name: 'Diop',
  full_name: 'Awa Diop',
  email: 'awa@example.test',
  roles: ['agency_admin'],
  agency_id: 7,
  avatar_url: null,
} as unknown as User;

const SOLO: AccesAdmin = {
  chemins: [
    '/admin/agency',
    '/admin/agency/kyc',
    '/admin/agency/billing',
    '/admin/finances',
    '/admin/finances/reconciliation',
    '/admin/settings/integrations',
  ],
  espaceIndividuel: true,
};
const STANDARD: AccesAdmin = {
  chemins: [
    '/admin',
    '/admin/team',
    '/admin/roles',
    '/admin/agency',
    '/admin/agency/kyc',
    '/admin/agency/billing',
    '/admin/finances',
    '/admin/finances/reconciliation',
    '/admin/moderation',
    '/admin/moderation/properties',
    '/admin/audit',
    '/admin/settings/integrations',
  ],
  espaceIndividuel: false,
};

function monte(acces: AccesAdmin) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <AccesAdminProvider acces={acces}>
          <AdminSidebar user={ADMIN} agencyIsStandard={!acces.espaceIndividuel} />
        </AccesAdminProvider>
      </QueryClientProvider>,
    ),
  );
}

const liensDuMenu = () =>
  Array.from(document.querySelectorAll('nav a')).map((a) => a.getAttribute('href'));

describe('<AdminSidebar> — ne liste que les pages accessibles (TCK-633, AC1)', () => {
  beforeEach(() => fetchModerationQueue.mockClear());

  it('solo : « Mon espace », et seulement ses pages', () => {
    monte(SOLO);
    expect(screen.getByRole('navigation', { name: 'Mon espace' })).toBeInTheDocument();
    expect(liensDuMenu()).toEqual([
      '/admin/agency',
      '/admin/agency/kyc',
      '/admin/agency/billing',
      '/admin/finances',
      '/admin/settings/integrations',
    ]);
    expect(screen.queryByTitle('Réservé aux comptes pro')).toBeNull();
  });

  it("solo : la file d'avis n'est pas sondée — la page ne lui est pas ouverte", async () => {
    monte(SOLO);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchModerationQueue).not.toHaveBeenCalled();
  });

  it("admin standard : « Administration », les onze entrées d'avant, dans le même ordre", async () => {
    monte(STANDARD);
    expect(screen.getByRole('navigation', { name: 'Administration' })).toBeInTheDocument();
    expect(liensDuMenu()).toEqual([
      '/admin',
      '/admin/team',
      '/admin/roles',
      '/admin/agency',
      '/admin/agency/kyc',
      '/admin/agency/billing',
      '/admin/finances',
      '/admin/moderation',
      '/admin/moderation/properties',
      '/admin/audit',
      '/admin/settings/integrations',
    ]);
    await waitFor(() => expect(fetchModerationQueue).toHaveBeenCalled());
  });
});
```

Et, dans `AdminSidebar.a11y.test.tsx` (le fichier éprouvait les cadenas que ce lot retire, E6) :

Edit 1 (l. 2) :

```
old:
 * TCK-371 — lisibilité des entrées VERROUILLÉES et focus clavier de la barre `/admin`.
new:
 * TCK-371 — focus clavier de la barre `/admin` ; TCK-633 — elle ne liste plus que l'accessible.
```

Edit 2 (l. 30-42) :

```
old:
import {
  SEUIL_AA_TEXTE,
  SEUIL_NON_TEXTUEL,
  anneauDeFocus,
  composer,
  contraste,
  fmt,
  fondHerite,
  fondsPossibles,
  litUtilitaireDeCouleur,
  resoudreCouleur,
  versRvb,
} from '@/test/contraste-wcag';
new:
import {
  SEUIL_NON_TEXTUEL,
  anneauDeFocus,
  composer,
  contraste,
  fmt,
  fondsPossibles,
  versRvb,
} from '@/test/contraste-wcag';
```

Edit 3 (l. 61-71) :

```
old:
 * `agencyIsStandard={false}` est l'agence `individual` : c'est elle qui voit les cadenas — mais
 * `/admin`, `/admin/team` et `/admin/roles` sont dans `PRO_ROUTES`, donc l'entrée ACTIVE y est un
 * `<span>` verrouillé sur le fond NU de la barre. Le fond `bg-white/10` de l'entrée active — celui
 * dont l'anneau `--ring` mesurait 2,48:1 — n'est JAMAIS rendu par ce fixture. Mesuré : un test qui
 * ne rend que celui-ci ne voit que la barre nue et laisse passer le défaut qu'il prétend garder.
 *
 * `standard` rend donc la même barre sans cadenas, entrée active comprise.
 */
new:
 * `agencyIsStandard={false}` est l'agence `individual` : depuis TCK-633, `/admin`, `/admin/team` et
 * `/admin/roles` ne sont plus DANS sa barre — sur `/admin`, elle n'a donc aucune entrée active. Le
 * fond `bg-white/10` de l'entrée active — celui dont l'anneau `--ring` mesurait 2,48:1 — n'est rendu
 * que par le fixture `standard`. Mesuré : un test qui ne rend que le premier ne voit que la barre nue
 * et laisse passer le défaut qu'il prétend garder.
 *
 * Aucun `AccesAdminProvider` ici : la barre dérive ses pages du REPLI (`contexteDeRepli` : rôles et
 * `agencyIsStandard`, capacités inconnues).
 */
```

Edit 4 (l. 89-110) : supprimer la fonction `encreEffective` (de la ligne
`/** Encre effective d'un élément : son \`text-<jeton>[/alpha]\` composé sur le fond dont il hérite. */`
jusqu'à son `}` fermant, l. 104, et la ligne vide qui suit), et remplacer la ligne
`/** Tout ce que la barre rend de focusable : liens réels + l'entrée verrouillée \`tabindex=0\`. */`
par `/** Tout ce que la barre rend de focusable : des liens réels — il n'y a plus d'entrée verrouillée. */`.

Edit 5 (l. 113-158) : remplacer tout le bloc `describe('AC1 — contraste des entrées verrouillées', () => {`
… `});` (celui qui précède `describe('AC4 — anneau de focus`) par :

```tsx
describe('TCK-633 (AC1) — la barre ne liste que ce que le profil peut ouvrir', () => {
  it.each(PLANS)('aucune entrée verrouillée (agence %s)', (plan) => {
    rendreBarre(plan);
    expect(screen.queryAllByTitle('Réservé aux comptes pro')).toHaveLength(0);
    expect(document.querySelectorAll('[aria-disabled="true"]')).toHaveLength(0);
  });

  it('agence individual : « Mon espace », et seulement les pages sans exigence « standard »', () => {
    rendreBarre('individual');
    expect(screen.getByRole('navigation', { name: 'Mon espace' })).toBeInTheDocument();
    const hrefs = Array.from(document.querySelectorAll('nav a')).map((a) => a.getAttribute('href'));
    // Le repli ne connaît pas les capacités : « Abonnement » (agency.update_billing) n'y est pas.
    expect(hrefs).toEqual([
      '/admin/agency',
      '/admin/agency/kyc',
      '/admin/finances',
      '/admin/settings/integrations',
    ]);
  });

  it('agence standard : « Administration », tableau de bord en tête', () => {
    rendreBarre('standard');
    expect(screen.getByRole('navigation', { name: 'Administration' })).toBeInTheDocument();
    expect(document.querySelector('nav a')?.getAttribute('href')).toBe('/admin');
  });
});
```

Edit 6 (l. 228-230) :

```
old:
        // `/admin` est dans `PRO_ROUTES` : chez une agence `individual` l'entrée active est un
        // <span> verrouillé sur le fond nu. Le fond propre de l'entrée active n'existe QUE ici.
new:
        // TCK-633 — chez une agence `individual`, `/admin` n'est pas dans la barre : sur cette page,
        // aucune entrée n'est active. Le fond propre de l'entrée active n'existe QUE ici.
```

Edit 7 (l. 268-295) : supprimer tout le dernier bloc,
`describe('objectif du ticket — le cadenas s’ATTEINT et se LIT au clavier', () => {` … `});` (fin de
fichier) — l'entrée qu'il éprouvait n'existe plus.

- [ ] **Step 2 : les voir échouer**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-web
npx vitest run src/components/layout/__tests__/AdminSidebar.acces.test.tsx src/components/layout/__tests__/AdminSidebar.a11y.test.tsx
```

Expected : FAIL — `Unable to find role="navigation" and name "Mon espace"` (la barre dit encore
« Administration ») ; le solo voit encore `/admin` et ses cadenas (`aria-disabled` : 5 au lieu de 0) ;
`fetchModerationQueue` appelé pour le solo.

- [ ] **Step 3 : l'implémentation minimale** — `AdminSidebar.tsx`, quatre Edit.

Edit 1 (l. 7-26) :

```
old:
import {
  LayoutDashboard,
  Building2,
  Users,
  CreditCard,
  ShieldCheck,
  FileText,
  KeyRound,
  Settings,
  ArrowLeft,
  Shield,
  Briefcase,
  Lock,
  Plug,
  UserRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { User } from '@/types/user';
import { isSuperAdmin } from '@/lib/roles';
import { isProRouteLocked } from '@/lib/access/pro-features';
new:
import { ArrowLeft, UserRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { User } from '@/types/user';
import { entreesDeMenu, type AccesAdmin } from '@/lib/access/pages-admin';
import { useAccesAdminOuRepli } from '@/lib/access/acces-admin-contexte';
```

Edit 2 (l. 88-159) : remplacer de `interface NavItem {` jusqu'à la fin de `buildAdminItems`
(`  return items;\n}`) par :

```tsx
interface NavItem {
  href: string;
  /** CLÉ de libellé sous `nav.admin`, pas le libellé : `PAGES_ADMIN` est hors composant. */
  labelKey: string;
  icon: LucideIcon;
  badge?: number;
}

interface AdminSidebarProps {
  user: User;
  className?: string;
  onNavigate?: () => void;
  /** `true` quand l'agence active est `standard`. Sert au sondage du compteur de modération des
   *  biens et au REPLI quand aucun `AccesAdminProvider` n'est monté. */
  agencyIsStandard?: boolean;
}

/**
 * TCK-633 (lot B, AC1) — le menu ne liste QUE les pages que le profil actif peut ouvrir.
 *
 * L'ordre, les libellés et les icônes vivent dans `PAGES_ADMIN` (`@/lib/access/pages-admin`), la
 * table que la garde de chaque page lit aussi : une entrée ne peut plus mener à une page qui renvoie
 * ailleurs. Les entrées verrouillées de TCK-371 disparaissent avec elle — le ticket veut que l'on
 * « ne voie que ce qu'on peut ouvrir ». Les motifs de chaque ligne (TCK-279, TCK-370, TCK-597…)
 * sont écrits dans la table.
 */
function itemsDuMenu(
  acces: AccesAdmin,
  reviewPendingCount: number,
  propertyPendingCount: number,
): NavItem[] {
  const badges: Record<string, number> = {
    '/admin/moderation': reviewPendingCount,
    '/admin/moderation/properties': propertyPendingCount,
  };
  return entreesDeMenu(acces).map((entree) => ({
    href: entree.chemin,
    labelKey: entree.cle,
    icon: entree.icone,
    badge: badges[entree.chemin] || undefined,
  }));
}
```

Edit 3 (l. 161-207) :

```
old:
  badge,
  locked,
  active,
  onNavigate,
}: NavItem & { active: boolean; onNavigate?: () => void }) {
  const t = useTranslations('nav.admin');
  const label = t(labelKey);

  if (locked) {
```

… jusqu'à la fin de cette branche (`    );\n  }` qui précède `  return (\n    <Link`) — remplacer
tout ce passage par :

```tsx
  badge,
  active,
  onNavigate,
}: NavItem & { active: boolean; onNavigate?: () => void }) {
  const t = useTranslations('nav.admin');
  const label = t(labelKey);

```

Edit 4 (l. 235-265) :

```
old:
  const { token } = useAuth();

  const { data: modMeta } = useQuery({
    queryKey: ['reviews-moderation', 'pending-count'],
    queryFn: () =>
      fetchModerationQueue(token ?? '', { perPage: 1 }).then((r) => r.meta),
    enabled: Boolean(token),
new:
  const { token } = useAuth();
  const acces = useAccesAdminOuRepli({
    roles: user.roles,
    agencyId: user.agency_id,
    agencyIsStandard,
  });
  // TCK-633 — « Mon espace » chez un admin d'agence `individual`, comme partout ailleurs.
  const titre = acces.espaceIndividuel ? t('mySpace') : t('sectionLabel');

  const { data: modMeta } = useQuery({
    queryKey: ['reviews-moderation', 'pending-count'],
    queryFn: () =>
      fetchModerationQueue(token ?? '', { perPage: 1 }).then((r) => r.meta),
    // TCK-633 — on ne sonde pas la file d'une page que le profil ne peut pas ouvrir.
    enabled: Boolean(token) && acces.chemins.includes('/admin/moderation'),
```

Edit 5 :

```
old:
  const items = buildAdminItems(user, modMeta?.pending_count ?? 0, propModCount ?? 0)
    .map((item) => ({
      ...item,
      locked: isProRouteLocked(user, agencyIsStandard, item.href),
    }));
new:
  const items = itemsDuMenu(acces, modMeta?.pending_count ?? 0, propModCount ?? 0);
```

Edit 6 (l. 293-295) :

```
old:
        <p className="mt-1 px-1 md:mt-0 text-xs uppercase tracking-wider text-white/60">{t('sectionLabel')}</p>
      </div>
      <nav aria-label={t('sectionLabel')} className="flex-1 overflow-y-auto space-y-1 px-3">
new:
        <p className="mt-1 px-1 md:mt-0 text-xs uppercase tracking-wider text-white/60">{titre}</p>
      </div>
      <nav aria-label={titre} className="flex-1 overflow-y-auto space-y-1 px-3">
```

Puis `AdminShell.tsx`, deux Edit :

```
old:
import { BandeauxDuSite } from '@/components/announcements/BandeauxDuSite';
new:
import { BandeauxDuSite } from '@/components/announcements/BandeauxDuSite';
import { useAccesAdminOuRepli } from '@/lib/access/acces-admin-contexte';
```

```
old:
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const t = useTranslations('nav.admin');
new:
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const t = useTranslations('nav.admin');
  // TCK-633 — le tiroir porte le même nom que la barre : « Mon espace » chez un solo.
  const acces = useAccesAdminOuRepli({
    roles: user.roles,
    agencyId: user.agency_id,
    agencyIsStandard,
  });
```

```
old:
          <SheetContent side="left" className="bg-foreground p-0" aria-label={t('sectionLabel')}>
new:
          <SheetContent
            side="left"
            className="bg-foreground p-0"
            aria-label={acces.espaceIndividuel ? t('mySpace') : t('sectionLabel')}
          >
```

et le docblock de la prop (l. 14-16) :

```
old:
  /** `true` once the active agency is on `kind=standard`. Drives the sidebar
   *  padlock for Standard-only items when the agency is still `individual`. */
new:
  /** `true` once the active agency is on `kind=standard`. Repli de `AccesAdminProvider`
   *  (TCK-633) et sondage du compteur de modération des biens. */
```

`AdminShell` n'a pas de test de tiroir ouvert : le nom du tiroir est vérifié au navigateur (Task 15,
étape 4).

- [ ] **Step 4 : les voir passer**

```bash
npx vitest run src/components/layout/__tests__/AdminSidebar.acces.test.tsx \
  src/components/layout/__tests__/AdminSidebar.a11y.test.tsx \
  src/components/layout/__tests__/AdminSidebar.integrations.test.tsx \
  src/components/layout/__tests__/AppSidebar.test.tsx \
  src/components/layout/__tests__/Consoles.bandeaux.test.tsx \
  src/components/layout/__tests__/CoqueHauteur.test.tsx \
  src/components/dashboard/admin/__tests__/AgencyQueues.source-unique.test.tsx \
  src/test/__tests__/portees-sombres.test.tsx
```

Expected : PASS. `AppSidebar.test.tsx` y figure pour ses deux tests d'`AdminSidebar` (« AdminSidebar
le porte aussi », « n'allume plus DEUX modérations ») : super-admin, repli complet, inchangés.

- [ ] **Step 5 : ablation**

```bash
S="<scratchpad de l'agent>/tck-633-lot-b"; F=src/components/layout/AdminSidebar.tsx
cp "$F" "$S/AdminSidebar.tsx.ok"; md5 -q "$F" > "$S/AdminSidebar.tsx.md5"
```

1. Edit : `  const titre = acces.espaceIndividuel ? t('mySpace') : t('sectionLabel');` →
   `  const titre = t('sectionLabel');`. Relancer `AdminSidebar.acces.test.tsx` → **FAIL** sur
   « solo : « Mon espace » ».
2. Restaurer, puis Edit : `enabled: Boolean(token) && acces.chemins.includes('/admin/moderation'),`
   → `enabled: Boolean(token),`. Relancer → **FAIL** sur « la file d'avis n'est pas sondée ».

```bash
S="<scratchpad de l'agent>/tck-633-lot-b"; F=src/components/layout/AdminSidebar.tsx
cp "$S/AdminSidebar.tsx.ok" "$F"; md5 -q "$F" | diff - "$S/AdminSidebar.tsx.md5" && echo "restauré"
```

- [ ] **Step 6 : signaler à la session** `AdminSidebar.tsx`, `AdminShell.tsx`,
  `AdminSidebar.acces.test.tsx`, `AdminSidebar.a11y.test.tsx`.

---

## Task 6 : le layout `/admin` monte le fournisseur

**Files :**
- Modify : `takussan-web/src/app/(dashboard)/admin/layout.tsx:1-45`
- Test : `takussan-web/src/app/(dashboard)/admin/__tests__/layout.acces.test.tsx`

- [ ] **Step 1 : écrire le test qui échoue**

`takussan-web/src/app/(dashboard)/admin/__tests__/layout.acces.test.tsx` :

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

import type { AccesAdmin } from '@/lib/access/pages-admin';
import type { User } from '@/types/user';

/**
 * TCK-633 (lot B) — le layout `/admin` calcule les pages accessibles UNE fois et les fournit à la
 * coque. Le layout est EXÉCUTÉ ; la coque est remplacée par une sonde qui lit le contexte.
 */
const { getMe, accesAdmin, sonde, redirect } = vi.hoisted(() => ({
  getMe: vi.fn(),
  accesAdmin: vi.fn(),
  sonde: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }));
vi.mock('@/app/actions/auth', () => ({ getMeAction: () => getMe() }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/access/server-guards', () => ({
  resolveAgencyOrNull: async () => ({ id: 7, kind: 'individual' }),
}));
vi.mock('@/lib/access/pages-admin-server', () => ({ accesAdmin: (u: User) => accesAdmin(u) }));
vi.mock('@/i18n/messages', () => ({ messagesPour: async () => ({}) }));
vi.mock('@/i18n/IntlProvider', () => ({
  IntlProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/layout/AdminShell', async () => {
  const { useAccesAdmin } = await import('@/lib/access/acces-admin-contexte');
  return {
    AdminShell: (props: { agencyIsStandard?: boolean }) => {
      sonde({ acces: useAccesAdmin(), agencyIsStandard: props.agencyIsStandard });
      return null;
    },
  };
});

const { default: AdminLayout } = await import('../layout');

describe('layout /admin — le fournisseur d’accès (TCK-633)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fournit à la coque les pages accessibles du profil actif', async () => {
    const user = { id: 1, roles: ['agency_admin'], agency_id: 7 } as unknown as User;
    const acces: AccesAdmin = { chemins: ['/admin/agency'], espaceIndividuel: true };
    getMe.mockResolvedValue(user);
    accesAdmin.mockResolvedValue(acces);

    render(await AdminLayout({ children: null }));

    expect(accesAdmin).toHaveBeenCalledWith(user);
    expect(sonde).toHaveBeenLastCalledWith({ acces, agencyIsStandard: false });
  });

  it('éjecte toujours un non-admin vers son profil, sans rien calculer', async () => {
    getMe.mockResolvedValue({ id: 2, roles: ['customer'], agency_id: null });
    await expect(AdminLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT /app/profile');
    expect(accesAdmin).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2 : le voir échouer**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-web
npx vitest run "src/app/(dashboard)/admin/__tests__/layout.acces.test.tsx"
```

Expected : FAIL — `accesAdmin` jamais appelé ; la sonde reçoit `acces: null`.

- [ ] **Step 3 : l'implémentation minimale** — `admin/layout.tsx`, trois Edit.

```
old:
import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';
new:
import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';
import { accesAdmin } from '@/lib/access/pages-admin-server';
import { AccesAdminProvider } from '@/lib/access/acces-admin-contexte';
```

```
old:
 * Hydrate `agencyIsStandard` so the sidebar can padlock Standard-only items
 * for agency_admins still on `kind=individual` (mirroring AppLayout/AppShell).
new:
 * TCK-633 — fournit `AccesAdminProvider` : les pages `/admin/*` accessibles au profil actif,
 * calculées ici UNE fois (`accesAdmin`) et lues par la barre, le tiroir et le menu utilisateur.
 * `agencyIsStandard` reste pour le compteur de modération des biens. La décision d'ouvrir une page,
 * elle, est prise par la page (`garderPageAdmin`).
```

```
old:
  return (
    <IntlProvider messages={await messagesPour('(dashboard)/admin')}>
      <AdminShell user={user} agencyIsStandard={agencyIsStandard}>
        {children}
      </AdminShell>
    </IntlProvider>
  );
new:
  // `resolveAgencyOrNull` est mis en cache pour le rendu : `accesAdmin` relit la même promesse.
  const acces = await accesAdmin(user);

  return (
    <IntlProvider messages={await messagesPour('(dashboard)/admin')}>
      <AccesAdminProvider acces={acces}>
        <AdminShell user={user} agencyIsStandard={agencyIsStandard}>
          {children}
        </AdminShell>
      </AccesAdminProvider>
    </IntlProvider>
  );
```

- [ ] **Step 4 : le voir passer**

```bash
npx vitest run "src/app/(dashboard)/admin/__tests__/layout.acces.test.tsx"
```

Expected : PASS (2 tests).

- [ ] **Step 5 : ablation**

```bash
S="<scratchpad de l'agent>/tck-633-lot-b"; F="src/app/(dashboard)/admin/layout.tsx"
cp "$F" "$S/admin-layout.tsx.ok"; md5 -q "$F" > "$S/admin-layout.tsx.md5"
```

Edit : `<AccesAdminProvider acces={acces}>` → `<AccesAdminProvider acces={null as never}>`. Relancer
→ **FAIL** sur « fournit à la coque » (`acces: null`). Restaurer :

```bash
S="<scratchpad de l'agent>/tck-633-lot-b"; F="src/app/(dashboard)/admin/layout.tsx"
cp "$S/admin-layout.tsx.ok" "$F"; md5 -q "$F" | diff - "$S/admin-layout.tsx.md5" && echo "restauré"
```

- [ ] **Step 6 : signaler à la session** `admin/layout.tsx` et `layout.acces.test.tsx`.

---

## Task 7 : l'entrée d'administration d'`AppSidebar` *(co-tenu B, F)*

**Files :**
- Modify : `takussan-web/src/components/layout/AppSidebar.tsx:37,101-109,410,425-436,589-592,625`
- Modify : `takussan-web/src/components/layout/__tests__/AppSidebar.test.tsx:583-588` *(E5)*
- Test : `takussan-web/src/components/layout/__tests__/AppSidebar.acces-admin.test.tsx`

`buildNavItems` (exportée, éprouvée par `AppSidebar.test.tsx` et `AppSidebar.audience.test.tsx` via
`HREFS_PAR_ROLE`) **n'est pas modifiée** : elle continue de poser l'emplacement `/admin` de la
section `admin`, et c'est le **composant** qui le remplace (ou le retire) selon les pages
accessibles. Le lot F ajoute son entrée « Crédits » dans `buildNavItems` : aucun bloc de cette tâche
ne la touche.

- [ ] **Step 1 : écrire le test qui échoue**

`takussan-web/src/components/layout/__tests__/AppSidebar.acces-admin.test.tsx` :

```tsx
import { describe, expect, it, vi } from 'vitest';
import { ShieldCheck } from 'lucide-react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { AccesAdminProvider } from '@/lib/access/acces-admin-contexte';
import type { AccesAdmin } from '@/lib/access/pages-admin';
import type { User } from '@/types/user';
import { AppSidebar, avecEntreeAdmin, type NavItem } from '../AppSidebar';

/**
 * TCK-633 (lot B, AC1) — l'entrée d'administration de la barre `/app` mène à une page que le profil
 * peut ouvrir : « Mon espace » vers la première page d'un solo, rien s'il n'y en a aucune.
 */
vi.mock('next/navigation', () => ({ usePathname: () => '/app' }));
vi.mock('@/components/chat-widget/useUnreadCount', () => ({ useUnreadCount: () => 0 }));
vi.mock('@/lib/queries/visits', () => ({ usePendingVisitsCount: () => ({}) }));
vi.mock('@/lib/queries/contact-leads', () => ({ useUnhandledLeadsCount: () => ({}) }));

const SOLO: AccesAdmin = {
  chemins: ['/admin/agency', '/admin/agency/kyc', '/admin/finances'],
  espaceIndividuel: true,
};
const STANDARD: AccesAdmin = { chemins: ['/admin', '/admin/team', '/admin/agency'], espaceIndividuel: false };
const AUCUN: AccesAdmin = { chemins: [], espaceIndividuel: false };

const ADMIN = {
  id: 1,
  first_name: 'Awa',
  last_name: 'Diop',
  full_name: 'Awa Diop',
  email: 'awa@example.test',
  avatar_url: null,
  roles: ['agency_admin'],
  agency_id: 7,
} as unknown as User;

function monte(acces: AccesAdmin, agencyIsStandard?: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <AccesAdminProvider acces={acces}>
          <AppSidebar user={ADMIN} agencyIsStandard={agencyIsStandard} />
        </AccesAdminProvider>
      </QueryClientProvider>,
    ),
  );
}

const emplacement = (href: string): NavItem => ({
  href,
  labelKey: 'administration',
  icon: ShieldCheck,
  section: 'admin',
  emphasized: true,
});

describe('avecEntreeAdmin (TCK-633)', () => {
  it("remplace la destination et le libellé de l'entrée de section « admin »", () => {
    expect(avecEntreeAdmin([emplacement('/admin')], { href: '/admin/agency', cle: 'mySpace' })).toEqual([
      { ...emplacement('/admin'), href: '/admin/agency', labelKey: 'mySpace', labelSpace: 'nav.admin' },
    ]);
  });

  it("retire l'entrée quand aucune page n'est accessible, et ne touche à rien d'autre", () => {
    const accueil: NavItem = { href: '/app', labelKey: 'dashboard', icon: ShieldCheck, section: 'primary' };
    expect(avecEntreeAdmin([accueil, emplacement('/admin')], null)).toEqual([accueil]);
  });
});

describe("<AppSidebar> — l'entrée d'administration suit les pages accessibles", () => {
  it('un solo voit « Mon espace » vers sa première page, sans en-tête « Administration »', () => {
    const { container } = monte(SOLO, false);
    expect(screen.getByRole('link', { name: 'Mon espace' })).toHaveAttribute('href', '/admin/agency');
    expect(container.querySelector('a[href="/admin"]')).toBeNull();
    const entetes = Array.from(container.querySelectorAll('nav p')).map((p) => p.textContent?.trim());
    expect(entetes).not.toContain('Administration');
  });

  it('un admin standard garde « Administration » vers /admin', () => {
    monte(STANDARD, true);
    expect(screen.getByRole('link', { name: 'Administration' })).toHaveAttribute('href', '/admin');
  });

  it("aucune page accessible : aucune entrée d'administration", () => {
    const { container } = monte(AUCUN, true);
    expect(container.querySelector('nav a[href^="/admin"]')).toBeNull();
  });
});
```

Et dans `AppSidebar.test.tsx` *(E5 — accord requis, sinon `collisions`)*, l. 583-588 :

```
old:
    // TROIS entrées sont cadenassées pour un agency_admin `individual` : « Vue agence »,
    // « Bailleurs » et « Administration » (`/admin` figure aussi dans `PRO_ROUTES`).
    const cadenasses = screen.getAllByTitle('Réservé aux comptes pro');
    expect(cadenasses).toHaveLength(3);
new:
    // DEUX entrées sont cadenassées pour un agency_admin `individual` : « Vue agence » et
    // « Bailleurs ». TCK-633 — l'entrée d'administration n'est plus un cadenas : elle devient
    // « Mon espace », vers la première page que l'agence peut ouvrir.
    const cadenasses = screen.getAllByTitle('Réservé aux comptes pro');
    expect(cadenasses).toHaveLength(2);
```

- [ ] **Step 2 : le voir échouer**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-web
npx vitest run src/components/layout/__tests__/AppSidebar.acces-admin.test.tsx src/components/layout/__tests__/AppSidebar.test.tsx
```

Expected : FAIL — `avecEntreeAdmin is not a function` (import) ; `AppSidebar.test.tsx` « l'entrée
cadenassée » attend 2, reçoit 3.

- [ ] **Step 3 : l'implémentation minimale** — `AppSidebar.tsx`, six Edit ancrés (co-tenu :
  relire avant chacun ; si une ancre a bougé parce que F a écrit, relire et rejouer).

Edit 1 :

```
old:
import { isProRouteLocked } from '@/lib/access/pro-features';
new:
import { isProRouteLocked } from '@/lib/access/pro-features';
import { entreeAdmin, type EntreeAdmin } from '@/lib/access/pages-admin';
import { useAccesAdminOuRepli } from '@/lib/access/acces-admin-contexte';
```

Edit 2 :

```
old:
  locked?: boolean;
  counterKey?: NavCounterKey;
}
new:
  locked?: boolean;
  counterKey?: NavCounterKey;
  /** TCK-633 — espace de la clé de libellé ; `nav.sidebar` par défaut. */
  labelSpace?: 'nav.admin';
}
```

Edit 3 :

```
old:
const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
new:
const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * TCK-633 (lot B, AC1) — l'entrée de la section `admin` mène à la PREMIÈRE page `/admin/*` que le
 * profil actif peut ouvrir (`entreeAdmin`, table `PAGES_ADMIN`), sous le libellé « Administration »
 * ou « Mon espace » ; elle disparaît s'il n'y en a aucune.
 *
 * `buildNavItems` continue de poser l'emplacement `/admin` : son jeu d'`href` par rôle est un
 * contrat éprouvé (`HREFS_PAR_ROLE`), et la décision d'accès n'a pas sa place dans une fonction qui
 * ne connaît que les rôles. Avant, un admin d'agence `individual` y voyait un cadenas devant
 * « Administration » — une porte peinte sur un mur.
 */
export function avecEntreeAdmin(items: NavItem[], entree: EntreeAdmin | null): NavItem[] {
  return items.flatMap((item) => {
    if (item.section !== 'admin') return [item];
    if (entree === null) return [];
    return [{ ...item, href: entree.href, labelKey: entree.cle, labelSpace: 'nav.admin' as const }];
  });
}
```

Edit 4 :

```
old:
  counterKey,
  counter,
  onNavigate,
}: NavItem & { active: boolean; counter?: number; onNavigate?: () => void }) {
  const t = useTranslations('nav.sidebar');
  const label = t(labelKey);
new:
  counterKey,
  counter,
  onNavigate,
  labelSpace,
}: NavItem & { active: boolean; counter?: number; onNavigate?: () => void }) {
  const t = useTranslations('nav.sidebar');
  const tAdmin = useTranslations('nav.admin');
  const label = labelSpace === 'nav.admin' ? tAdmin(labelKey) : t(labelKey);
```

Edit 5 :

```
old:
  const navItems = buildNavItems(user).map((item) => ({
    ...item,
    locked: isProRouteLocked(user, agencyIsStandard, item.href),
  }));
new:
  const accesAdmin = useAccesAdminOuRepli({
    roles: user.roles,
    agencyId: user.agency_id,
    agencyIsStandard,
  });
  const navItems = avecEntreeAdmin(buildNavItems(user), entreeAdmin(accesAdmin)).map((item) => ({
    ...item,
    locked: isProRouteLocked(user, agencyIsStandard, item.href),
  }));
```

Edit 6 :

```
old:
          const labelKey = SECTION_LABEL_KEYS[group.section];
new:
          // TCK-633 — chez un solo, l'entrée dit déjà « Mon espace » : un en-tête « Administration »
          // au-dessus la contredirait.
          const labelKey =
            group.section === 'admin' && accesAdmin.espaceIndividuel
              ? null
              : SECTION_LABEL_KEYS[group.section];
```

- [ ] **Step 4 : le voir passer**

```bash
npx vitest run src/components/layout/__tests__/AppSidebar.acces-admin.test.tsx \
  src/components/layout/__tests__/AppSidebar.test.tsx \
  src/components/layout/__tests__/AppSidebar.audience.test.tsx \
  src/components/layout/__tests__/AppSidebar.proposition.test.ts
```

Expected : PASS. Dans `AppSidebar.test.tsx`, « les en-têtes paraissent dans l'ordre du parcours
métier » attend toujours `'Administration'` en dernier : agency_admin, `agencyIsStandard`, repli
`standard`, en-tête conservé.

- [ ] **Step 5 : ablation (protocole co-tenu)**

```bash
S="<scratchpad de l'agent>/tck-633-lot-b"; F=src/components/layout/AppSidebar.tsx
cp "$F" "$S/AppSidebar.tsx.ok"; md5 -q "$F" > "$S/avant.md5"
```

Edit : `avecEntreeAdmin(buildNavItems(user), entreeAdmin(accesAdmin))` → `buildNavItems(user)`.
`md5 -q "$F" > "$S/ablate.md5"`. Relancer `AppSidebar.acces-admin.test.tsx` → **FAIL** sur « un solo
voit « Mon espace » » (et `AppSidebar.test.tsx` repasse à 3 cadenas). Restaurer : `md5 -q "$F" | diff
- "$S/ablate.md5"` identique → `cp "$S/AppSidebar.tsx.ok" "$F"` ; sinon Edit inverse. Puis
`md5 -q "$F" | diff - "$S/avant.md5" && echo "restauré"`. Trois `md5` au rapport.

- [ ] **Step 6 : signaler à la session** `AppSidebar.tsx` (co-tenu : préciser les six blocs),
  `AppSidebar.acces-admin.test.tsx`, et `AppSidebar.test.tsx` (si accordé).

---

## Task 8 : la garde de CHAQUE page `/admin/*`

**Files :**
- Test : `takussan-web/src/app/(dashboard)/admin/__tests__/gardes.test.tsx`
- Modify (sous `takussan-web/src/app/(dashboard)/admin/`) : `page.tsx`, `agency/page.tsx`,
  `agency/kyc/page.tsx`, `agency/billing/page.tsx`, `audit/page.tsx`, `finances/page.tsx`,
  `finances/reconciliation/page.tsx`, `finances/reconciliation/[statementId]/page.tsx`,
  `moderation/page.tsx`, `moderation/properties/page.tsx`, `roles/page.tsx`, `team/page.tsx`,
  `settings/page.tsx`, `settings/integrations/page.tsx`, `properties/page.tsx`
- Modify (tests existants) : `__tests__/page.files-attente.test.tsx`,
  `__tests__/redirection-tags.test.tsx`, `agency/billing/__tests__/page.hote-individuel.test.tsx`,
  `settings/integrations/__tests__/page.test.tsx`, `agency/__tests__/page.watermarks.test.tsx`

- [ ] **Step 1 : écrire le test qui échoue**

`takussan-web/src/app/(dashboard)/admin/__tests__/gardes.test.tsx` :

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PAGES_ADMIN } from '@/lib/access/pages-admin';

/**
 * TCK-633 (lot B, AC1) — CHAQUE page `/admin/*` appelle `garderPageAdmin(<son chemin>)`, et l'appelle
 * EN PREMIER : avant de lire l'utilisateur, avant toute donnée.
 *
 * La garde est remplacée par une sonde qui LÈVE : si la page la passe, la page continue, lit
 * `getMeAction` — remplacé par une sonde qui lève aussi, avec un autre message. Le test distingue
 * donc « gardée en premier », « gardée trop tard » et « pas gardée ». Les composants et actions des
 * pages ne sont qu'importés (la garde lève avant eux) : ils sont remplacés par des souches.
 */
const { garde, getMe } = vi.hoisted(() => ({
  garde: vi.fn(async (chemin: string) => {
    throw new Error(`GARDE:${chemin}`);
  }),
  getMe: vi.fn(async () => {
    throw new Error('getMeAction appelé AVANT la garde');
  }),
}));

vi.mock('@/lib/access/pages-admin-server', () => ({ garderPageAdmin: (c: string) => garde(c) }));
vi.mock('@/app/actions/auth', () => ({ getMeAction: () => getMe() }));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn(), permanentRedirect: vi.fn() }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/access/server-guards', () => ({ resolveAgencyOrNull: async () => null }));
vi.mock('@/components/admin/AdminNotice', () => ({
  AdminNotice: () => null,
  resoudreAvisAdmin: async () => null,
}));
vi.mock('@/components/dashboard/admin/AgencyActivityFeed', () => ({ AgencyActivityFeed: () => null }));
vi.mock('@/components/dashboard/admin/AgencyDegradedState', () => ({ AgencyDegradedState: () => null }));
vi.mock('@/components/dashboard/admin/AgencyKpis', () => ({ AgencyKpis: () => null }));
vi.mock('@/components/dashboard/admin/AgencyQueues', () => ({ AgencyQueues: () => null }));
vi.mock('@/components/dashboard/admin/AgencyRevenueSnapshot', () => ({ AgencyRevenueSnapshot: () => null }));
vi.mock('@/components/dashboard/admin/MiseEnService', () => ({ MiseEnService: () => null }));
vi.mock('@/components/console', () => ({ PageHeader: () => null }));
vi.mock('@/components/shared/NoAgencyState', () => ({ NoAgencyState: () => null }));
vi.mock('@/lib/queries/dashboard-agency', () => ({ fetchDashboardAgency: async () => null }));
vi.mock('@/app/actions/admin-agency', () => ({ fetchAgencyAction: async () => ({ ok: false, message: '' }) }));
vi.mock('@/components/admin-agency/AgencyConfigForm', () => ({ AgencyConfigForm: () => null }));
vi.mock('@/components/admin-agency/RegenerateWatermarksCard', () => ({ RegenerateWatermarksCard: () => null }));
vi.mock('@/components/feedback', () => ({ EmptyState: () => null, ErrorState: () => null }));
vi.mock('@/components/kyc/AgencyKycClient', () => ({ AgencyKycClient: () => null }));
vi.mock('@/components/billing/AgencyBillingClient', () => ({ AgencyBillingClient: () => null }));
vi.mock('@/components/billing/AgencyPayoutsClient', () => ({ AgencyPayoutsClient: () => null }));
vi.mock('@/components/admin/AuditTrail', () => ({ AuditTrail: () => null }));
vi.mock('@/app/(dashboard)/admin/finances/AdminFinancesClient', () => ({ AdminFinancesClient: () => null }));
vi.mock('@/components/admin/reconciliation/ReconciliationClient', () => ({ ReconciliationClient: () => null }));
vi.mock('@/components/admin/reconciliation/StatementDetail', () => ({ StatementDetail: () => null }));
vi.mock('@/components/admin/ModerationWorkspace', () => ({ ModerationWorkspace: () => null }));
vi.mock('@/components/admin/PropertyModerationWorkspace', () => ({ PropertyModerationWorkspace: () => null }));
vi.mock('@/components/admin/roles/AgencyRolesConsole', () => ({ AgencyRolesConsole: () => null }));
vi.mock('@/components/admin/roles/RoleDelegationsSection', () => ({ RoleDelegationsSection: () => null }));
vi.mock('@/components/admin/TeamConsole', () => ({ TeamConsole: () => null }));
vi.mock('@/components/admin/InviteMemberButton', () => ({ InviteMemberButton: () => null }));
vi.mock('@/app/actions/admin-settings', () => ({
  fetchSettingsAction: async () => ({ ok: false, message: '' }),
  fetchIntegrationsAction: async () => ({ ok: false, message: '' }),
  fetchPaymentProviderSchemasAction: async () => ({ ok: false, message: '' }),
  fetchIntegrationWebhookEndpointAction: async () => ({ ok: false, message: '' }),
}));
vi.mock('@/components/admin-settings/SettingsManager', () => ({ SettingsManager: () => null }));
vi.mock('@/components/admin-settings/SettingsTabs', () => ({ SettingsTabs: () => null }));
vi.mock('@/components/admin-settings/IntegrationsManager', () => ({ IntegrationsManager: () => null }));
vi.mock('@/app/(dashboard)/app/properties/(liste)/page', () => ({
  default: async () => null,
  generateMetadata: async () => ({}),
}));

type PageServeur = (props: never) => Promise<unknown>;

/** [chemin gardé, fichier, chargement, props] — une ligne par `page.tsx` qui n'est pas une souche. */
const CAS: ReadonlyArray<readonly [string, string, () => Promise<{ default: unknown }>, unknown]> = [
  ['/admin', 'page.tsx', () => import('../page'), {}],
  ['/admin/properties', 'properties/page.tsx', () => import('../properties/page'), { searchParams: Promise.resolve({}) }],
  ['/admin/team', 'team/page.tsx', () => import('../team/page'), undefined],
  ['/admin/roles', 'roles/page.tsx', () => import('../roles/page'), undefined],
  ['/admin/agency', 'agency/page.tsx', () => import('../agency/page'), undefined],
  ['/admin/agency/kyc', 'agency/kyc/page.tsx', () => import('../agency/kyc/page'), undefined],
  ['/admin/agency/billing', 'agency/billing/page.tsx', () => import('../agency/billing/page'), undefined],
  ['/admin/finances', 'finances/page.tsx', () => import('../finances/page'), undefined],
  [
    '/admin/finances/reconciliation',
    'finances/reconciliation/page.tsx',
    () => import('../finances/reconciliation/page'),
    undefined,
  ],
  [
    '/admin/finances/reconciliation',
    'finances/reconciliation/[statementId]/page.tsx',
    () => import('../finances/reconciliation/[statementId]/page'),
    { params: Promise.resolve({ statementId: '3' }) },
  ],
  ['/admin/moderation', 'moderation/page.tsx', () => import('../moderation/page'), undefined],
  [
    '/admin/moderation/properties',
    'moderation/properties/page.tsx',
    () => import('../moderation/properties/page'),
    undefined,
  ],
  ['/admin/audit', 'audit/page.tsx', () => import('../audit/page'), undefined],
  [
    '/admin/settings/integrations',
    'settings/integrations/page.tsx',
    () => import('../settings/integrations/page'),
    undefined,
  ],
  ['/admin/settings', 'settings/page.tsx', () => import('../settings/page'), undefined],
];

describe('TCK-633 — chaque page /admin/* appelle garderPageAdmin EN PREMIER', () => {
  beforeEach(() => {
    garde.mockClear();
    getMe.mockClear();
  });

  it.each(CAS)('%s (%s)', async (chemin, _fichier, charger, props) => {
    const { default: Page } = await charger();
    await expect((Page as PageServeur)(props as never)).rejects.toThrow(`GARDE:${chemin}`);
    expect(garde).toHaveBeenCalledTimes(1);
    expect(garde).toHaveBeenCalledWith(chemin);
    expect(getMe).not.toHaveBeenCalled();
  });

  it('chaque chemin de PAGES_ADMIN a sa page dans ce tableau', () => {
    expect(new Set(CAS.map(([chemin]) => chemin))).toEqual(new Set(PAGES_ADMIN.map((p) => p.chemin)));
  });
});
```

- [ ] **Step 2 : le voir échouer**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-web
npx vitest run "src/app/(dashboard)/admin/__tests__/gardes.test.tsx"
```

Expected : FAIL sur les 15 cas — `getMeAction appelé AVANT la garde` (ou, pour `/admin/properties`,
`promise resolved "null" instead of rejecting`) ; le test de couverture de la table passe déjà.
Si un import échoue (« Failed to resolve » / module qui lève à l'import), ajouter la souche du module
nommé dans l'erreur, sur le modèle des lignes ci-dessus, et le noter au rapport.

- [ ] **Step 3 : l'implémentation minimale** — par page, des Edit ancrés. Le principe est le même
  partout : `await garderPageAdmin('<chemin>');` en **première instruction** de l'export par défaut ;
  retrait des `isAdmin` / `isSuperAdmin` / `ensureStandardAgencyOrRedirect` / `redirect` devenus
  inutiles. Chaque bloc `old` ci-dessous a été lu.

**`page.tsx` (`/admin`)**

```
old:
import { ensureStandardAgencyOrRedirect, resolveAgencyOrNull } from '@/lib/access/server-guards';
new:
import { resolveAgencyOrNull } from '@/lib/access/server-guards';
import { garderPageAdmin } from '@/lib/access/pages-admin-server';
```

```
old:
}) {
  const t = await getTranslations('admin.pages.home');
new:
}) {
  // TCK-633 (lot B) — la garde d'abord : rôle, `kind` et capacités se jugent dans `PAGES_ADMIN`.
  await garderPageAdmin('/admin');
  const t = await getTranslations('admin.pages.home');
```

```
old:
  await ensureStandardAgencyOrRedirect(user);

  const agencyId = typeof user.agency_id === 'number' ? user.agency_id : null;
new:
  const agencyId = typeof user.agency_id === 'number' ? user.agency_id : null;
```

```
old:
  // ⚠️ **Et il rend `true` sur cet écran, toujours.** Mesuré le 2026-08-27 : `/admin` figure dans
  // `PRO_ROUTES` et l'`ensureStandardAgencyOrRedirect` ci-dessus renvoie sur `/app` toute agence
  // dont le `kind` n'est pas `standard`. La branche `individual` du bloc de files est donc
new:
  // ⚠️ **Et il rend `true` sur cet écran, toujours.** `garderPageAdmin('/admin')` ci-dessus renvoie
  // toute agence dont le `kind` n'est pas `standard` vers sa première page accessible (TCK-633 ;
  // avant, `ensureStandardAgencyOrRedirect` la renvoyait sur `/app`). La branche `individual` du bloc de files est donc
```

**`agency/page.tsx`**

```
old:
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
new:
import { getTranslations } from 'next-intl/server';
```

```
old:
import { isAdmin } from '@/lib/roles';
import { AgencyConfigForm } from '@/components/admin-agency/AgencyConfigForm';
new:
import { garderPageAdmin } from '@/lib/access/pages-admin-server';
import { AgencyConfigForm } from '@/components/admin-agency/AgencyConfigForm';
```

```
old:
export default async function Page() {
  const tPage = await getTranslations('admin.pages.agencyConfig');
  const user = await getMeAction();
  if (!isAdmin(user.roles)) {
    redirect('/admin');
  }
new:
export default async function Page() {
  await garderPageAdmin('/admin/agency');
  const tPage = await getTranslations('admin.pages.agencyConfig');
  const user = await getMeAction();
```

**`agency/kyc/page.tsx`**

```
old:
import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { isAdmin } from '@/lib/roles';
new:
import { getMeAction } from '@/app/actions/auth';
import { garderPageAdmin } from '@/lib/access/pages-admin-server';
```

```
old:
export default async function Page() {
  const t = await getTranslations('admin.pages.kyc');
  const user = await getMeAction();
  if (!isAdmin(user.roles)) {
    redirect('/admin');
  }
new:
export default async function Page() {
  await garderPageAdmin('/admin/agency/kyc');
  const t = await getTranslations('admin.pages.kyc');
  const user = await getMeAction();
```

**`agency/billing/page.tsx`**

```
old:
import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
new:
import { getMeAction } from '@/app/actions/auth';
import { garderPageAdmin } from '@/lib/access/pages-admin-server';
```

```
old:
import { isAdmin, isSuperAdmin } from '@/lib/roles';
new:
import { isSuperAdmin } from '@/lib/roles';
```

```
old:
export default async function Page() {
  const t = await getTranslations('admin.pages.billing');
  const user = await getMeAction();
  if (!isAdmin(user.roles)) redirect('/admin');
new:
export default async function Page() {
  // TCK-633 — `agency.update_billing` exigée, comme l'API (`AgencyPolicy::viewPlatformPayouts`).
  await garderPageAdmin('/admin/agency/billing');
  const t = await getTranslations('admin.pages.billing');
  const user = await getMeAction();
```

**`audit/page.tsx`** (n'emploie plus `user` : `getMeAction` part aussi)

```
old:
import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { isAdmin } from '@/lib/roles';
import { AuditTrail } from '@/components/admin/AuditTrail';
import { PageHeader } from '@/components/console';
import { ensureStandardAgencyOrRedirect } from '@/lib/access/server-guards';
new:
import { AuditTrail } from '@/components/admin/AuditTrail';
import { PageHeader } from '@/components/console';
import { garderPageAdmin } from '@/lib/access/pages-admin-server';
```

```
old:
 * Requires agency_admin or super_admin role. Standard-only: agency_admins on
 * `kind=individual` are bounced to /app.
 */
export default async function AuditPage() {
  const t = await getTranslations('admin.pages.audit');
  const user = await getMeAction();
  if (!isAdmin(user.roles)) redirect('/admin');
  await ensureStandardAgencyOrRedirect(user);
new:
 * Requires agency_admin or super_admin role. Standard-only (TCK-633 : `PAGES_ADMIN`) — un admin
 * d'agence `individual` est renvoyé vers sa première page accessible.
 */
export default async function AuditPage() {
  await garderPageAdmin('/admin/audit');
  const t = await getTranslations('admin.pages.audit');
```

**`finances/page.tsx`** (`redirect` reste : super-admin sans agence → `/super-admin`)

```
old:
import { NoAgencyState } from '@/components/shared/NoAgencyState';
import { isAdmin, isSuperAdmin } from '@/lib/roles';
new:
import { NoAgencyState } from '@/components/shared/NoAgencyState';
import { garderPageAdmin } from '@/lib/access/pages-admin-server';
import { isSuperAdmin } from '@/lib/roles';
```

```
old:
export default async function Page() {
  const t = await getTranslations('admin.pages.finances');
  const user = await getMeAction();
  if (!isAdmin(user.roles)) redirect('/app/profile');
new:
export default async function Page() {
  await garderPageAdmin('/admin/finances');
  const t = await getTranslations('admin.pages.finances');
  const user = await getMeAction();
```

**`finances/reconciliation/page.tsx`**

```
old:
import { getMeAction } from '@/app/actions/auth';
import { PageHeader } from '@/components/console';
import { ReconciliationClient } from '@/components/admin/reconciliation/ReconciliationClient';
new:
import { getMeAction } from '@/app/actions/auth';
import { PageHeader } from '@/components/console';
import { ReconciliationClient } from '@/components/admin/reconciliation/ReconciliationClient';
import { garderPageAdmin } from '@/lib/access/pages-admin-server';
```

```
old:
export default async function Page() {
  const t = await getTranslations('admin.reconciliation');
new:
export default async function Page() {
  // TCK-633 — la page juge son accès (`PAGES_ADMIN`) ; l'API rejuge chaque appel (`BankStatementPolicy`).
  await garderPageAdmin('/admin/finances/reconciliation');
  const t = await getTranslations('admin.reconciliation');
```

**`finances/reconciliation/[statementId]/page.tsx`**

```
old:
import { getMeAction } from '@/app/actions/auth';
import { PageHeader } from '@/components/console';
import { StatementDetail } from '@/components/admin/reconciliation/StatementDetail';
new:
import { getMeAction } from '@/app/actions/auth';
import { PageHeader } from '@/components/console';
import { StatementDetail } from '@/components/admin/reconciliation/StatementDetail';
import { garderPageAdmin } from '@/lib/access/pages-admin-server';
```

```
old:
export default async function Page({ params }: { params: Promise<{ statementId: string }> }) {
  const { statementId } = await params;
new:
export default async function Page({ params }: { params: Promise<{ statementId: string }> }) {
  // TCK-633 — un segment dynamique est gardé par son plus proche ancêtre statique de `PAGES_ADMIN`.
  await garderPageAdmin('/admin/finances/reconciliation');
  const { statementId } = await params;
```

**`moderation/page.tsx`** (`isSuperAdmin` reste : `platform={…}`)

```
old:
import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { isAdmin, isSuperAdmin } from '@/lib/roles';
import { ModerationWorkspace } from '@/components/admin/ModerationWorkspace';
import { PageHeader } from '@/components/console';
import { ensureStandardAgencyOrRedirect } from '@/lib/access/server-guards';
new:
import { getMeAction } from '@/app/actions/auth';
import { isSuperAdmin } from '@/lib/roles';
import { ModerationWorkspace } from '@/components/admin/ModerationWorkspace';
import { PageHeader } from '@/components/console';
import { garderPageAdmin } from '@/lib/access/pages-admin-server';
```

```
old:
export default async function ModerationPage() {
  const t = await getTranslations('admin.pages.moderation');
  const user = await getMeAction();
  if (!isAdmin(user.roles)) redirect('/admin');
  await ensureStandardAgencyOrRedirect(user);
new:
export default async function ModerationPage() {
  await garderPageAdmin('/admin/moderation');
  const t = await getTranslations('admin.pages.moderation');
  const user = await getMeAction();
```

**`moderation/properties/page.tsx`** (n'emploie plus `user`)

```
old:
import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { isAdmin } from '@/lib/roles';
import { PropertyModerationWorkspace } from '@/components/admin/PropertyModerationWorkspace';
import { PageHeader } from '@/components/console';
import { ensureStandardAgencyOrRedirect } from '@/lib/access/server-guards';
new:
import { PropertyModerationWorkspace } from '@/components/admin/PropertyModerationWorkspace';
import { PageHeader } from '@/components/console';
import { garderPageAdmin } from '@/lib/access/pages-admin-server';
```

```
old:
 * Standard-only: agency_admins on `kind=individual` are bounced to /app.
 */
export default async function PropertyModerationPage() {
  const t = await getTranslations('admin.pages.propertyModeration');
  const user = await getMeAction();
  if (!isAdmin(user.roles)) redirect('/admin');
  await ensureStandardAgencyOrRedirect(user);
new:
 * Standard-only (TCK-633 : `PAGES_ADMIN`) — un admin d'agence `individual` est renvoyé vers sa
 * première page accessible.
 */
export default async function PropertyModerationPage() {
  await garderPageAdmin('/admin/moderation/properties');
  const t = await getTranslations('admin.pages.propertyModeration');
```

**`roles/page.tsx`**

```
old:
import { redirect } from 'next/navigation';
import Link from 'next/link';
new:
import Link from 'next/link';
```

```
old:
import { getMeAction } from '@/app/actions/auth';
import { isAdmin } from '@/lib/roles';
new:
import { getMeAction } from '@/app/actions/auth';
import { garderPageAdmin } from '@/lib/access/pages-admin-server';
```

```
old:
import { Separator } from '@/components/ui/separator';
import { ensureStandardAgencyOrRedirect } from '@/lib/access/server-guards';
new:
import { Separator } from '@/components/ui/separator';
```

```
old:
 * Deux gardes, et elles ne disent pas la même chose :
 *
 *  · `isAdmin` est une garde de NAVIGATION — « cet écran est-il pour toi ? ».
 *    Elle porte sur l'appartenance, pas sur un verbe, et reste donc en
 *    `isAdmin` (cf. le docblock de `useCan`). Les gestes de l'écran, eux,
 *    sont gardés par capacité côté client, et par les policies côté serveur.
 *  · `ensureStandardAgencyOrRedirect` applique la typologie `standard` que
 *    la fiche du ticket exige. Cette route est déclarée dans `PRO_ROUTES`,
 *    et `scripts/check-pro-routes.mjs` refuse toute entrée non gardée en
 *    SSR — c'est ce helper qui satisfait la garde.
new:
 * Une garde de NAVIGATION — « cet écran est-il pour toi ? » : `garderPageAdmin('/admin/roles')`
 * (TCK-633) juge le rôle admin ET la typologie `standard` que la fiche du ticket exige, depuis la
 * ligne de `PAGES_ADMIN` ; `scripts/check-pro-routes.mjs` refuse toute page `/admin/*` qui ne
 * l'appelle pas. Les gestes de l'écran, eux, sont gardés par capacité côté client, et par les
 * policies côté serveur.
```

```
old:
export default async function AdminRolesPage() {
  const user = await getMeAction();
  if (!isAdmin(user.roles)) redirect('/admin');
  await ensureStandardAgencyOrRedirect(user);
new:
export default async function AdminRolesPage() {
  await garderPageAdmin('/admin/roles');
  const user = await getMeAction();
```

```
old:
        sur les gardes : `PRO_ROUTES` et `check-pro-routes.mjs` raisonnent par
        `href`, et `/admin/roles` y est déjà déclaré, déjà gardé en SSR par
        `ensureStandardAgencyOrRedirect` ci-dessus. Une section n'a rien à y
new:
        sur les gardes : `PAGES_ADMIN` et `check-pro-routes.mjs` raisonnent par
        `href`, et `/admin/roles` y est déjà déclaré, déjà gardé en SSR par
        `garderPageAdmin` ci-dessus. Une section n'a rien à y
```

**`team/page.tsx`**

```
old:
import { redirect } from 'next/navigation';
import Link from 'next/link';
new:
import Link from 'next/link';
```

```
old:
import { getMeAction } from '@/app/actions/auth';
import { isAdmin } from '@/lib/roles';
new:
import { getMeAction } from '@/app/actions/auth';
import { garderPageAdmin } from '@/lib/access/pages-admin-server';
```

```
old:
import { ensureStandardAgencyOrRedirect, resolveAgencyOrNull } from '@/lib/access/server-guards';
new:
import { resolveAgencyOrNull } from '@/lib/access/server-guards';
```

```
old:
 * an agency from the dedicated section. Hosts on `kind=individual` are
 * bounced to `/app` by `ensureStandardAgencyOrRedirect`.
 */
export default async function TeamPage() {
  const tPage = await getTranslations('admin.pages.team');
  const user = await getMeAction();
  if (!isAdmin(user.roles)) redirect('/admin');
  await ensureStandardAgencyOrRedirect(user);
new:
 * an agency from the dedicated section. Hosts on `kind=individual` are
 * sent to their first reachable page by `garderPageAdmin` (TCK-633).
 */
export default async function TeamPage() {
  await garderPageAdmin('/admin/team');
  const tPage = await getTranslations('admin.pages.team');
  const user = await getMeAction();
```

```
old:
  // existe. `ensureStandardAgencyOrRedirect` vient de lire la même agence, et
new:
  // existe. `garderPageAdmin` vient de lire la même agence, et
```

**`settings/page.tsx`** (`isSuperAdmin` reste : `canManageGlobal`)

```
old:
import { redirect } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';
new:
import { getMeAction } from '@/app/actions/auth';
```

```
old:
import { isSuperAdmin } from '@/lib/roles';
import { SettingsManager } from '@/components/admin-settings/SettingsManager';
new:
import { garderPageAdmin } from '@/lib/access/pages-admin-server';
import { isSuperAdmin } from '@/lib/roles';
import { SettingsManager } from '@/components/admin-settings/SettingsManager';
```

```
old:
export default async function Page() {
  const t = await getTranslations('admin.pages.settings');
  const user = await getMeAction();
  // `/api/admin/settings` is gated by the `super-admin` route middleware
  // (`routes/api/admin.php`), so only super-admins can load the page. Any
  // other admin (agency_admin) is bounced rather than shown a broken card.
  if (!isSuperAdmin(user.roles)) {
    redirect('/admin');
  }
new:
export default async function Page() {
  // `/api/admin/settings` is gated by the `super-admin` route middleware (`routes/api/admin.php`) :
  // la ligne de `PAGES_ADMIN` exige `super_admin`, et tout autre admin est renvoyé vers sa première
  // page accessible plutôt que devant une carte cassée (TCK-633).
  await garderPageAdmin('/admin/settings');
  const t = await getTranslations('admin.pages.settings');
  const user = await getMeAction();
```

**`settings/integrations/page.tsx`** (`isSuperAdmin` reste : `canSeeGeneral`)

```
old:
import { redirect } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';
new:
import { getMeAction } from '@/app/actions/auth';
import { garderPageAdmin } from '@/lib/access/pages-admin-server';
```

```
old:
import { isAdmin, isSuperAdmin } from '@/lib/roles';
new:
import { isSuperAdmin } from '@/lib/roles';
```

```
old:
export default async function Page() {
  const t = await getTranslations('admin.pages.integrations');
  const user = await getMeAction();
  if (!isAdmin(user.roles)) {
    redirect('/admin');
  }
new:
export default async function Page() {
  await garderPageAdmin('/admin/settings/integrations');
  const t = await getTranslations('admin.pages.integrations');
  const user = await getMeAction();
```

**`properties/page.tsx`** — fichier de 8 lignes, réécrit en entier (outil Write, territoire) :

```tsx
import { garderPageAdmin } from '@/lib/access/pages-admin-server';
// `generateMetadata` et non `metadata` depuis TCK-292 : le titre passe par le dictionnaire, et
// une constante statique ne peut pas appeler `getTranslations`.
import ListeDesBiens, { generateMetadata } from '../../app/properties/(liste)/page';

export { generateMetadata };

// Next.js 16 Turbopack refuses re-exports for route-segment config values;
// `dynamic` must be declared statically here. Keep in sync with the source
// route `(dashboard)/app/properties/(liste)/page.tsx`.
export const dynamic = 'force-dynamic';

/**
 * TCK-633 (lot B) — la liste transverse des biens, super-admin seul (`PAGES_ADMIN`).
 *
 * Ce n'est plus un réexport nu : la page source est gardée par le `layout.tsx` de SON arborescence
 * (`app/properties`, `assertCanReachAgentArea`, TCK-426), que ce réexport ne traverse pas. Sans cet
 * enveloppement, la seule garde de `/admin/properties` était l'`isAdmin` d'`admin/layout.tsx` — un
 * admin d'agence l'ouvrait en tapant l'URL alors que le menu ne la lui montre pas.
 */
export default async function Page(props: Parameters<typeof ListeDesBiens>[0]) {
  await garderPageAdmin('/admin/properties');
  return ListeDesBiens(props);
}
```

(`properties/__tests__/page.test.ts` cherche `from '../../app/properties/(liste)/page'` : la chaîne
est conservée.)

**Les cinq tests existants qui exécutent une page** : sans souche, ils appelleraient la vraie garde.

`__tests__/page.files-attente.test.tsx` :

```
old:
const mockEnsureStandard = vi.fn();
const mockRedirect = vi.fn();
new:
const mockGarde = vi.fn();
const mockRedirect = vi.fn();
```

```
old:
vi.mock('@/lib/access/server-guards', () => ({
  ensureStandardAgencyOrRedirect: (...a: unknown[]) => mockEnsureStandard(...a),
  resolveAgencyOrNull: (...a: unknown[]) => mockResolveAgency(...a),
}));
new:
vi.mock('@/lib/access/server-guards', () => ({
  resolveAgencyOrNull: (...a: unknown[]) => mockResolveAgency(...a),
}));
// TCK-633 — la garde de la page vient de `PAGES_ADMIN` ; elle est éprouvée dans
// `lib/access/__tests__/pages-admin-server.test.ts`.
vi.mock('@/lib/access/pages-admin-server', () => ({
  garderPageAdmin: (...a: unknown[]) => mockGarde(...a),
}));
```

```
old:
    mockEnsureStandard.mockResolvedValue(undefined);
new:
    mockGarde.mockResolvedValue(undefined);
```

```
old:
    // `ensureStandardAgencyOrRedirect` est la garde réelle : elle `redirect('/app')`. On la
    // simule en levant, comme le fait `redirect()` de Next.
    mockEnsureStandard.mockRejectedValue(new Error('NEXT_REDIRECT'));

    await expect(Page({})).rejects.toThrow('NEXT_REDIRECT');
new:
    // `garderPageAdmin('/admin')` est la garde réelle (TCK-633) : elle renvoie un solo vers sa
    // première page accessible. On la simule en levant, comme le fait `redirect()` de Next.
    mockGarde.mockRejectedValue(new Error('NEXT_REDIRECT'));

    await expect(Page({})).rejects.toThrow('NEXT_REDIRECT');
    expect(mockGarde).toHaveBeenCalledWith('/admin');
```

```
old:
 * `/admin` figure dans `PRO_ROUTES` et appelle `ensureStandardAgencyOrRedirect` : une agence
 * `kind=individual` est renvoyée sur `/app` AVANT que quoi que ce soit ne soit rendu. La branche
new:
 * `/admin` exige une agence `standard` dans `PAGES_ADMIN` (TCK-633) : `garderPageAdmin` renvoie une
 * agence `kind=individual` vers sa première page AVANT que quoi que ce soit ne soit rendu. La branche
```

`__tests__/redirection-tags.test.tsx` :

```
old:
vi.mock('@/lib/access/server-guards', () => ({
  ensureStandardAgencyOrRedirect: async () => undefined,
  resolveAgencyOrNull: async () => null,
}));
new:
vi.mock('@/lib/access/server-guards', () => ({
  ensureStandardAgencyOrRedirect: async () => undefined,
  resolveAgencyOrNull: async () => null,
}));
vi.mock('@/lib/access/pages-admin-server', () => ({ garderPageAdmin: async () => undefined }));
```

`agency/billing/__tests__/page.hote-individuel.test.tsx` :

```
old:
vi.mock('next/navigation', () => ({ redirect: (...a: unknown[]) => mockRedirect(...a) }));
vi.mock('@/components/billing/AgencyBillingClient', () => ({
new:
vi.mock('next/navigation', () => ({ redirect: (...a: unknown[]) => mockRedirect(...a) }));
vi.mock('@/lib/access/pages-admin-server', () => ({ garderPageAdmin: async () => undefined }));
vi.mock('@/components/billing/AgencyBillingClient', () => ({
```

`settings/integrations/__tests__/page.test.tsx` :

```
old:
vi.mock('@/app/actions/admin-settings', () => ({
new:
vi.mock('@/lib/access/pages-admin-server', () => ({ garderPageAdmin: async () => undefined }));
vi.mock('@/app/actions/admin-settings', () => ({
```

`agency/__tests__/page.watermarks.test.tsx` :

```
old:
vi.mock('@/app/actions/admin-agency', () => ({
new:
vi.mock('@/lib/access/pages-admin-server', () => ({ garderPageAdmin: async () => undefined }));
vi.mock('@/app/actions/admin-agency', () => ({
```

- [ ] **Step 4 : le voir passer**

```bash
npx vitest run "src/app/(dashboard)/admin"
```

Expected : PASS — `gardes.test.tsx` (16), `layout.acces.test.tsx`, et les sept fichiers existants
(dont `properties/__tests__/page.test.ts` et `finances/__tests__/AdminFinancesClient.test.tsx`).
⚠ `node scripts/check-pro-routes.mjs` est **rouge** à partir d'ici et jusqu'à la Task 10 : `PRO_ROUTES`
cite encore des pages qui n'appellent plus `ensureStandardAgencyOrRedirect`. C'est attendu.

- [ ] **Step 5 : ablation**

```bash
S="<scratchpad de l'agent>/tck-633-lot-b"; F="src/app/(dashboard)/admin/team/page.tsx"
cp "$F" "$S/team-page.tsx.ok"; md5 -q "$F" > "$S/team-page.tsx.md5"
```

1. Edit : retirer la ligne `  await garderPageAdmin('/admin/team');`. Relancer `gardes.test.tsx` →
   **FAIL** sur `/admin/team (team/page.tsx)` (`getMeAction appelé AVANT la garde`).
2. Restaurer, puis Edit : déplacer la ligne de garde **sous** `  const user = await getMeAction();`.
   Relancer → **FAIL** sur le même cas (garde trop tard). Restaurer :

```bash
S="<scratchpad de l'agent>/tck-633-lot-b"; F="src/app/(dashboard)/admin/team/page.tsx"
cp "$S/team-page.tsx.ok" "$F"; md5 -q "$F" | diff - "$S/team-page.tsx.md5" && echo "restauré"
```

- [ ] **Step 6 : signaler à la session** les 15 pages, `gardes.test.tsx` et les cinq tests modifiés.

---

## Task 9 : `PRO_ROUTES` sans aucune route `/admin`

**Files :**
- Modify : `takussan-web/src/lib/access/pro-features.ts:13-20,54-67,83-85`
- Test : `takussan-web/src/lib/access/__tests__/pro-features.test.ts:46`

- [ ] **Step 1 : écrire le test qui échoue** — Edit dans `pro-features.test.ts` :

```
old:
  it("ne cadenasse ni les KPI ni les alertes de seuil — aucune spec ne les restreint", () => {
new:
  it('TCK-633 — ne contient plus aucune route /admin : `PAGES_ADMIN` les décrit et les garde', () => {
    expect([...PRO_ROUTES]).toEqual(['/app/overview/agency', '/app/owners']);
  });

  it("ne cadenasse ni les KPI ni les alertes de seuil — aucune spec ne les restreint", () => {
```

- [ ] **Step 2 : le voir échouer**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-web
npx vitest run src/lib/access/__tests__/pro-features.test.ts
```

Expected : FAIL — le tableau reçu porte en plus `/admin`, `/admin/team`,
`/admin/moderation/properties`, `/admin/moderation`, `/admin/audit`, `/admin/roles`.

- [ ] **Step 3 : l'implémentation minimale** — `pro-features.ts`, trois Edit.

```
old:
  '/app/owners',
  // /admin/... — console admin agence. Gardées par `ensureStandardAgencyOrRedirect` en SSR,
  // et leur API par `AgencyKindGuard` côté Laravel.
  '/admin',
  '/admin/team',
  // TCK-594 (AC18) — `/admin/agency/billing` N'EST PLUS ICI : l'hôte individuel y lit ses
  // reversements plateforme ; seul le bloc d'abonnement y reste réservé aux agences `standard`.
  '/admin/moderation/properties',
  // TCK-597 — la modération des avis s'ouvre à l'admin d'agence `standard` (ADR-0043 §1).
  '/admin/moderation',
  '/admin/audit',
  // TCK-279 — la console des rôles. Gardée en SSR par
  // `ensureStandardAgencyOrRedirect` dans `admin/roles/page.tsx`.
  '/admin/roles',
]);
new:
  '/app/owners',
  // TCK-633 (lot B) — les routes `/admin/*` NE SONT PLUS ICI. Elles vivent dans `PAGES_ADMIN`
  // (`@/lib/access/pages-admin`), qui porte pour chacune son exigence (rôle, agence `standard`,
  // capacité) ; chaque page l'applique par `garderPageAdmin`, et le menu ne montre que ce qui passe.
  // Un cadenas n'y a plus de sens : une porte fermée ne se montre pas. `scripts/check-pro-routes.mjs`
  // refuse désormais toute route `/admin` dans cette liste.
]);
```

```
old:
 *  1. l'appel au helper `ensureStandardAgencyOrRedirect(user)` — les cinq
 *     routes `/admin/*` ;
new:
 *  1. l'appel au helper `ensureStandardAgencyOrRedirect(user)` — il gardait les
 *     routes `/admin/*` jusqu'à TCK-633, qui les a sorties de cette liste ;
```

```
old:
 * poussé aux agents, et les cinq routes `/admin/*` sont hors d'atteinte pour
 * eux (`(dashboard)/admin/layout.tsx` redirige tout non-`isAdmin`).
new:
 * poussé aux agents, et les routes `/admin/*` ne passent plus par ce prédicat
 * (TCK-633 : `PAGES_ADMIN`, `garderPageAdmin`).
```

- [ ] **Step 4 : le voir passer**

```bash
npx vitest run src/lib/access/__tests__/pro-features.test.ts \
  "src/app/(dashboard)/admin/agency/billing/__tests__/page.hote-individuel.test.tsx" \
  src/components/layout/__tests__/AppSidebar.test.tsx
```

Expected : PASS (`AppSidebar.test.tsx` : toujours 2 cadenas — l'entrée d'admin d'un solo mène déjà à
`/admin/agency` depuis la Task 7).

- [ ] **Step 5 : ablation**

```bash
S="<scratchpad de l'agent>/tck-633-lot-b"; F=src/lib/access/pro-features.ts
cp "$F" "$S/pro-features.ts.ok"; md5 -q "$F" > "$S/pro-features.ts.md5"
```

Edit : ajouter `  '/admin/audit',` sous `  '/app/owners',`. Relancer `pro-features.test.ts` → **FAIL**
sur « TCK-633 — ne contient plus aucune route /admin ». Restaurer :

```bash
S="<scratchpad de l'agent>/tck-633-lot-b"; F=src/lib/access/pro-features.ts
cp "$S/pro-features.ts.ok" "$F"; md5 -q "$F" | diff - "$S/pro-features.ts.md5" && echo "restauré"
```

- [ ] **Step 6 : signaler à la session** `pro-features.ts` et `pro-features.test.ts`.

---

## Task 10 : `scripts/check-pro-routes.mjs` lit la table

**Files :**
- Modify : `scripts/check-pro-routes.mjs:18-23,23,401-407,427`

Ce script n'a pas de suite de tests : sa preuve est son **exécution**, verte puis rouge par ablation.

- [ ] **Step 1 : constater le rouge de départ (le « test qui échoue »)**

```bash
cd /Users/aminethiam/Documents/perso/takussan
node scripts/check-pro-routes.mjs --report; echo "sortie=$?"
```

Expected : `sortie=0`. `PRO_ROUTES` ne cite plus que les deux routes `/app` (Task 9) : la garde
affiche `✓ surfaces pro : 2/2` **sans rien vérifier des pages admin**. C'est le défaut à fermer : noter cette sortie au rapport, c'est la
« mesure avant ».

- [ ] **Step 2 : écrire l'ablation qui DOIT rougir une fois la garde écrite** — préparer l'ablation
  sans encore l'appliquer :

```bash
S="<scratchpad de l'agent>/tck-633-lot-b"; F="takussan-web/src/app/(dashboard)/admin/audit/page.tsx"
cp "$F" "$S/audit-page.tsx.ok"; md5 -q "$F" > "$S/audit-page.tsx.md5"
```

Edit : retirer la ligne `  await garderPageAdmin('/admin/audit');` de `audit/page.tsx`, puis
`node scripts/check-pro-routes.mjs; echo "sortie=$?"` → **`sortie=0`** aujourd'hui (le script ne
voit pas la page). Restaurer :

```bash
S="<scratchpad de l'agent>/tck-633-lot-b"; F="takussan-web/src/app/(dashboard)/admin/audit/page.tsx"
cp "$S/audit-page.tsx.ok" "$F"; md5 -q "$F" | diff - "$S/audit-page.tsx.md5" && echo "restauré"
```

- [ ] **Step 3 : l'implémentation minimale** — quatre Edit dans `scripts/check-pro-routes.mjs`.

Edit 1 :

```
old:
import { readFileSync, existsSync } from 'node:fs';
new:
import { readFileSync, existsSync, readdirSync } from 'node:fs';
```

Edit 2 :

```
old:
 * Usage :
 *   node scripts/check-pro-routes.mjs            # garde, sort en 1 au moindre écart
new:
 * TCK-633 (lot B) — **les pages `/admin/*` ont quitté `PRO_ROUTES`.** Elles sont décrites par
 * `PAGES_ADMIN` (`takussan-web/src/lib/access/pages-admin.ts`), et chacune appelle
 * `garderPageAdmin('<son chemin>')` en première instruction. Cette garde le vérifie aussi : toute
 * route `/admin` remise dans `PRO_ROUTES` est refusée ; chaque `page.tsx` sous
 * `app/(dashboard)/admin` est soit une souche de redirection, soit gardée par SON chemin (un
 * segment dynamique, par son plus proche ancêtre statique), avant toute lecture de l'utilisateur ;
 * chaque chemin de la table a sa page.
 *
 * ⚠ Elle ne lit pas `docs/features.md` : l'accord entre la liste et la spec §1.12 est tenu par
 * `takussan-web/src/lib/access/__tests__/pro-features.test.ts`.
 *
 * Usage :
 *   node scripts/check-pro-routes.mjs            # garde, sort en 1 au moindre écart
```

Edit 3 — ajouter, **après** le bloc :

```
for (const [r] of nues) {
  if (ECARTS_ASSUMES.has(r)) {
    console.warn(`⚠ \`${r}\` : cadenas sans garde serveur — écart assumé, suivi par ${ECARTS_ASSUMES.get(r)}.`);
  }
}
```

le bloc suivant (Edit : `old` = ces cinq lignes, `new` = ces cinq lignes suivies de) :

```js

// ─────────────────────────────────────────────────────────────────────────────────────────────
// TCK-633 (lot B) — les pages `/admin/*` : la table `PAGES_ADMIN` et `garderPageAdmin`.
// ─────────────────────────────────────────────────────────────────────────────────────────────
const TABLE_ADMIN = join(WEB, 'lib', 'access', 'pages-admin.ts');
const DOSSIER_ADMIN = join(WEB, 'app', '(dashboard)', 'admin');

for (const r of routes) {
  if (r === '/admin' || r.startsWith('/admin/')) {
    erreurs.push(`\`${r}\` est dans PRO_ROUTES : les pages /admin/* se décrivent dans PAGES_ADMIN et se gardent par \`garderPageAdmin\` (TCK-633), pas par un cadenas.`);
  }
}

// Comme pour `PRO_ROUTES` : commentaires retirés AVANT de lire — un `chemin:` mis en commentaire
// n'est pas une page.
const cheminsAdmin = existsSync(TABLE_ADMIN)
  ? [...sansCommentaires(readFileSync(TABLE_ADMIN, 'utf8')).matchAll(/\bchemin:\s*'(\/admin[\w/-]*)'/g)].map((m) => m[1])
  : [];
if (cheminsAdmin.length === 0) {
  erreurs.push(`aucun \`chemin:\` lu dans ${TABLE_ADMIN.slice(ROOT.length + 1)} — table introuvable ou de forme inconnue : la garde n'aurait rien vérifié.`);
}
for (const c of cheminsAdmin) {
  if (!page(c)) erreurs.push(`\`${c}\` est dans PAGES_ADMIN mais aucune page ne la sert.`);
}

function pagesSous(dossier) {
  const sortie = [];
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) {
      if (entree.name !== '__tests__') sortie.push(...pagesSous(chemin));
    } else if (entree.name === 'page.tsx') {
      sortie.push(chemin);
    }
  }
  return sortie;
}

/** Le chemin d'URL d'une page : groupes `(x)` retirés. */
function routeDe(fichier) {
  const segments = dirname(fichier)
    .slice(join(WEB, 'app').length)
    .split(/[\\/]/)
    .filter((s) => s && !/^\(.*\)$/.test(s));
  return `/${segments.join('/')}`;
}

/** Le chemin que la page doit garder : le sien, ou celui de son plus proche ancêtre statique. */
function cheminAttendu(route) {
  const segments = route.split('/');
  const i = segments.findIndex((s) => s.startsWith('['));
  return i === -1 ? route : segments.slice(0, i).join('/');
}

// Une souche : l'export par défaut ne fait QUE rediriger (`users`, `settings/tags`).
const SOUCHE = /export\s+default\s+(?:async\s+)?function\s*\w*\s*\([^)]*\)[^{]*\{\s*(?:permanentRedirect|redirect)\s*\([^;]*\)\s*;?\s*\}\s*$/;

const pagesAdminGardees = [];
for (const fichier of existsSync(DOSSIER_ADMIN) ? pagesSous(DOSSIER_ADMIN) : []) {
  const rel = fichier.slice(ROOT.length + 1);
  const code = sansCommentaires(readFileSync(fichier, 'utf8'));
  const attendu = cheminAttendu(routeDe(fichier));
  if (!cheminsAdmin.includes(attendu)) {
    if (SOUCHE.test(code.trim())) continue;
    erreurs.push(`${rel} sert \`${attendu}\`, absent de PAGES_ADMIN, et n'est pas une souche de redirection : ajoute la page à la table, ou fais-en une souche.`);
    continue;
  }
  const appel = code.search(new RegExp(`\\bgarderPageAdmin\\(\\s*'${attendu}'\\s*\\)`));
  if (appel === -1) {
    erreurs.push(`${rel} n'appelle pas \`garderPageAdmin('${attendu}')\` : une URL tapée à la main ouvre la page à qui le menu la cache.`);
    continue;
  }
  const lecture = code.search(/\bgetMeAction\s*\(/);
  if (lecture !== -1 && lecture < appel) {
    erreurs.push(`${rel} lit l'utilisateur AVANT \`garderPageAdmin\` : la garde doit être la première instruction.`);
    continue;
  }
  pagesAdminGardees.push(rel);
}
if (REPORT) {
  console.log(`PAGES_ADMIN : ${cheminsAdmin.length} chemins, ${pagesAdminGardees.length} pages gardées par garderPageAdmin\n`);
  for (const p of pagesAdminGardees) console.log(`  ✓ gardée      ${p}`);
  console.log();
}
```

Edit 4 :

```
old:
  console.log(`✓ surfaces pro : ${gardees.length}/${routes.length} routes redirigées côté SSR ET fail-closed, ${ECARTS_ASSUMES.size} écart(s) assumé(s).`);
new:
  console.log(`✓ surfaces pro : ${gardees.length}/${routes.length} routes redirigées côté SSR ET fail-closed, ${ECARTS_ASSUMES.size} écart(s) assumé(s).`);
  console.log(`✓ pages admin : ${pagesAdminGardees.length} pages gardées par garderPageAdmin, ${cheminsAdmin.length} chemins dans PAGES_ADMIN.`);
```

- [ ] **Step 4 : le voir passer**

```bash
cd /Users/aminethiam/Documents/perso/takussan
node scripts/check-pro-routes.mjs --report; echo "sortie=$?"
```

Expected : `sortie=0`, `✓ surfaces pro : 2/2 routes …` et
`✓ pages admin : 15 pages gardées par garderPageAdmin, 14 chemins dans PAGES_ADMIN.` (17 `page.tsx`
sous `admin/`, dont les deux souches `users` et `settings/tags`).

- [ ] **Step 5 : ablation** — trois formes, chacune restaurée par `cp` + `md5`.

1. `audit/page.tsx` (sauvegarde du Step 2) : Edit, retirer `  await garderPageAdmin('/admin/audit');`
   → `node scripts/check-pro-routes.mjs; echo "sortie=$?"` → **`sortie=1`**,
   `…/audit/page.tsx n'appelle pas \`garderPageAdmin('/admin/audit')\``. Restaurer.
2. `team/page.tsx` : Edit, déplacer `  await garderPageAdmin('/admin/team');` sous
   `  const user = await getMeAction();` → **`sortie=1`**, `lit l'utilisateur AVANT`. Restaurer
   (`$S/team-page.tsx.ok` de la Task 8 si son `md5` est inchangé, sinon nouvelle copie).
3. `takussan-web/src/lib/access/pro-features.ts` : Edit, ajouter `  '/admin',` sous
   `  '/app/owners',` → **`sortie=1`**, `` `/admin` est dans PRO_ROUTES``. Restaurer
   (`$S/pro-features.ts.ok`).

Après chaque restauration : `node scripts/check-pro-routes.mjs; echo "sortie=$?"` → `sortie=0`.

- [ ] **Step 6 : signaler à la session** `scripts/check-pro-routes.mjs`.

---

## Task 11 : `UserMenu` — « Mon espace » et déconnexion vers l'accueil

**Files :**
- Modify : `takussan-web/src/components/layout/UserMenu.tsx:1-19,37-45,78-92`
- Modify : `takussan-web/src/context/__tests__/AuthContext.session.test.tsx:191` *(E5)*
- Test : `takussan-web/src/components/layout/__tests__/UserMenu.test.tsx`

- [ ] **Step 1 : écrire le test qui échoue**

`takussan-web/src/components/layout/__tests__/UserMenu.test.tsx` :

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl, type LocaleDeTest } from '@/test/intl';
import { AccesAdminProvider } from '@/lib/access/acces-admin-contexte';
import type { AccesAdmin } from '@/lib/access/pages-admin';
import type { User } from '@/types/user';
import { UserMenu } from '../UserMenu';

/**
 * TCK-633 (lot B) — AC1 : l'entrée d'administration du menu utilisateur mène à une page qui
 * s'affiche (« Mon espace » chez un solo, rien s'il n'y en a aucune). AC3 : la déconnexion
 * VOLONTAIRE ramène à l'accueil, dans la langue de l'utilisateur.
 */
const { push, replace, logout } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  logout: vi.fn(async () => {}),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ logout }) }));

const ADMIN = {
  id: 1,
  first_name: 'Awa',
  last_name: 'Diop',
  full_name: 'Awa Diop',
  email: 'awa@example.test',
  avatar_url: null,
  roles: ['agency_admin'],
  agency_id: 7,
} as unknown as User;

const SOLO: AccesAdmin = { chemins: ['/admin/agency', '/admin/finances'], espaceIndividuel: true };
const STANDARD: AccesAdmin = { chemins: ['/admin', '/admin/agency'], espaceIndividuel: false };

async function ouvrir(acces: AccesAdmin, locale: LocaleDeTest = 'fr') {
  render(
    withIntl(
      <AccesAdminProvider acces={acces}>
        <UserMenu user={ADMIN} />
      </AccesAdminProvider>,
      locale,
    ),
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button'));
  return user;
}

describe('<UserMenu> (TCK-633)', () => {
  beforeEach(() => {
    push.mockClear();
    replace.mockClear();
    logout.mockClear();
  });

  it('solo : « Mon espace » ouvre sa première page, jamais /admin', async () => {
    const user = await ouvrir(SOLO);
    expect(screen.queryByRole('menuitem', { name: 'Administration' })).toBeNull();
    await user.click(await screen.findByRole('menuitem', { name: 'Mon espace' }));
    expect(push).toHaveBeenCalledWith('/admin/agency');
  });

  it('admin standard : « Administration » ouvre /admin', async () => {
    const user = await ouvrir(STANDARD);
    await user.click(await screen.findByRole('menuitem', { name: 'Administration' }));
    expect(push).toHaveBeenCalledWith('/admin');
  });

  it("aucune page accessible : pas d'entrée d'administration", async () => {
    await ouvrir({ chemins: [], espaceIndividuel: false });
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Mon profil', 'Déconnexion']);
  });

  it("la déconnexion ramène à l'accueil localisé, après avoir révoqué la session", async () => {
    const user = await ouvrir(STANDARD);
    await user.click(await screen.findByRole('menuitem', { name: 'Déconnexion' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/fr'));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalledWith('/auth/login');
  });

  it("en wolof, l'accueil wolof", async () => {
    const user = await ouvrir(STANDARD, 'wo');
    const items = await screen.findAllByRole('menuitem');
    await user.click(items[items.length - 1]);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/wo'));
  });
});
```

Et dans `AuthContext.session.test.tsx` *(E5 — accord requis, sinon `collisions`)*, l. 191 :

```
old:
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/auth/login'));
new:
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/fr'));
```

- [ ] **Step 2 : le voir échouer**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-web
npx vitest run src/components/layout/__tests__/UserMenu.test.tsx
```

Expected : FAIL — `Unable to find role="menuitem" and name "Mon espace"` ; `replace` appelé avec
`'/auth/login'` ; l'item d'admin présent quand aucune page n'est accessible.

- [ ] **Step 3 : l'implémentation minimale** — `UserMenu.tsx`, quatre Edit.

```
old:
import { isAdmin } from '@/lib/roles';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
new:
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
```

```
old:
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { initialesDe, libelleDe, prenomDe } from '@/lib/identite';
new:
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { initialesDe, libelleDe, prenomDe } from '@/lib/identite';
import { hrefLocalise } from '@/i18n/navigation';
import type { Locale } from '@/i18n/config';
import { entreeAdmin } from '@/lib/access/pages-admin';
import { useAccesAdminOuRepli } from '@/lib/access/acces-admin-contexte';
```

```
old:
  const t = useTranslations('nav');
  // TCK-623 — `initialesDe` garde le `Array.from` (un emoji en tête reste entier) et rend `null`
new:
  const t = useTranslations('nav');
  const tAdmin = useTranslations('nav.admin');
  const locale = useLocale() as Locale;
  // TCK-633 (lot B) — l'entrée mène à la première page `/admin/*` que le profil peut ouvrir.
  const entree = entreeAdmin(useAccesAdminOuRepli({ roles: user.roles, agencyId: user.agency_id }));
  // TCK-623 — `initialesDe` garde le `Array.from` (un emoji en tête reste entier) et rend `null`
```

```
old:
        {isAdmin(user.roles) && (
          <DropdownMenuItem onClick={() => router.push('/admin')}>
            <ShieldCheck className="size-4" aria-hidden="true" />
            <span>{t('administration')}</span>
          </DropdownMenuItem>
        )}
new:
        {entree && (
          <DropdownMenuItem onClick={() => router.push(entree.href)}>
            <ShieldCheck className="size-4" aria-hidden="true" />
            <span>{tAdmin(entree.cle)}</span>
          </DropdownMenuItem>
        )}
```

```
old:
            await logout();
            router.replace('/auth/login');
new:
            await logout();
            // TCK-633 (AC3) — une déconnexion VOLONTAIRE ramène à l'accueil, comme depuis la barre
            // publique (`Navbar`). La session EXPIRÉE, elle, continue d'aller vers la connexion :
            // ce n'est pas ce chemin-ci.
            router.replace(hrefLocalise('/', locale));
```

- [ ] **Step 4 : le voir passer**

```bash
npx vitest run src/components/layout/__tests__/UserMenu.test.tsx \
  src/context/__tests__/AuthContext.session.test.tsx \
  src/components/layout/__tests__/NotificationBell.test.tsx \
  src/test/__tests__/portees-sombres.test.tsx \
  src/components/layout/__tests__/AppTopbar.a11y.test.tsx \
  src/components/layout/__tests__/AppTopbar.responsive.test.tsx
```

Expected : PASS (`AuthContext.session.test.tsx` seulement si l'E5 est accordée ; sinon il rougit sur
`'/auth/login'` et le bloc va en `collisions`).

- [ ] **Step 5 : ablation**

```bash
S="<scratchpad de l'agent>/tck-633-lot-b"; F=src/components/layout/UserMenu.tsx
cp "$F" "$S/UserMenu.tsx.ok"; md5 -q "$F" > "$S/UserMenu.tsx.md5"
```

1. Edit : `router.replace(hrefLocalise('/', locale));` → `router.replace('/auth/login');`. Relancer
   → **FAIL** sur « la déconnexion ramène à l'accueil localisé » et « en wolof ».
2. Restaurer, puis Edit : `router.push(entree.href)` → `router.push('/admin')`. Relancer → **FAIL**
   sur « solo : « Mon espace » ouvre sa première page ».

```bash
S="<scratchpad de l'agent>/tck-633-lot-b"; F=src/components/layout/UserMenu.tsx
cp "$S/UserMenu.tsx.ok" "$F"; md5 -q "$F" | diff - "$S/UserMenu.tsx.md5" && echo "restauré"
```

- [ ] **Step 6 : signaler à la session** `UserMenu.tsx`, `UserMenu.test.tsx` et, si accordé,
  `AuthContext.session.test.tsx`.

---

## Task 12 : raccourcis et états vides de l'accueil

**Files :**
- Modify : `takussan-web/src/components/dashboard/DashboardShortcuts.tsx:1-29,45-52,88-90`
- Modify : `takussan-web/src/components/dashboard/DashboardEmpty.tsx:1-39`
- Modify : `takussan-web/src/components/shared/NoAgencyState.tsx:1-47`
- Modify : `takussan-web/src/components/dashboard/__tests__/DashboardShortcuts.test.tsx:1-6,48-54`
- Test : `takussan-web/src/components/dashboard/__tests__/DashboardEmpty.test.tsx`,
  `takussan-web/src/components/shared/__tests__/NoAgencyState.test.tsx`

Les trois composants n'ont aujourd'hui **aucune directive** : ce sont des composants serveur rendus
par des pages serveur. Ils deviennent `'use client'` pour lire le contexte ; leurs props restent
sérialisables (`roles`, `agencyId`, `title`) et leurs appelants ne changent pas.

- [ ] **Step 1 : écrire les tests qui échouent**

`DashboardShortcuts.test.tsx`, Edit 1 :

```
old:
import { withIntl } from '@/test/intl';

import { DashboardShortcuts } from '../DashboardShortcuts';
new:
import { withIntl } from '@/test/intl';
import { AccesAdminProvider } from '@/lib/access/acces-admin-contexte';
import type { AccesAdmin } from '@/lib/access/pages-admin';

import { DashboardShortcuts } from '../DashboardShortcuts';

const STANDARD: AccesAdmin = { chemins: ['/admin', '/admin/agency'], espaceIndividuel: false };
const SOLO: AccesAdmin = { chemins: ['/admin/agency', '/admin/finances'], espaceIndividuel: true };
```

Edit 2 (l. 48-54) :

```
old:
  it('renders the admin shortcuts only when an agency is attached', () => {
    const { container: withAgency } = render(withIntl(<DashboardShortcuts roles={['agency_admin']} agencyId={1} />));
    expect(hrefs(withAgency)).toContain('/admin');

    const { container: withoutAgency } = render(withIntl(<DashboardShortcuts roles={['agency_admin']} />));
    expect(hrefs(withoutAgency)).not.toContain('/admin');
  });
new:
  it('renders the admin shortcuts only when an agency is attached', () => {
    const { container: withAgency } = render(
      withIntl(
        <AccesAdminProvider acces={STANDARD}>
          <DashboardShortcuts roles={['agency_admin']} agencyId={1} />
        </AccesAdminProvider>,
      ),
    );
    expect(hrefs(withAgency)).toContain('/admin');

    const { container: withoutAgency } = render(
      withIntl(
        <AccesAdminProvider acces={STANDARD}>
          <DashboardShortcuts roles={['agency_admin']} />
        </AccesAdminProvider>,
      ),
    );
    expect(hrefs(withoutAgency)).not.toContain('/admin');
  });

  it('TCK-633 — un solo : « Mon espace » vers sa première page, jamais /admin', () => {
    const { container } = render(
      withIntl(
        <AccesAdminProvider acces={SOLO}>
          <DashboardShortcuts roles={['agency_admin']} agencyId={1} />
        </AccesAdminProvider>,
      ),
    );
    expect(hrefs(container)).not.toContain('/admin');
    expect(screen.getByRole('link', { name: 'Mon espace' })).toHaveAttribute('href', '/admin/agency');
  });

  it("TCK-633 — aucune page d'admin accessible : aucun raccourci d'admin", () => {
    const { container } = render(
      withIntl(
        <AccesAdminProvider acces={{ chemins: [], espaceIndividuel: false }}>
          <DashboardShortcuts roles={['agency_admin']} agencyId={1} />
        </AccesAdminProvider>,
      ),
    );
    expect(hrefs(container).filter((h) => h.startsWith('/admin'))).toEqual([]);
  });
```

`takussan-web/src/components/dashboard/__tests__/DashboardEmpty.test.tsx` :

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { AccesAdminProvider } from '@/lib/access/acces-admin-contexte';
import type { AccesAdmin } from '@/lib/access/pages-admin';
import { DashboardEmpty } from '../DashboardEmpty';

/** TCK-633 (lot B, AC1) — l'état vide de l'accueil ne pointe que vers une page qui s'ouvre. */
function rendre(acces: AccesAdmin | null, roles: Parameters<typeof DashboardEmpty>[0]['roles']) {
  const ui = <DashboardEmpty roles={roles} />;
  return render(withIntl(acces ? <AccesAdminProvider acces={acces}>{ui}</AccesAdminProvider> : ui));
}

describe('<DashboardEmpty> (TCK-633)', () => {
  it('solo : « Ouvrir mon espace » vers sa première page', () => {
    rendre({ chemins: ['/admin/agency'], espaceIndividuel: true }, ['agency_admin']);
    expect(screen.getByRole('link', { name: 'Ouvrir mon espace' })).toHaveAttribute('href', '/admin/agency');
  });

  it("admin standard : le lien d'avant, vers /admin", () => {
    rendre({ chemins: ['/admin', '/admin/agency'], espaceIndividuel: false }, ['agency_admin']);
    expect(screen.getByRole('link', { name: "Aller à l'administration" })).toHaveAttribute('href', '/admin');
  });

  it("aucune page d'admin accessible : la variante utilisateur", () => {
    rendre({ chemins: [], espaceIndividuel: false }, ['agency_admin']);
    expect(screen.getByRole('link', { name: 'Explorer les biens' })).toHaveAttribute('href', '/properties');
  });

  it('un client, sans fournisseur : la variante utilisateur', () => {
    rendre(null, ['customer']);
    expect(screen.getByRole('link', { name: 'Explorer les biens' })).toHaveAttribute('href', '/properties');
  });
});
```

`takussan-web/src/components/shared/__tests__/NoAgencyState.test.tsx` :

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { AccesAdminProvider } from '@/lib/access/acces-admin-contexte';
import type { AccesAdmin } from '@/lib/access/pages-admin';
import { NoAgencyState } from '../NoAgencyState';

/** TCK-633 (lot B, AC1) — le CTA de l'état « sans agence » mène à une page qui s'ouvre. */
function rendre(acces: AccesAdmin | null) {
  const ui = <NoAgencyState title="Titre" />;
  return render(withIntl(acces ? <AccesAdminProvider acces={acces}>{ui}</AccesAdminProvider> : ui));
}

describe('<NoAgencyState> (TCK-633)', () => {
  it('avec fournisseur : le CTA mène à la première page accessible', () => {
    rendre({ chemins: ['/admin/agency'], espaceIndividuel: true });
    expect(screen.getByRole('link', { name: "Aller à l'administration" })).toHaveAttribute('href', '/admin/agency');
  });

  it('aucune page accessible : pas de CTA', () => {
    rendre({ chemins: [], espaceIndividuel: false });
    expect(screen.queryByRole('link')).toBeNull();
  });

  it("sans fournisseur : le lien d'avant, vers /admin", () => {
    rendre(null);
    expect(screen.getByRole('link', { name: "Aller à l'administration" })).toHaveAttribute('href', '/admin');
  });
});
```

- [ ] **Step 2 : les voir échouer**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-web
npx vitest run src/components/dashboard/__tests__/DashboardShortcuts.test.tsx \
  src/components/dashboard/__tests__/DashboardEmpty.test.tsx \
  src/components/shared/__tests__/NoAgencyState.test.tsx
```

Expected : FAIL — le solo reçoit `/admin` ; « Ouvrir mon espace » introuvable ; le CTA de
`NoAgencyState` reste `/admin` avec un fournisseur.

- [ ] **Step 3 : l'implémentation minimale**

`DashboardShortcuts.tsx`, quatre Edit :

```
old:
import Link from 'next/link';
import {
  BarChart3,
new:
'use client';

import Link from 'next/link';
import {
  BarChart3,
```

```
old:
import type { UserRole } from '@/types/user';
new:
import type { UserRole } from '@/types/user';
import { entreeAdmin, type EntreeAdmin } from '@/lib/access/pages-admin';
import { useAccesAdminOuRepli } from '@/lib/access/acces-admin-contexte';
```

```
old:
function buildShortcuts(roles: UserRole[], agencyId: number | null | undefined): Shortcut[] {
  const list: Shortcut[] = [];

  if ((isAdmin(roles) || isSuperAdmin(roles)) && agencyId) {
    list.push({ href: '/admin', labelKey: 'nav.sidebar.administration', icon: ShieldCheck });
new:
function buildShortcuts(
  roles: UserRole[],
  agencyId: number | null | undefined,
  entree: EntreeAdmin | null,
): Shortcut[] {
  const list: Shortcut[] = [];

  if ((isAdmin(roles) || isSuperAdmin(roles)) && agencyId) {
    // TCK-633 (lot B) — la première page `/admin/*` que le profil peut ouvrir, ou aucun raccourci.
    if (entree) list.push({ href: entree.href, labelKey: `nav.admin.${entree.cle}`, icon: ShieldCheck });
```

```
old:
export function DashboardShortcuts({ roles, agencyId = null }: Props) {
  const t = useTranslations();
  const shortcuts = buildShortcuts(roles, agencyId);
new:
export function DashboardShortcuts({ roles, agencyId = null }: Props) {
  const t = useTranslations();
  const acces = useAccesAdminOuRepli({ roles, agencyId });
  const shortcuts = buildShortcuts(roles, agencyId, entreeAdmin(acces));
```

`DashboardEmpty.tsx` — fichier de 39 lignes, réécrit en entier (Write, territoire) :

```tsx
'use client';

import Link from 'next/link';
import { Compass, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { EmptyState } from '@/components/feedback';
import { buttonVariants } from '@/components/ui/button';
import { entreeAdmin } from '@/lib/access/pages-admin';
import { useAccesAdminOuRepli } from '@/lib/access/acces-admin-contexte';
import type { UserRole } from '@/types/user';

type Props = {
  roles: UserRole[];
};

/**
 * L'accueil sans activité. Il passe par l'`EmptyState` partagé (design-guidelines, « un seul
 * composant les rend tous ») : la version locale rendait sa phrase en 12 px, sous le plancher de
 * 14 px du corps, et dans une carte qu'aucun autre état vide du produit ne dessine.
 *
 * TCK-633 (lot B) — la variante « admin » ne se montre que s'il existe une page `/admin/*` que le
 * profil peut ouvrir, et mène à la première : « Ouvrir mon espace » chez un solo.
 */
export function DashboardEmpty({ roles }: Props) {
  const t = useTranslations('dashboard.empty');
  const tAdmin = useTranslations('nav.admin');
  const entree = entreeAdmin(useAccesAdminOuRepli({ roles }));
  const Icon = entree ? ShieldCheck : Compass;
  const cta = entree
    ? entree.cle === 'mySpace'
      ? tAdmin('openMySpace')
      : t('adminCta')
    : t('userCta');

  return (
    <EmptyState
      icon={<Icon className="size-8" aria-hidden />}
      title={entree ? t('adminTitle') : t('userTitle')}
      description={<span className="text-pretty">{entree ? t('adminBody') : t('userBody')}</span>}
      action={
        <Link href={entree ? entree.href : '/properties'} className={buttonVariants({ variant: 'outline' })}>
          {cta}
        </Link>
      }
    />
  );
}
```

`NoAgencyState.tsx` — trois Edit :

```
old:
import { Building2 } from 'lucide-react';
new:
'use client';

import { Building2 } from 'lucide-react';
```

```
old:
import { buttonVariants } from '@/components/ui/button';
new:
import { buttonVariants } from '@/components/ui/button';
import { entreeAdmin } from '@/lib/access/pages-admin';
import { useAccesAdmin } from '@/lib/access/acces-admin-contexte';
```

```
old:
export function NoAgencyState({ title }: NoAgencyStateProps) {
  const t = useTranslations('errors.noAgency');
new:
export function NoAgencyState({ title }: NoAgencyStateProps) {
  const t = useTranslations('errors.noAgency');
  // TCK-633 (lot B) — avec un fournisseur, le CTA mène à la première page `/admin/*` accessible, et
  // disparaît s'il n'y en a aucune. Sans fournisseur (le layout `/app` n'en monte pas encore, E5),
  // le lien d'avant : ce composant ne connaît pas les rôles et ne peut pas dériver de repli.
  const acces = useAccesAdmin();
  const href = acces === null ? '/admin' : (entreeAdmin(acces)?.href ?? null);
```

```
old:
        action={
          <Link href="/admin" className={buttonVariants({ variant: 'outline' })}>
            {t('cta')}
          </Link>
        }
new:
        action={
          href === null ? undefined : (
            <Link href={href} className={buttonVariants({ variant: 'outline' })}>
              {t('cta')}
            </Link>
          )
        }
```

- [ ] **Step 4 : les voir passer**

```bash
npx vitest run src/components/dashboard/__tests__/DashboardShortcuts.test.tsx \
  src/components/dashboard/__tests__/DashboardEmpty.test.tsx \
  src/components/shared/__tests__/NoAgencyState.test.tsx \
  "src/app/(dashboard)/app/__tests__/interruptions-autorisation.test.tsx" \
  src/lib/queries/__tests__/dashboard-me.tck-595.test.ts
```

Expected : PASS.

- [ ] **Step 5 : ablation**

```bash
S="<scratchpad de l'agent>/tck-633-lot-b"; F=src/components/dashboard/DashboardShortcuts.tsx
cp "$F" "$S/DashboardShortcuts.tsx.ok"; md5 -q "$F" > "$S/DashboardShortcuts.tsx.md5"
```

Edit : `href: entree.href` → `href: '/admin'`. Relancer `DashboardShortcuts.test.tsx` → **FAIL** sur
« un solo : « Mon espace » vers sa première page ». Restaurer (`cp` + `md5`). Même geste sur
`DashboardEmpty.tsx` (`entree ? entree.href : '/properties'` → `entree ? '/admin' : '/properties'`
→ **FAIL** sur « solo : « Ouvrir mon espace » ») et sur `NoAgencyState.tsx`
(`(entreeAdmin(acces)?.href ?? null)` → `'/admin'` → **FAIL** sur « aucune page accessible : pas de
CTA »), chacun restauré par `cp` + `md5`.

- [ ] **Step 6 : signaler à la session** les trois composants et les trois tests.

---

## Task 13 : la carte « Administration » du profil

**Files :**
- Modify : `takussan-web/src/components/profile/ProfileAdminSection.tsx:1-58`
- Test : `takussan-web/src/components/profile/__tests__/ProfileAdminSection.test.tsx`

- [ ] **Step 1 : écrire le test qui échoue**

`takussan-web/src/components/profile/__tests__/ProfileAdminSection.test.tsx` :

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { User } from '@/types/user';

/**
 * TCK-633 (lot B, AC1) — la carte « Administration » du profil ne propose que des pages que le
 * profil peut ouvrir, et parle à un solo de « son espace », avec un rôle qu'il comprend.
 */
const { accesAdmin } = vi.hoisted(() => ({ accesAdmin: vi.fn() }));

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/lib/access/pages-admin-server', () => ({ accesAdmin: (u: User) => accesAdmin(u) }));

const { ProfileAdminSection } = await import('../ProfileAdminSection');

const ADMIN = { id: 1, roles: ['agency_admin', 'customer'], agency_id: 7 } as unknown as User;
const hrefs = () => screen.getAllByRole('link').map((l) => l.getAttribute('href'));

describe('<ProfileAdminSection> (TCK-633)', () => {
  it('solo : « Mon espace », un rôle compréhensible, et aucun lien vers une page qui le refuse', async () => {
    accesAdmin.mockResolvedValue({
      chemins: ['/admin/agency', '/admin/agency/kyc', '/admin/finances', '/admin/settings/integrations'],
      espaceIndividuel: true,
    });
    render((await ProfileAdminSection({ user: ADMIN }))!);

    expect(screen.getByRole('heading', { name: 'Mon espace' })).toBeInTheDocument();
    expect(screen.getByText("Titulaire de l'espace")).toBeInTheDocument();
    expect(screen.queryByText('Admin agence')).toBeNull();
    expect(hrefs()).toEqual(['/admin/agency']);
    expect(screen.getByRole('link', { name: 'Ouvrir mon espace' })).toHaveAttribute('href', '/admin/agency');
    expect(accesAdmin).toHaveBeenCalledWith(ADMIN);
  });

  it("admin standard : la carte d'avant, à l'identique", async () => {
    accesAdmin.mockResolvedValue({
      chemins: ['/admin', '/admin/team', '/admin/agency', '/admin/audit'],
      espaceIndividuel: false,
    });
    render((await ProfileAdminSection({ user: ADMIN }))!);

    expect(screen.getByRole('heading', { name: 'Administration' })).toBeInTheDocument();
    expect(screen.getByText('Admin agence')).toBeInTheDocument();
    expect(hrefs()).toEqual(['/admin/agency', '/admin/audit', '/admin']);
  });

  it('aucune page accessible : la carte ne se rend pas', async () => {
    accesAdmin.mockResolvedValue({ chemins: [], espaceIndividuel: false });
    expect(await ProfileAdminSection({ user: ADMIN })).toBeNull();
  });
});
```

- [ ] **Step 2 : le voir échouer**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-web
npx vitest run src/components/profile/__tests__/ProfileAdminSection.test.tsx
```

Expected : FAIL — titre « Administration » chez le solo ; liens `/admin/audit` et `/admin` présents ;
la carte se rend sans page accessible.

- [ ] **Step 3 : l'implémentation minimale** — fichier de 58 lignes réécrit en entier (Write) :

```tsx
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { User, UserRole } from '@/types/user';
import { getPrimaryRole } from '@/lib/roles';
import { buttonVariants } from '@/components/ui/button';
import { entreeAdmin, liensDuProfil } from '@/lib/access/pages-admin';
import { accesAdmin } from '@/lib/access/pages-admin-server';

interface ProfileAdminSectionProps {
  user: User;
}

/** La donnée porte la CLÉ de `profile.roles.*` ; le libellé est résolu au rendu. */
const ROLE_KEYS: Record<UserRole, string> = {
  customer: 'customer',
  tenant: 'tenant',
  agent: 'agent',
  owner: 'owner',
  agency_admin: 'agency_admin',
  super_admin: 'super_admin',
  service_provider: 'service_provider',
};

/**
 * TCK-633 (lot B, AC1) — la carte ne propose QUE des pages que le profil peut ouvrir (`PAGES_ADMIN`),
 * et rien du tout s'il n'y en a aucune. Chez un admin d'agence `individual`, elle parle de « son
 * espace » et de son rôle de titulaire : « Admin agence » ne veut rien dire pour un particulier qui
 * publie ses propres biens.
 */
export async function ProfileAdminSection({ user }: ProfileAdminSectionProps) {
  const acces = await accesAdmin(user);
  const entree = entreeAdmin(acces);
  if (entree === null) return null;

  const t = await getTranslations('profile.admin');
  const tRoles = await getTranslations('profile.roles');
  const tNav = await getTranslations('nav.admin');
  const primaryRole = getPrimaryRole(user.roles);
  const solo = acces.espaceIndividuel;
  // Le lien principal mène déjà à la première page : on ne le répète pas en lien secondaire.
  const liens = liensDuProfil(acces).filter((lien) => lien.chemin !== entree.href);

  return (
    <section className="space-y-4 rounded-2xl bg-border p-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">{solo ? t('titleIndividual') : t('title')}</h2>
        <p className="text-sm text-muted-foreground">{solo ? t('subtitleIndividual') : t('subtitle')}</p>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-semibold text-muted-foreground">
          {solo ? t('roleLabelIndividual') : t('roleLabel')}
        </p>
        <p className="text-sm font-semibold text-foreground">
          {solo ? t('roleIndividual') : primaryRole ? tRoles(ROLE_KEYS[primaryRole]) : '—'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {liens.map((lien) => (
          <Link
            key={lien.chemin}
            href={lien.chemin}
            className={buttonVariants({ variant: 'outline', className: 'rounded-md' })}
          >
            {t(lien.cle)}
          </Link>
        ))}
        <Link href={entree.href} className={buttonVariants({ className: 'rounded-md' })}>
          {solo ? tNav('openMySpace') : t('adminSpace')}
        </Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 4 : le voir passer**

```bash
npx vitest run src/components/profile/__tests__/ProfileAdminSection.test.tsx
```

Expected : PASS (3 tests).

- [ ] **Step 5 : ablation**

```bash
S="<scratchpad de l'agent>/tck-633-lot-b"; F=src/components/profile/ProfileAdminSection.tsx
cp "$F" "$S/ProfileAdminSection.tsx.ok"; md5 -q "$F" > "$S/ProfileAdminSection.tsx.md5"
```

1. Edit : `liensDuProfil(acces).filter((lien) => lien.chemin !== entree.href)` →
   `liensDuProfil(acces)`. Relancer → **FAIL** sur le solo (`['/admin/agency', '/admin/agency']`).
2. Restaurer, puis Edit : retirer `  if (entree === null) return null;` et remplacer `entree.href` par
   `entree?.href ?? '/admin'` (pour compiler). Relancer → **FAIL** sur « la carte ne se rend pas ».

```bash
S="<scratchpad de l'agent>/tck-633-lot-b"; F=src/components/profile/ProfileAdminSection.tsx
cp "$S/ProfileAdminSection.tsx.ok" "$F"; md5 -q "$F" | diff - "$S/ProfileAdminSection.tsx.md5" && echo "restauré"
```

- [ ] **Step 6 : signaler à la session** `ProfileAdminSection.tsx` et son test.

---

## Task 14 : le layout `/app` monte le fournisseur *(hors territoire — E5, accord requis)*

**Sans accord de la session, ne rien éditer** : écrire les trois blocs ci-dessous dans `collisions`.
Sans eux, la barre `/app` et le menu utilisateur retombent sur le REPLI (fail-closed) : un admin
`standard` y lit « Administration » vers `/admin` (le layout transmet `agencyIsStandard`), mais le
menu utilisateur, qui ne reçoit pas ce drapeau, l'envoie vers `/admin/agency` ; un solo y lit bien
« Mon espace » dans la barre, mais « Administration » dans le menu utilisateur.

**Files :**
- Modify : `takussan-web/src/app/(dashboard)/app/layout.tsx:1-8,69-79`
- Modify : `takussan-web/src/app/(dashboard)/app/__tests__/bandeau-suspension.test.tsx:19-21`
- Test : `takussan-web/src/app/(dashboard)/app/__tests__/layout.acces-admin.test.tsx`

- [ ] **Step 1 : écrire le test qui échoue**

`takussan-web/src/app/(dashboard)/app/__tests__/layout.acces-admin.test.tsx` :

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

import type { AccesAdmin } from '@/lib/access/pages-admin';
import type { User } from '@/types/user';

/** TCK-633 (lot B) — le layout `/app` fournit les pages admin accessibles à la coque. */
const { getMe, accesAdmin, sonde } = vi.hoisted(() => ({
  getMe: vi.fn(),
  accesAdmin: vi.fn(),
  sonde: vi.fn(),
}));

vi.mock('@/app/actions/auth', () => ({ getMeAction: () => getMe() }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/access/server-guards', () => ({
  resolveAgencyOrNull: async () => ({ id: 7, kind: 'individual', status: 'active' }),
}));
vi.mock('@/lib/access/pages-admin-server', () => ({ accesAdmin: (u: User) => accesAdmin(u) }));
vi.mock('@/lib/queries/agency-upgrade', () => ({ fetchAgencyUpgradeRequests: async () => ({ data: [] }) }));
vi.mock('@/i18n/messages', () => ({ messagesPour: async () => ({}) }));
vi.mock('@/i18n/IntlProvider', () => ({
  IntlProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/layout/AppShell', async () => {
  const { useAccesAdmin } = await import('@/lib/access/acces-admin-contexte');
  return {
    AppShell: () => {
      sonde(useAccesAdmin());
      return null;
    },
  };
});

const { default: AppLayout } = await import('../layout');

describe('layout /app — le fournisseur d’accès (TCK-633)', () => {
  it('fournit à la coque les pages admin accessibles', async () => {
    const user = { id: 1, roles: ['agency_admin'], agency_id: 7 } as unknown as User;
    const acces: AccesAdmin = { chemins: ['/admin/agency'], espaceIndividuel: true };
    getMe.mockResolvedValue(user);
    accesAdmin.mockResolvedValue(acces);

    render(await AppLayout({ children: null }));

    expect(accesAdmin).toHaveBeenCalledWith(user);
    expect(sonde).toHaveBeenLastCalledWith(acces);
  });
});
```

Et, dans `bandeau-suspension.test.tsx` (le layout appellera `accesAdmin`, qui lirait
`getActiveProfileId` absent de son simulacre de session) :

```
old:
vi.mock('@/lib/access/server-guards', () => ({
  resolveAgencyOrNull: (...args: unknown[]) => resolveAgencyOrNull(...args),
}));
new:
vi.mock('@/lib/access/server-guards', () => ({
  resolveAgencyOrNull: (...args: unknown[]) => resolveAgencyOrNull(...args),
}));
vi.mock('@/lib/access/pages-admin-server', () => ({
  accesAdmin: async () => ({ chemins: [], espaceIndividuel: false }),
}));
```

- [ ] **Step 2 : le voir échouer**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-web
npx vitest run "src/app/(dashboard)/app/__tests__/layout.acces-admin.test.tsx"
```

Expected : FAIL — `accesAdmin` jamais appelé ; la sonde reçoit `null`.

- [ ] **Step 3 : l'implémentation minimale** — `app/layout.tsx`, deux Edit.

```
old:
import { isAgent } from '@/lib/roles';
new:
import { isAgent } from '@/lib/roles';
import { accesAdmin } from '@/lib/access/pages-admin-server';
import { AccesAdminProvider } from '@/lib/access/acces-admin-contexte';
```

```
old:
  return (
    <IntlProvider messages={await messagesPour('(dashboard)/app')}>
      <AppShell
        user={user}
        agencyIsStandard={agencyIsStandard}
        hasPendingUpgrade={hasPendingUpgrade}
        agencySuspended={agencySuspended}
      >
        {children}
      </AppShell>
    </IntlProvider>
  );
new:
  // TCK-633 (lot B) — les pages `/admin/*` accessibles, pour l'entrée d'administration de la barre,
  // du menu utilisateur, des raccourcis et des états vides. L'agence est relue par la promesse mise
  // en cache ci-dessus ; les capacités coûtent une requête, pour un `agency_admin` seulement.
  const acces = await accesAdmin(user);

  return (
    <IntlProvider messages={await messagesPour('(dashboard)/app')}>
      <AccesAdminProvider acces={acces}>
        <AppShell
          user={user}
          agencyIsStandard={agencyIsStandard}
          hasPendingUpgrade={hasPendingUpgrade}
          agencySuspended={agencySuspended}
        >
          {children}
        </AppShell>
      </AccesAdminProvider>
    </IntlProvider>
  );
```

- [ ] **Step 4 : le voir passer**

```bash
npx vitest run "src/app/(dashboard)/app/__tests__/layout.acces-admin.test.tsx" \
  "src/app/(dashboard)/app/__tests__/bandeau-suspension.test.tsx"
```

Expected : PASS.

- [ ] **Step 5 : ablation**

```bash
S="<scratchpad de l'agent>/tck-633-lot-b"; F="src/app/(dashboard)/app/layout.tsx"
cp "$F" "$S/app-layout.tsx.ok"; md5 -q "$F" > "$S/app-layout.tsx.md5"
```

Edit : `<AccesAdminProvider acces={acces}>` → `<AccesAdminProvider acces={null as never}>`. Relancer
→ **FAIL** (`sonde` reçoit `null`). Restaurer :

```bash
S="<scratchpad de l'agent>/tck-633-lot-b"; F="src/app/(dashboard)/app/layout.tsx"
cp "$S/app-layout.tsx.ok" "$F"; md5 -q "$F" | diff - "$S/app-layout.tsx.md5" && echo "restauré"
```

- [ ] **Step 6 : signaler à la session** les trois fichiers (ou les trois blocs en `collisions`).

---

## Task 15 : vérification au navigateur — EN LOCAL seulement

**Jamais `preview.takussan.com`.** Uniquement `http://localhost:3000` (front) contre l'API locale
(`127.0.0.1:8002`). Tout outil convient (Chrome DevTools MCP, ou CDP direct) ; chaque constat se
note au rapport avec l'URL **finale** et l'heure.

- [ ] **Step 1 : vérifier que la pile locale répond**

```bash
cd /Users/aminethiam/Documents/perso/takussan
./dev.sh doctor
```

Expected : API, front, PostgreSQL et Meilisearch répondent. Si le front ou l'API ne tourne pas, le
demander à la session (`./dev.sh` est un processus long, il ne se lance pas depuis un sous-agent).

- [ ] **Step 2 : compte SOLO (agence `individual`)** — celui que la Task 0, Step 3 a imprimé
  (`admin@agency<ID>.demo.takussan.sn`, mot de passe `password`, agence « Studio de Aminata » ou la
  première `individual`).

1. Ouvrir `http://localhost:3000/auth/login`, se connecter.
2. Sur `/app` : la barre latérale montre **« Mon espace »** (pas d'en-tête « ADMINISTRATION » au-dessus),
   son `href` est `/admin/agency` ; aucune entrée ne pointe vers `/admin`. Les deux cadenas restants
   sont « Vue agence » et « Bailleurs » (inchangés, hors de ce lot).
3. Raccourcis de l'accueil : la tuile « Mon espace » mène à `/admin/agency` (si l'accueil rend l'état
   vide, son bouton dit « Ouvrir mon espace » et mène au même endroit).
4. Menu utilisateur (avatar en haut à droite) : l'entrée **« Mon espace »** ; cliquer → l'URL finale
   est `/admin/agency`, la page « Configuration de l'agence » **s'affiche** (pas de renvoi).
5. Dans `/admin/agency` : l'en-tête de la barre dit « MON ESPACE » ; les entrées sont exactement
   Agence, KYC agence, Abonnement (si `update_billing=true` en Task 0), Finances, Intégrations.
   Cliquer **chacune** : l'URL finale reste celle cliquée, la page s'affiche. Une page qui s'affiche
   avec une erreur d'API (et non un renvoi) se note au rapport, ne se corrige pas.
6. À 390 px de large (émulation mobile), ouvrir le tiroir : son nom accessible est « Mon espace »
   (DevTools → Accessibilité du `dialog`).
7. Taper à la main `http://localhost:3000/admin` → URL finale `/admin/agency` ; dans l'onglet
   Réseau, la requête document `/admin` répond **307** vers `/admin/agency`. Même chose pour
   `/admin/audit`, `/admin/team`, `/admin/roles`, `/admin/moderation` et `/admin/settings` → toutes
   finissent sur `/admin/agency`.
8. `/app/profile` : la carte s'intitule « Mon espace », le rôle « Titulaire de l'espace » ; un seul
   bouton, « Ouvrir mon espace », vers `/admin/agency` ; aucun lien « Journal d'audit ».
9. Menu utilisateur → « Déconnexion » : URL finale `http://localhost:3000/fr` (l'accueil), pas
   `/auth/login`.

- [ ] **Step 3 : compte ADMIN `standard`** (deuxième ligne de la Task 0, Step 3 — « Dakar Immo » ou la
  première `standard`).

1. Se connecter. Sur `/app`, la barre montre l'en-tête « ADMINISTRATION » et l'entrée
   « Administration » vers `/admin`.
2. Cliquer : `/admin` s'affiche (tableau de bord : files, KPI). La barre `/admin` liste, dans cet
   ordre : Tableau de bord, Équipe, Rôles, Agence, KYC agence, Abonnement, Finances, Modération avis,
   Modération biens, Journal d'audit, Intégrations — **les onze d'avant** ; aucune n'est verrouillée.
3. Ouvrir chacune : aucune ne renvoie ailleurs.
4. `http://localhost:3000/admin/settings` (réservée au super-admin) → URL finale `/admin`.
5. `/app/profile` : la carte « Administration », rôle « Admin agence », boutons « Gérer l'agence »,
   « Journal d'audit », « Espace administration » — comme avant.
6. Déconnexion depuis le menu utilisateur → `/fr`.

- [ ] **Step 4 : session expirée (contrôle de non-régression)** — connecté avec l'un des deux
  comptes, supprimer le cookie de session dans DevTools (Application → Cookies), puis recharger une
  page `/app` : l'URL finale est la page de **connexion**, pas l'accueil.

- [ ] **Step 5 : écrire chaque constat au rapport** (`tests`, une entrée `navigateur` par étape :
  URL, résultat, heure).

---

## Task 16 : gardes, rapport, message

- [ ] **Step 1 : tous les fichiers de test du lot, une dernière fois**

```bash
cd /Users/aminethiam/Documents/perso/takussan/takussan-web
npx vitest run src/lib/access/__tests__ \
  src/components/layout/__tests__/AdminSidebar.acces.test.tsx \
  src/components/layout/__tests__/AdminSidebar.a11y.test.tsx \
  src/components/layout/__tests__/AdminSidebar.integrations.test.tsx \
  src/components/layout/__tests__/AppSidebar.acces-admin.test.tsx \
  src/components/layout/__tests__/AppSidebar.test.tsx \
  src/components/layout/__tests__/AppSidebar.audience.test.tsx \
  src/components/layout/__tests__/UserMenu.test.tsx \
  src/components/layout/__tests__/Consoles.bandeaux.test.tsx \
  src/components/layout/__tests__/CoqueHauteur.test.tsx \
  src/components/dashboard/admin/__tests__/AgencyQueues.source-unique.test.tsx \
  src/test/__tests__/portees-sombres.test.tsx \
  src/components/dashboard/__tests__/DashboardShortcuts.test.tsx \
  src/components/dashboard/__tests__/DashboardEmpty.test.tsx \
  src/components/shared/__tests__/NoAgencyState.test.tsx \
  src/components/profile/__tests__/ProfileAdminSection.test.tsx \
  "src/app/(dashboard)/admin" \
  "src/app/(dashboard)/app/__tests__/bandeau-suspension.test.tsx" \
  "src/app/(dashboard)/app/__tests__/layout.acces-admin.test.tsx" \
  "src/app/(dashboard)/app/__tests__/interruptions-autorisation.test.tsx" \
  "src/app/(dashboard)/app/__tests__/etats-de-route.test.ts" \
  src/context/__tests__/AuthContext.session.test.tsx \
  src/lib/queries/__tests__/dashboard-me.tck-595.test.ts
npx tsc --noEmit
npm run lint
npm run check:i18n
npm run check:i18n-namespaces
cd ..
node scripts/check-pro-routes.mjs --report
for g in scripts/check-*.mjs; do node "$g" > /dev/null 2>&1 || echo "✗ $g"; done
```

Expected : tout vert. `tsc` et `lint` portent sur tout l'arbre : un rouge situé dans un fichier
d'un autre lot se note au rapport, ne se corrige pas. Si `check:i18n-namespaces` demande une mise à
jour de `src/i18n/namespaces.json` (hors territoire), ne pas lancer `--update` : bloc en
`collisions`. Les fichiers des Tasks 7, 11 et 14 hors territoire non accordés rougissent leurs
tests : c'est attendu, ils sont en `collisions`.

- [ ] **Step 2 : écrire le rapport** `docs/plans/rapports/tck-633-lot-b.json` (outil Write)

```json
{
  "verdict": "PRÊT | PRÊT AVEC COLLISIONS | BLOQUÉ",
  "fichiers": ["<chemin exact>", "…"],
  "tests": [
    { "commande": "…", "resultat": "N passed" },
    { "navigateur": "solo — /admin tapé à la main", "url_finale": "/admin/agency", "statut": "307", "heure": "…" }
  ],
  "ablations": [
    { "fichier": "…", "retrait": "…", "rouge_observe": "…", "md5_avant": "…", "md5_ablate": "…", "md5_apres": "…" }
  ],
  "ecarts_au_ticket": ["E1 …", "…"],
  "collisions": [{ "fichier": "…", "raison": "…", "bloc_propose": "…" }]
}
```

`fichiers` est la liste des fichiers à commiter (règle 1) ; `ablations` reprend chaque ablation des
Tasks 1 à 14 ; `ecarts_au_ticket` reprend les écarts ci-dessous **tels qu'observés**, plus tout
nouveau ; `collisions` porte les blocs des fichiers hors territoire non accordés (E5).

- [ ] **Step 3 : message final, une ligne**

`lot B : <verdict>, <N> tests neufs verts, <M> ablations rejouées, rapport docs/plans/rapports/tck-633-lot-b.json`

---

## Écarts relevés

Mesurés en écrivant ce plan (2026-10-12). Chacun contredit ou précise le ticket ou le plan maître.

- **E1 — L'espace i18n `admin.nav.*` n'existe pas.** Le plan maître (§ Territoires, ligne B) le
  donne ; les libellés du menu admin vivent sous **`nav.admin.*`** (`dashboard`, `team`, …,
  `sectionLabel`, `proLocked`). Écrire sous `admin.nav` aurait aussi tiré l'espace `admin`
  (≈ 10 Ko gzip) dans la frontière `(dashboard)/app`, qui ne le charge pas (`i18n/namespaces.json`).
  Ce plan écrit `nav.admin.mySpace` et `nav.admin.openMySpace`. À valider par la session ; aucun autre
  lot n'écrit sous `nav.admin`.
- **E2 — Périmètre de la déconnexion.** Le ticket range « Déconnexion du menu utilisateur vers
  l'accueil » dans le lot A ; le plan maître la donne au lot B. Ce plan suit le plan maître (Task 11).
  La Navbar publique déconnecte déjà vers l'accueil (`components/home/Navbar.tsx:248-249`).
- **E3 — `check-pro-routes.mjs` ne lit pas `docs/features.md`**, contrairement à ce que la consigne
  et §1.12 laissent entendre : c'est `lib/access/__tests__/pro-features.test.ts` qui tient l'accord
  sur la liste fermée (KPI et alertes non réservés). Écrit dans le docblock du script (Task 10).
- **E4 — `NoAgencyState` vit dans `components/shared/`**, pas `components/dashboard/` : le territoire
  le nomme à côté de `DashboardShortcuts.tsx` et `DashboardEmpty.tsx`. Le plan l'édite à son vrai
  chemin. Il est rendu par 8 pages (dont 4 sous `/admin`), et mocké par
  `app/(dashboard)/app/__tests__/interruptions-autorisation.test.tsx`.
- **E5 — Fichiers hors territoire à accorder** (sans accord : `collisions`) :
  - `app/(dashboard)/app/layout.tsx` et `app/(dashboard)/app/__tests__/bandeau-suspension.test.tsx`
    (Task 14) — sans eux, `/app` peint depuis le REPLI (cf. en-tête de la Task 14) ;
  - `context/__tests__/AuthContext.session.test.tsx:191` (Task 11) — il affirme la déconnexion vers
    `/auth/login`, que l'AC3 retire ;
  - `components/layout/__tests__/AppSidebar.test.tsx:583-588` (Task 7) — le test des cadenas compte
    « Administration » parmi les trois ;
  - les **fichiers de test neufs** posés dans des dossiers du territoire (`lib/access/__tests__`,
    `app/(dashboard)/admin/__tests__`, `components/layout/__tests__/{AdminSidebar,UserMenu,AppSidebar}.*`,
    `components/dashboard/__tests__`, `components/shared/__tests__`, `components/profile/__tests__`) :
    adjacents aux fichiers du lot, aucun autre lot n'y écrit ;
  - `app/(dashboard)/app/__tests__/layout.acces-admin.test.tsx` (neuf, Task 14).
  Proposition : accorder les quatre premiers au lot B.
- **E6 — Les cadenas du menu `/admin` disparaissent, et avec eux deux `describe` de TCK-371.**
  Le ticket veut qu'un solo « ne rencontre aucun lien qui le renvoie en arrière » ; TCK-371 voulait
  qu'un admin `individual` LISE ce qu'un passage en `standard` lui débloquerait. Les deux ne tiennent
  pas ensemble dans un même menu : ce plan suit le ticket. « Passer en pro » reste proposé par la
  carte `ProUpgradeCard` de la barre `/app` (inchangée). Les deux `describe` qui mesuraient le
  contraste et l'atteignabilité des entrées verrouillées sont remplacés (Task 5) ; les mesures
  d'anneau de focus (AC4) restent, sur les deux plans.
- **E7 — `ensureStandardAgencyOrRedirect` n'a plus d'appelant** (il gardait cinq pages `/admin`).
  Conservé : `etats-de-route.test.ts:346` le cite dans sa liste fermée `REFUS`, et `check-pro-routes`
  le suit encore pour les routes `/app`. Retrait proposé dans un ticket à part. `REFUS` ne connaît pas
  `garderPageAdmin` : sans effet aujourd'hui (le test ne balaie que `/app`), à ajouter si une page
  `/app` l'appelle un jour.
- **E8 — Un super-admin rattaché à une agence `individual` ouvre désormais les pages `standard`.**
  Avant, `ensureStandardAgencyOrRedirect` le renvoyait sur `/app`. C'est l'alignement sur l'API
  (`AgencyKindGuard::ensureStandardForNonGlobal` laisse passer le super-admin).
- **E9 — `/admin/agency/billing` exige désormais `agency.update_billing`.** Avant : tout admin. Aligné
  sur l'API (`AgencyPolicy::viewPlatformPayouts`). Conséquences : un admin dont le rôle d'agence ne
  porte pas la capacité perd l'entrée (il lisait une page dont l'API refusait les reversements) ; un
  `agency_admin` SANS agence aussi. Mesuré en Task 0, Step 3 sur les deux comptes de démonstration.
- **E10 — Une requête de plus par rendu** : `GET /api/me/capabilities`, pour un `agency_admin` non
  super-admin, dans le layout `/admin`, la carte du profil et (Task 14) le layout `/app`, une fois
  par rendu grâce à `cache()`. L'agence, elle, ne coûte rien de plus (`agenceDuRendu`).
- **E11 — Clés devenues inutilisées, laissées en place** (le nettoyage d'un dictionnaire co-tenu par
  six lots n'est pas l'objet de ce lot) : `nav.admin.proLocked`, `nav.administration` (ancien libellé
  de `UserMenu`), `nav.sidebar.administration` (ancien libellé de la barre et des raccourcis — la
  clé reste celle de l'emplacement posé par `buildNavItems`, mais n'est plus rendue).
- **E12 — `fetchMyCapabilities` (`lib/queries/dashboard.ts:200`) n'envoie pas le hint de profil** et
  avale toute erreur en `[]`. Ce lot ne l'emploie pas pour décider (lecture propre dans
  `pages-admin-server.ts`) et ne le corrige pas (hors territoire) : un compte multi-agences y lit les
  capacités de l'agence par défaut.
- **E13 — Liens codés en dur hors territoire, laissés tels quels** : `BrandingBanner` → `/admin/agency`
  (accessible à tout admin), `app/properties/new/page.tsx:102` → `/admin/agency/billing` si `isAdmin`
  (refusé à un admin sans `agency.update_billing` : renvoi vers sa première page). `MiseEnService` et
  `AgencyQueues` ne vivent que sur `/admin`.
- **E14 — Textes hors de l'espace du lot** : `dashboard.empty.adminTitle` / `adminBody` (« Configurez
  votre agence depuis l'administration… ») restent ceux de l'admin d'agence, y compris chez un solo ;
  seul le bouton dit « Ouvrir mon espace ». Le motif `?notice=` de `/admin/settings/tags` reste perdu
  pour un solo (`/admin` le renvoie vers sa première page, comme avant vers `/app`).
- **E15 — Le wolof** des six chaînes neuves (« Sama barab », « Ubbi sama barab », « Tegtal yi ci sa
  barab. », « Sa wàll », « Boroom barab bi ») est à faire relire par le porteur.
- **E16 — `/admin/properties` n'était gardé que par `isAdmin`** (le layout du segment source ne
  s'applique pas au réexport) : un `agency_admin` l'ouvrait en tapant l'URL. Il exige désormais
  `super_admin`, comme son entrée de menu l'a toujours supposé (Task 8).
- **E17 — Le layout `/admin` garde sa propre redirection** `isAdmin` → `/app/profile` : un non-admin
  qui tape une URL `/admin/*` va vers son profil (le layout), la page dirait `/app`. Comportement
  d'avant conservé ; la décision par page ne change rien pour lui.
- **E18 — `AdminShell`** (nom du tiroir) n'a pas de test unitaire : le tiroir ne se rend qu'ouvert ;
  vérifié au navigateur (Task 15, Step 2.6).
