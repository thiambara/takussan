---
id: TCK-2757
title: "Le bailleur candidat chez sa propre agence ne lit ni ne modifie sa fiche client : l'auteur d'une fiche n'en est jamais le sujet"
status: todo
phase: P0
family: back
estimate: S
wave: 90
created: 2026-11-12
updated: 2026-11-12
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md"
tags: [back, crm, privacy, policy, bailleur, audit-ux]
---

## Objectif utilisateur

Le bailleur d'une agence qui candidate, réserve ou demande une visite sur un AUTRE bien de la même agence
reste un client comme un autre : il ne lit pas ce que l'équipe écrit de lui, et ne modifie pas sa fiche.

## Contrat de données

Relevé du 2026-11-12 (contre-vérification de TCK-2589 lots C/C2, test jetable, copie hors dépôt
`$S/impl/verif/c2589x/`) :

- `CustomerService::findOrCreateFromUser` crée la fiche avec `added_by_id` = le candidat (depuis b484d606f).
- `CustomerPolicy::isAuthorStillMember` accepte l'auteur tant qu'il est membre de l'agence ; un `OwnerProfile`
  actif compte comme appartenance (TCK-591).
- `Customer::scopeVisibleTo` (branche des fiches ajoutées par soi, `$ownAdds`) rend la fiche dans la liste.

Connecté en bailleur candidat : `GET /api/customers/{id}` 200 (champ interne `notes` lu) ; `GET …/notes` 200, la
note du personnel est lue ; journal 200 (notes, étapes ; contacts masqués) ; activité 200 ; la fiche figure dans
`GET /api/customers`. Écritures : note épinglée 201, `PATCH` 200, `pipeline-stage` → `qualified` 200, contact 204.
Refusés : lecture sensible 403, pièce non servie, suppression 403. Un client sans profil dans l'agence reçoit 403
partout (il n'est pas membre). Démo : 0 fiche où `added_by_id = user_id` ; aucune production.

## Contraintes strictes (métier)

- Règle de la spec § 1.6 : le CRM de l'agence n'est lu et alimenté que par son personnel ; un bailleur ne voit que
  les fiches qu'il a lui-même ajoutées. La fiche née d'une candidature est une fiche **de l'agence du bien**
  (TCK-2350) : son sujet n'en est pas l'auteur au sens de cette règle.
- **L'auteur d'une fiche n'en est jamais le sujet** : `added_by_id = user_id` n'ouvre aucun droit d'auteur.
- La liste et la fiche disent la même chose : une fiche refusée en `show` n'apparaît pas dans `index`.
- Les lignes déjà écrites sont couvertes (la règle vit dans la policy et le scope, pas seulement à la création).
- Aucun changement pour le personnel de l'agence ni pour le bailleur auteur d'une fiche dont il n'est pas le sujet.

## Delta à produire

- [ ] Policy : `CustomerPolicy::isAuthorStillMember()` exige en plus `(int) $customer->user_id !== (int) $user->id`
  (fiche sans `user_id` : inchangée).
- [ ] Scope : `Customer::scopeVisibleTo()`, branche `$ownAdds`, exclut les fiches dont `user_id` = l'appelant
  (`whereNull('user_id')->orWhere('user_id', '!=', …)` groupé).
- [ ] Tests : `tests/Feature/Crm/CustomerAuthorIsNotSubjectTest.php` — bailleur candidat chez sa propre agence :
  `show`, `notes`, journal, activité, `PATCH`, note, étape, contact → 403 ; absent de `index` ; bailleur auteur
  d'une AUTRE fiche : inchangé (200) ; personnel : inchangé.

## Critères d'acceptation

- [ ] AC1 — Bailleur dont la fiche client a été créée par sa candidature dans sa propre agence : les huit routes du
  relevé (lecture et écriture) rendent 403.
- [ ] AC2 — Cette fiche n'apparaît pas dans `GET /api/customers` pour lui ; `meta.total` ne la compte pas.
- [ ] AC3 — Un bailleur qui a ajouté la fiche d'un TIERS la lit et la modifie comme avant (même périmètre que
  TCK-591 / TCK-2754 : sans les gestes de l'agence).
- [ ] AC4 — Ablations : retirer la condition de la policy rougit AC1 ; retirer celle du scope rougit AC2.
- [ ] AC5 — Aucune régression : `CustomerTimeline`, `CustomerTest`, `CustomerNoteTest`, `SensitiveRead`, tests de
  visibilité du CRM restent verts.

## Hors périmètre

- Ne plus poser `added_by_id` = le candidat dans `findOrCreateFromUser` (l'auteur d'une fiche née d'un geste public) :
  la policy couvre les lignes existantes ; changer l'auteur se décide à part si besoin.
- La vue du bailleur sur sa propre candidature (côté client) : inchangée.

## Notes d'implémentation

- 2026-11-12 — policy et scope corrigés (`CustomerPolicy::isAuthorStillMember()`, `Customer::scopeVisibleTo()` branche
  `$ownAdds`) ; `tests/Feature/Crm/CustomerAuthorIsNotSubjectTest.php` (5 tests) rouge avant le correctif (3 rouges),
  vert après. Ablations : condition de la policy retirée → 2 rouges (routes, fiche née de `findOrCreateFromUser`) ;
  condition du scope retirée → 1 rouge (liste). Non-régression : les 74 classes qui citent `CustomerPolicy`,
  `visibleTo(` ou `/api/customers` — 608 verts.
- Cas relevé en écrivant le test : `findOrCreateFromUser` sans bien pose `agency_id` = l'agence du profil actif, et une
  fiche sans agence passait `isAuthorStillMember` sans condition d'appartenance ; la condition « pas le sujet » la ferme
  aussi.
