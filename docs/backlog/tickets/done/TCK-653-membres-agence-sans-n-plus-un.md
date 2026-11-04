---
id: TCK-653
title: "Liste des membres d'agence : plus de requêtes par ligne"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-15
updated: 2026-10-15
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#112-agence--équipe
  models:
    - docs/models-spec.md#1-user
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-2--performances-des-requêtes
tags: [back, performance, agency, n-plus-un, pistes]
---

## Objectif utilisateur

Un administrateur d'agence ouvre une liste ou un sélecteur de membres (journal d'audit, boîte des
demandes de contact, délégations) sans que l'API exécute une dizaine de requêtes par membre.

## Contrat de données

Aucun endpoint neuf, aucune clé de réponse changée. `GET /api/agencies/{agency}/members`
(`AgencyController::listMembers`) rend les mêmes lignes ; seul le nombre de requêtes change.

Réf : **P02.01** du fichier de pistes (classement A2 : performance sans changement de résultat).

## Contraintes strictes (métier)

- La sortie de `UserResource` est inchangée : `roles` (dont les rôles dérivés `customer` et
  `tenant`, TCK-492), `agency_id` (profils actifs seulement, TCK-587), `avatar_url`.
- Un profil plateforme révoqué ne donne pas `super_admin` ; un bail compte pour `tenant`
  seulement s'il est `active` ou `terminating`.
- Le chemin Scout de `filter[search]` (TCK-281) n'est pas touché : le préchargement se fait
  après la pagination.

## Delta à produire

- [x] `AgencyController::listMembers` : précharge, sur les lignes de la page, `ownerProfiles`,
      `agentProfiles`, `agencyAdminProfiles`, `serviceProviderProfile`, `platformProfile`,
      `tenantLeases` (restreints aux baux en cours) et `media`.
- [x] `HasProfiles::profileTypes()` et `hasActiveTenantLease()` relisent les relations préchargées,
      comme `profiles()` et `activePlatformLevel()` le faisaient déjà ; constante
      `ACTIVE_TENANT_LEASE_STATUSES` partagée par la requête et le préchargement.
- [x] `tests/Feature/Api/AgencyMembersQueryCountTest.php` : nombre de requêtes indépendant du
      nombre de membres, et sortie de chaque sorte de membre épinglée.

## Critères d'acceptation

- [x] AC1 — l'appel émet le même nombre de requêtes pour 7 et pour 19 membres.
- [x] AC2 — pour six sortes de membres (agent, agent et bailleur, super-admin, profil plateforme
      révoqué, bailleur locataire d'un bail actif, agent prestataire), `roles`, `agency_id` et
      `avatar_url` sont ceux d'avant le correctif.

## Hors périmètre

- Le plafond de `per_page` sur cette route (piste P02.02, ticket à part).
- Retirer `roles` ou `agency_id` de la sortie pour les autres membres (choix de produit, V7).
- Les autres appelants de `UserResource` (`/api/auth/me`, ouvreurs de session) : une seule ligne.

## Notes d'implémentation

- Mesuré avant correctif : 85 requêtes pour 7 lignes, 217 pour 19 (11 par ligne). Après : 19 et 19.
- Ablation 1, préchargement retiré du contrôleur : AC1 rouge (85 contre 217). Ablation 2,
  préchargement gardé mais `profileTypes()` et `hasActiveTenantLease()` ramenés à leurs
  `exists()` : AC1 rouge (54 contre 114). Les deux moitiés sont donc nécessaires. AC2 vert dans
  les trois états : il garde la sortie, pas le coût.
- Hypothèse (mode sans humain) : `exists()` sur une relation et la relation chargée appliquent les
  mêmes portées (`SoftDeletes`, y compris celle de `customers` dans le `hasManyThrough`). La
  sortie identique d'AC2 sur les six sortes de membres l'établit pour ces cas.
