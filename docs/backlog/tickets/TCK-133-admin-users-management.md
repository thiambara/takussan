---
id: TCK-133
title: "/admin/users — Gestion des utilisateurs de l'agence (agency_admin)"
status: review
phase: P1
family: front
estimate: M
created: 2026-05-02
updated: 2026-05-03
depends_on: [TCK-014, TCK-023, TCK-141, TCK-145, TCK-147]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
    - docs/features.md#22-rôles--permissions
  models:
    - docs/models-spec.md#1-user
    - docs/models-spec.md#2-agency
tags: [front, admin, users, p1]
---

## Objectif utilisateur

Un agency_admin accède à `/admin/users` pour consulter, activer, bloquer ou modifier les rôles des comptes utilisateurs de **son agence courante (profil actif)**, sans page « En cours de développement ».

## Impact TCK-138 → TCK-146

- **Scope re-cadré agency_admin uniquement** : la vue super_admin globale des comptes est **déjà livrée** sous `/super-admin/users` par TCK-145 (proxy `/api/super-admin-users` → `/api/users`). Ce ticket se concentre exclusivement sur l'espace agence (`/admin/*`, layout `(dashboard)`).
- **Profil actif** : le scope de l'agence n'est plus dérivé de `users.agency_id` (colonne supprimée TCK-142) mais du **profil actif** résolu par `ResolveActiveProfile` (TCK-141). Pour un agency_admin avec plusieurs profils, le `ProfileSwitcher` (TCK-143) détermine implicitement quelle agence est listée. Aucun filtre `agency_id` à passer côté client : le backend résout via `team_id`.
- **Endpoint d'attribution de rôle** : utiliser `PUT /api/users/{user}/role` (singulier — replace via `syncRoles`, livré TCK-014). Les anciens endpoints `POST /users/{id}/roles` / `DELETE /users/{id}/roles/{role}` mentionnés dans la version initiale n'existent pas — ils relèvent d'une attribution additive non livrée. Le backend force désormais 422 si le user cible n'a pas d'agence résolvable (TCK-PR-104 hardening).
- **Helpers d'autorisation côté backend** : `User::isSuperAdmin()` (probe team_id=null), `isAgentAt($agencyId)`, `isOwnerAt($agencyId)`. Côté frontend, ne dériver aucune permission depuis le profil — toujours lire `roles` de `/auth/me`.
- **Champ `users.type` supprimé** (TCK-142) : retirer toute mention de `filter[type]` ou `fields[users]=...,type,...` — le backend ne l'expose plus. Le persona effectif d'un user dans une agence se lit via ses profils (`OwnerProfile` / `AgentProfile` / `BrokerProfile` / `ServiceProviderProfile`) ou ses rôles spatie courants.

## Contrat de données

Endpoints existants (TCK-014, TCK-023) :
- `GET /api/users` — scope automatique selon le rôle et le **profil actif** (agency_admin → users avec un profil dans l'agence courante)
- `PATCH /api/users/{id}` — édition statut / champs admin (jamais le rôle)
- `PUT /api/users/{user}/role` — remplacement du rôle (TCK-014, hardening TCK-PR-104). Body : `{ "role": "agent" }`

Conventions Spatie : `filter[search]`, `filter[status]`, `filter[role]`, `include=agency,roles`, `fields[users]=id,first_name,last_name,email,status,...`.

⚠ **Distinction explicite avec `/admin/team` (TCK-065)** : `/admin/team` gère la composition de l'équipe agence (ajout/retrait d'un agent à une agence) — c.-à-d. la création/retrait d'`AgentProfile`. `/admin/users` est une vue **liste exhaustive** des comptes ayant un lien quelconque avec l'agence courante (locataires/bailleurs via `OwnerProfile`, agents via `AgentProfile`, clients via la relation `Customer`).

## Direction UX / Artistique

- Vue **table dense** : colonnes (avatar, nom, email, rôle(s), statut, agence, dernière connexion).
- Filtres : recherche libre (nom/email), statut (active/blocked/pending), rôle. Pas de filtre agence (le scope est imposé par le profil actif).
- Action par ligne : voir détail, activer/bloquer, gérer rôles, envoyer reset mdp.
- Drawer latéral pour le détail / édition d'un user (ne pas naviguer hors page).
- Cohérent avec `/admin/team` mais **clairement différent** (libellé h1 "Gestion des utilisateurs", sous-titre "Comptes de votre agence").

## Contraintes strictes (métier)

- Un agency_admin ne voit et ne modifie **que** les users avec un profil actif dans son agence courante ; le scope est imposé par le backend (`team_id` posé par `ResolveActiveProfile`), le frontend ne doit pas court-circuiter.
- Bloquer un user déclenche une révocation immédiate des tokens Sanctum (côté backend) et un `ActivityLog`.
- Un agency_admin ne peut pas se bloquer lui-même.
- Modifier les rôles passe obligatoirement par `PUT /api/users/{user}/role` (jamais `PATCH /users` direct sur un champ rôle).
- Permission requise : `users.update_in_agency` (agency_admin) — voir TCK-014. Pour la portée super_admin globale, voir `/super-admin/users` (TCK-145).
- Si le user cible n'a pas de profil dans l'agence courante, l'attribution de rôle retournera **422** (`messages.target_user_has_no_active_agency`) — afficher le message backend tel quel.

## Delta à produire

- [ ] Page UI: `src/app/(dashboard)/admin/users/page.tsx` — retirer `<StubPlaceholder>`
- [ ] Composants `AdminUsersTable`, `AdminUsersFilters`, `UserDetailDrawer`, `UserRolesEditor`
- [ ] Hooks React Query : liste, mutation statut, mutation rôle (vers `PUT /api/users/{user}/role`)
- [ ] Garde permission côté frontend (afficher état dégradé si non autorisé)
- [ ] Skeletons et états vides
- [ ] Tests UI : guard rôle, scope agence (via profil actif), mutation de rôle, gestion du 422 cible sans agence

## Critères d'acceptation

- [ ] La page n'affiche plus `<StubPlaceholder>`
- [ ] Un agency_admin ne voit que les users rattachés à son agence courante (profil actif)
- [ ] Activer/bloquer un user met à jour la liste sans rechargement complet
- [ ] Modifier le rôle d'un user passe par `PUT /api/users/{user}/role` et persiste
- [ ] L'agency_admin connecté ne peut pas se bloquer lui-même (action désactivée)
- [ ] Aucun champ `type` n'est demandé / affiché (la colonne n'existe plus)
- [ ] Aucun fetch ne retourne tous les champs (sparse fieldsets)

## Hors périmètre

- Vue super_admin globale des comptes (livrée par TCK-145 sous `/super-admin/users`)
- Création de user (couverte par invitation TCK-065 et par l'inscription publique)
- Création/retrait d'un profil pour rattacher un user à l'agence (`AgentProfile`/`OwnerProfile` — couvert par TCK-065 / ticket dédié à filer)
- Suppression de compte (RGPD, P2 dédié)
- Modification des rôles personnalisés agence (TCK-135)

## Notes d'implémentation

- **Proxy `/api/admin-users/[[...path]]/route.ts`** : nouveau handler
  same-origin same que TCK-132 / TCK-145, qui forward vers
  `/api/users[/...]` avec le bearer pris du cookie httpOnly. Optional
  catch-all : couvre l'index (`GET /api/admin-users`), les actions
  (`POST /api/admin-users/{id}/block`, `…/activate`) et le role
  endpoint (`PUT /api/admin-users/{id}/role`).
- **Pas de proxy SSR** : le scope agence est résolu côté backend par
  `ResolveActiveProfile` (TCK-141). On reste donc en CSR + React Query
  comme `/super-admin/properties` ; la cache key `['admin-users',
  'list', params]` est invalidée à chaque mutation.
- **Sparse fields** : `fields[users]=id,first_name,last_name,email,
  phone,status,last_login_at,created_at`. **Ne pas** y inclure
  `full_name` (accessor Eloquent, pas une colonne — Spatie répond
  `InvalidFieldQuery` 400) ; on dérive l'affichage côté UI.
- **`include=roles`** : la relation Spatie `roles` est exposée par
  TCK-147 via `User::$requestLoadable`. La table affiche le premier
  rôle de la collection ; le drawer édite le rôle effectif via
  `PUT /api/users/{user}/role`.
- **Pas de filtre `agency_id`** côté front : envoyer `filter[agency_id]`
  serait redondant (le scope est imposé par le backend) **et**
  inattaquable depuis l'UI (l'agence est implicite). Le test query
  vérifie qu'aucune URL n'inclut `agency_id`.
- **Pas de filtre `type`** : la colonne a été supprimée TCK-142. Le
  test pin l'absence (`expect(url).not.toContain('filter%5Btype%5D')`).
- **Auto-block guard** : `isSelf = row.id === currentUserId` désactive
  les actions block dans la dropdown ET dans le drawer (le backend
  redouble la garde via `cannot_block_self`).
- **Drawer** : `Sheet` (base-ui dialog) côté droit, contient la fiche
  + l'éditeur de rôle + le toggle bloquer/activer. Pas de navigation
  hors page (per spec).
- **`/admin/team` reste distinct** (TCK-065) : `/admin/team` gère la
  composition (ajout/retrait d'`AgentProfile`), `/admin/users`
  expose la **vue lecture-action** sur les comptes liés à l'agence.
  Aucun ajout/retrait ici — surface couverte par TCK-065.
- **`Customer` users non listés** : TCK-147 scope la liste aux users
  avec un `AgentProfile` ou `OwnerProfile`. Les locataires liés
  uniquement via la relation `Customer` (CRM) ne remontent pas. À
  filer si l'usage le justifie.
- **Sidebar** : entrée "Utilisateurs" déjà câblée par TCK-131 dans
  `AdminSidebar.tsx` (rien à ajouter).
- **Tests** : 6 tests sur `admin-users.test.ts` (sparse fields, pas de
  agency_id, pas de type, defaults, block/activate URLs, role PUT body
  + 403/422 paths) et 4 tests sur `AdminUsersFilters.test.tsx` (selects
  rendus, pas de filtre agence, role/status updates, page reset,
  search-on-submit). 10 / 10 verts. 9 échecs vitesse `RecentlyViewed
  Carousel` + `PropertyVisitDialog` confirmés présents sur `dev` tip
  (issue `@testing-library/user-event` namespaceURI), non régressés.
- **Vérification UI navigateur non effectuée** : type-check + tests
  + lint passent ; un walk-through manuel reste à faire en review
  avec un agency_admin et un user de test bloqué/réactivé.
