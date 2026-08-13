---
id: TCK-277
title: Fusion pages admin Équipe & Utilisateurs
status: done
phase: P2
family: front
estimate: M
wave: 33
created: 2026-05-17
updated: 2026-05-17
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#112-agence--équipe
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#1-user
    - docs/models-spec.md#35-agentprofile-
    - docs/models-spec.md#48-invitation-
tags: [front, admin, ux, refactor]
---

## Objectif utilisateur

L'`agency_admin` veut un **seul écran** dans la console de son agence pour voir, inviter et gérer tous les comptes rattachés (agents, autres admins, propriétaires invités) — sans devoir naviguer entre deux pages aux périmètres flous.

## Contrat de données

Aucun nouvel endpoint. La page fusionnée consomme uniquement les API déjà livrées :

- `GET /api/agencies/{id}/members` — liste des membres scope agence (TCK-065)
- `GET /api/admin-users` — colonne statut + dernier login (TCK-133 / TCK-147)
- `POST /api/agencies/{id}/agents/invite` — invitation `agent` / `agency_admin` (TCK-258)
- `POST /api/admin-users/{id}/block` · `/activate` — cycle de vie compte (TCK-147)
- `PUT /api/users/{id}/role` — changement de rôle (TCK-014 / TCK-147)
- `DELETE /api/agencies/{id}/members/{userId}` — retrait de l'agence (TCK-065)

L'arbitrage sur l'éventuelle consolidation de `/members` et `/admin-users` côté backend est laissé à `implementing-specs` ; le ticket interdit la création de tout nouvel endpoint.

Modèles concernés : voir `spec_refs.models` (User, AgentProfile, Invitation).

## Direction UX / Artistique

- Une seule entrée **« Équipe »** dans la sidebar admin (URL canonique `/admin/team`).
- Onglets segmentés en haut de page : `Tous` · `Agents` · `Admins` · `Propriétaires`.
- Filtres conservés (recherche libre + statut), placés sous les onglets.
- Bouton d'action principale **« Inviter »** unique, ouvrant une modal qui demande email + sélection du rôle (rôles offerts limités à ceux que l'acteur a le droit d'attribuer).
- Tonalité visuelle alignée DS Lin existant et itération « Portrait/confiance » (cf. TCK-276).
- Drawer de détail réutilisable depuis n'importe quel onglet.

## Contraintes strictes (métier)

- Page réservée aux agences `kind=standard`. Les hosts `individual` doivent être redirigés vers `/app` (réutiliser `ensureStandardAgencyOrRedirect`).
- Le backend re-checke toutes les permissions ; aucune action critique ne doit reposer uniquement sur le gate UI.
- La modal d'invitation ne doit proposer que les rôles que l'acteur peut effectivement attribuer (règle « dernier admin », typologie d'agence, etc.).
- Bookmarks `/admin/users` existants doivent continuer à fonctionner : redirection permanente (308) vers `/admin/team`.
- `AgencyActivityFeed` continue de pointer vers `/admin/team` (URL canonique inchangée).
- Aucun nouvel endpoint backend, aucune migration de données.

## Delta à produire

- [ ] Page unifiée `/admin/team` : tabs (Tous / Agents / Admins / Propriétaires) + table + filtres + drawer détail.
- [ ] Modal d'invitation unique avec sélecteur de rôle ; le frontend route vers l'endpoint backend correspondant au rôle choisi.
- [ ] `/admin/users` → redirection 308 vers `/admin/team` (préserve bookmarks).
- [ ] Sidebar admin : retirer l'entrée doublon, garder uniquement « Équipe ».
- [ ] `pro-features.ts` : garder uniquement `/admin/team` dans la liste gated.
- [ ] Absorber/déprécier proprement les composants devenus inutiles (`AdminUsersClient`, `TeamManagement`, `AdminUsersTable`, `AdminUsersFilters`, `UserDetailDrawer` selon le besoin réel).
- [ ] Conserver le hotfix `agency_id` retiré de `AGENCY_MEMBER_FIELDS`.
- [ ] Mettre à jour les tests impactés (`AdminSidebar`, page `admin/team`, page `admin/users` redirect, `AgencyActivityFeed`).

## Critères d'acceptation

- [ ] AC1 — La sidebar admin n'expose qu'une seule entrée « Équipe » pointant vers `/admin/team`.
- [ ] AC2 — La page liste agents, admins et propriétaires en onglets, avec filtres rôle/statut/recherche fonctionnels.
- [ ] AC3 — Le bouton « Inviter » ouvre une modal unique qui exige un rôle ; l'invitation appelle l'endpoint backend correct selon le rôle choisi.
- [ ] AC4 — Bloquer, activer, changer de rôle et retirer un membre fonctionnent depuis cette page sans navigation supplémentaire.
- [ ] AC5 — `GET /admin/users` répond 308 avec `Location: /admin/team`.
- [ ] AC6 — `AgencyActivityFeed` continue de naviguer vers `/admin/team` sans 404 ni redirection.
- [ ] AC7 — Un `agency_admin` d'agence `individual` est redirigé vers `/app` en accédant à `/admin/team`.
- [ ] AC8 — Aucun nouvel endpoint backend n'a été ajouté ; `git diff takussan-api/` ne montre que des éventuels ajustements de tests.

## Hors périmètre

- Refonte / consolidation des endpoints backend (`/agencies/{id}/members` vs `/admin-users`) — décisions techniques laissées à `implementing-specs`.
- Refonte du wizard d'invitation d'agent (TCK-258).
- Migration de données ou changement de modèle.
- Console super-admin `/super-admin/users` (reste séparée).
- Rôles personnalisés (TCK-135 / éditeur de rôles).

## Notes d'implémentation

- **Source de vérité unique** : `fetchAdminUsers` (`/api/admin-users`) — plus riche que `/api/agencies/{id}/members` (apporte `status`, `last_login_at`, `include=roles`). `removeAgencyMember` (`/api/agencies/{id}/members/{userId}`) reste appelé séparément pour le retrait, faute d'endpoint équivalent côté `admin-users`.
- **Tabs ↔ filter[role]** : les onglets segmentés écrivent dans le même `filter[role]` URL param que le select. Le select rôle de `AdminUsersFilters` est masqué via la nouvelle prop `hideRoleFilter` pour éviter deux contrôles concurrents.
- **`ConfirmRemoveDialog`** rendu générique (`<T extends MinimalMember>`) parce que la console manipule désormais `AdminAgencyUserRow` au lieu de `User`. Les usages externes (aucun aujourd'hui) ne sont pas impactés grâce à la contrainte minimale.
- **Redirect 308** : `permanentRedirect()` de Next 16 émet bien un 308 (vs `redirect()` → 307).
- **Files supprimés** : `TeamManagement.tsx`, `AdminUsersClient.tsx`, et leur test (`TeamManagement.test.tsx`). Le test `AdminUsersFilters.test.tsx` reste vert (la prop par défaut préserve l'ancien comportement).
- **Bug pré-existant TCK-147 corrigé** : `UserAdminController::index` scope agency-admin ne matchait que `agentProfiles` + `ownerProfiles`, masquant les users ayant uniquement un `AgencyAdminProfile` (typiquement le fondateur d'agence via host wizard / onboarding super-admin). L'onglet « Administrateurs » apparaissait vide. Ajout de `agencyAdminProfiles` à l'OR du scope + ajout du helper `User::isAgencyAdminAt(int $agencyId)` réutilisé par `ensureTargetInActorScope` (block/activate). Régression couverte par `UserAdminAgencyScopeTest::test_agency_admin_listing_includes_users_with_only_agency_admin_profile`. Le test pré-existant ne détectait pas le bug parce que le shim TCK-142 de `UserFactory` crée automatiquement un `OwnerProfile` quand `agency_id` est passé en attributs.
