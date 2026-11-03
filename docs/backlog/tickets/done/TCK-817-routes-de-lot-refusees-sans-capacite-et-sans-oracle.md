---
id: TCK-817
title: "Les trois routes de traitement en lot exigent la capacité de l'action unitaire et ne disent plus quels biens ni quels comptes existent"
status: done
phase: P1
family: bug
estimate: M
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: [TCK-818]
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
    - "docs/features.md#22-rôles--permissions"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-22--formrequests-sans-autorisation-propre-et-règles-dautorisation-dans-les-services"
tags: [back, api, autorisation, biens, pistes]
---

## Contexte

Réf : **P22.02** du fichier de pistes, `validé` par le porteur.

`POST /api/properties/bulk-archive`, `bulk-visibility` et `bulk-assign` acceptent tout compte
connecté (`authorize()` rend `$this->user() !== null`, et `PropertyPolicy::bulkArchive()` rend
`$user !== null`). Le refus se juge bien par bien, et le bilan sépare `forbidden` (le bien existe)
de `not_found` (il n'existe pas) ; `exists:properties,id` et `exists:users,id` rendent un 422 sur
un identifiant absent. Un compte auto-inscrit énumère ainsi les identifiants de biens et de comptes.

**Décision du porteur** (recopiée mot pour mot) :

> authorize() exige la capacité de l'action unitaire à l'agence active ; le bilan confond forbidden et not_found ; user_id jugé dans le service, parmi les membres de l'agence

**Hypothèses notées (mode sans humain)** :

- **La capacité de l'action unitaire** : `properties.publish` pour `bulk-visibility` (la ligne est
  jugée par `publish`), `properties.update_own` ou `properties.update_any` pour `bulk-archive` et
  `bulk-assign` (la ligne est jugée par `update`, qui tient l'une ou l'autre selon l'auteur). La
  règle vit dans `PropertyPolicy` (`bulkUpdate`, `bulkPublish`), sur le modèle de `create()` ;
  `authorize()` l'invoque.
- **Le bilan confond les deux motifs là où ils renseignent** : un bien que l'appelant ne peut pas
  lire (`view`) sort en `not_found`, comme un identifiant absent. Un bien qu'il lit déjà, de sa
  propre agence, garde `forbidden` : il n'apprend rien qu'il ne sache, et le front distingue les
  deux libellés.
- **« Parmi les membres de l'agence »** : un profil, de tout statut, dans l'agence active
  (bailleur, agent, admin d'agence). Une cible absente et une cible hors de l'agence rendent la
  même réponse, 422 `user.not_in_active_agency`. La règle de cible ligne à ligne (personnel actif,
  `ResponsibleAgentAssigner::cibleAdmise`) reste ce qu'elle est : un bailleur ou un agent suspendu
  de l'agence sort toujours en `invalid_target`. Le super-admin, qui lit déjà tous les comptes,
  désigne tout compte existant, comme aujourd'hui ; la règle de ligne juge ensuite.
- **Un compte sans agence active perd les routes de lot**, même sur ses propres biens sans agence.
  C'est l'effet direct de la décision ; aucun compte sans agence ne crée plus de bien
  (`PropertyPolicy::create`), et l'action unitaire lui reste.

## Objectif utilisateur

Rien ne change pour le personnel d'une agence. Un compte sans capacité est refusé en tête ; un
bien d'une autre agence ou un compte hors de l'agence ne se distinguent plus d'un identifiant
absent.

## Delta à produire

- `PropertyPolicy` : `bulkUpdate()` et `bulkPublish()` à l'agence active ; `bulkArchive()`
  retiré (tautologie, cf. P22.04).
- `authorize()` des trois FormRequests : délégation à ces abilities ; le contrôleur n'appelle plus
  `bulkArchive`.
- Règles : `property_ids.*` sans `exists:`, `user_id` sans `exists:`.
- Services : `not_found` pour un bien absent ou illisible ; la cible de `bulk-assign` résolue
  parmi les membres de l'agence active.
- Tests : `PropertyBulkRoutesGateTest` ; les tests existants qui actaient l'ancien comportement
  sont réécrits.

## Critères d'acceptation

- [x] AC1 — Un compte sans agence reçoit 403 sur les trois routes, corps valide ou vide, sans
      `errors`.
- [x] AC2 — Un agent reçoit `not_found` pour un bien d'une autre agence comme pour un identifiant
      absent, sur les trois routes, et 200 sur `bulk-archive`.
- [x] AC3 — `bulk-assign` vers un compte absent et vers un compte d'une autre agence rend la même
      réponse, 422 `user.not_in_active_agency`, sans `errors`.
- [x] AC4 — Les tests existants des trois routes restent verts, réécrits là où ils actaient
      l'ancien comportement.

## Hors périmètre

- Les autres oracles de P03.06.
- Le passage des trois FormRequests à `BaseFormRequest`.

## Notes d'implémentation

- **Reproduction** : avant correctif, `PropertyBulkRoutesGateTest` rendait 7 rouges : un compte
  sans agence recevait 200 (`bulk-visibility`, `bulk-assign`) ou 422 (`bulk-archive`, sur
  `property_ids.0`) ; un agent lisait `forbidden` pour le bien d'une autre agence et `not_found`
  pour un absent ; `user_id` absent rendait `errors.user_id`.
- **Ablation** : tout le correctif retiré de `app/` → 7 rouges ; les deux services d'archivage et de
  visibilité seuls remis à l'ancien → 2 rouges (le motif). Correctif remis → 7 verts.
- **Tests réécrits** parce qu'ils actaient l'ancien comportement : `PropertyBulkArchiveTest` (l'acteur
  était un compte sans agence, et un bien tiers sortait en `forbidden`), `PropertyBulkVisibilityTest`
  (bien tiers en `forbidden` ; un bailleur recevait 200 et un bilan, il reçoit 403),
  `PropertyBulkAssignTest` (bien tiers en `forbidden`, cible absente en `errors.user_id`, et la règle
  de cible sur un bien sans agence, atteinte désormais par un super-admin).
- **Piège** : le super-admin des tests (`actingAsRole('super_admin')`) porte une agence. Le juger
  « parmi les membres de son agence » refusait une cible qu'il désignait avant ; il en est exempté.
- `bulkVisibility` et `bulkAssign` n'appelaient aucune policy ; `bulkArchive()` est retiré de
  `PropertyPolicy` (cf. P22.04).
