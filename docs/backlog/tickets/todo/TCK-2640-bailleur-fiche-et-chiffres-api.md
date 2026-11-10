---
id: TCK-2640
title: "Le bailleur vu par l'agence côté API : une fiche, les chiffres du mandat dans la liste, le plafond de travaux enfin réglable"
status: todo
phase: P1
family: back
estimate: M
wave: 88
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2649]
blocks: [TCK-2641]
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#18-maintenance--interventions"
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#34-ownerprofile-"
    - "docs/models-spec.md#28-payout-"
    - "docs/models-spec.md#catalogue-capability-tck-278--tck-279"
tags: [back, owners, payouts, maintenance, audit-ux, app]
---

## Objectif utilisateur

Quand un bailleur appelle (« où en est mon argent ? »), l'admin d'agence ouvre sa fiche et y trouve son numéro, ses biens et leur état, ce qui reste à lui verser, et le plafond de travaux qu'il a accordé.

## Contrat de données

**Relevé sur `dev` le 2026-11-10** :

- `GET /api/owners` (`OwnerProfileController@index`, policy `viewAny`) rend le profil, les identifiants masqués et `pending_invitation_id`.
- `include=user` projette `phone` (`IncludedUserResource.php:31`), mais le front n'affiche que `metadata.phone` (`OwnersList.tsx:202`).
- Il n'y a ni nombre de biens, ni montant.
- **Il n'y a pas d'endpoint de fiche** : pas de `GET /api/owners/{id}`.
- `works_approval_threshold` est une colonne de `owner_profiles`. Il n'est **ni lisible** (absent de `$queryFields`) **ni modifiable** (aucune requête ne le porte). Seul `OwnerApprovalThreshold` le lit.
- Le taux de commission n'est pas sur le profil. Il se résout ainsi : le reversement, sinon `lease.commission_rate`, sinon `agency.commission_rate` (`PayoutCalculator.php:359-376`).

**À servir** (consommé par TCK-2641) :

- **`GET /api/owners/{ownerProfile}`**, la fiche, qui rend :
  - identité : type particulier / société, raison sociale, personne de contact, e-mail ;
  - téléphone : `user.phone`, sinon `metadata.phone` ;
  - date d'entrée dans l'agence, statut, invitation en cours ;
  - `properties_count`, `occupied_properties_count` ;
  - les chiffres du mois du relevé (TCK-2649) : encaissé, commission, déjà versé, `remaining_to_pay`, pour `period` (le mois courant par défaut) ;
  - `last_payout` : date et montant ;
  - `works_approval_threshold` ;
  - `agency_commission_rate`, le taux par défaut de l'agence. Le taux d'un bail peut différer : la fiche le dit.
- **`GET /api/owners`** gagne :
  - `filter[search]` sur le nom, le téléphone et l'e-mail ;
  - `filter[has_remaining]=1` ;
  - les champs `properties_count`, `occupied_properties_count`, `remaining_to_pay` du mois courant et `last_payout_at` ;
  - les tris `name` et `-remaining_to_pay`.
- **`PATCH /api/owners/{ownerProfile}`** porte `works_approval_threshold`.
- Les identifiants sensibles restent derrière `GET /api/owners/{id}/sensitive`, inchangé et journalisé.

## Contraintes strictes (métier)

- **Accès à la fiche** : la même policy que la liste (`viewAny` puis `view` sur le profil), donc l'admin de l'agence du profil. Un admin d'une autre agence reçoit 404. Une agence `individual` n'a pas de carnet de bailleurs (features §1.12) : 403, comme la liste.
- **Écriture du plafond** :
  - nouvelle capacité `owners.update` (cas de l'enum `Capability`), accordée au profil `AgencyAdminProfile` seul par `MembershipCapabilityResolver` ;
  - écriture journalisée (activité `owner_works_threshold_updated` : avant, après, auteur) ;
  - valeur : décimal ≥ 0 en XOF, ou `null`, qui veut dire « aucun accord exigé » (la sémantique actuelle d'`OwnerApprovalThreshold::of()`) ;
  - effet **pour les devis soumis après** le changement. Un devis déjà `awaiting_owner` ne change pas d'état.
- **Les montants ne sont pas recalculés ici** : ils viennent de `OwnerStatementService`, enrichi par TCK-2649. La fiche et `GET /api/owner-statements` rendent le même chiffre pour la même période.
- **Comptes** : un bien compte au bailleur quand il en est le titulaire dans cette agence. « Occupé » suit la définition de TCK-2637 (bail courant).
- **Liste** : sans N+1. Une page de 30 bailleurs se lit en un nombre constant de requêtes.

## Delta à produire

- [ ] Route `GET /api/owners/{ownerProfile}` → `OwnerProfileController@show`, et ressource de fiche `OwnerProfileDetailResource`.
- [ ] Route `PATCH /api/owners/{ownerProfile}` → `OwnerProfileController@update`, avec la FormRequest `UpdateOwnerProfileRequest` (`works_approval_threshold` : `nullable|numeric|min:0`).
- [ ] Capacité `owners.update`, policy `OwnerProfilePolicy::update`, journal d'activité.
- [ ] `works_approval_threshold` ajouté à `$queryFields` (lecture par sparse fieldset).
- [ ] Liste : recherche, `has_remaining`, comptes, `remaining_to_pay`, `last_payout_at`, tris.
- [ ] Tests :
  - `OwnerProfileShowTest` : admin de l'agence 200, autre agence 404, agent 403, agence individuelle 403 ;
  - `OwnerProfileListFiguresTest` : comptes et reste à verser égaux au relevé ;
  - `OwnerWorksThresholdUpdateTest` : écriture, journal, `null` ; un devis au-dessus du nouveau plafond passe `awaiting_owner`, un devis antérieur ne bouge pas ;
  - `OwnerPhoneFallbackTest`.

## Critères d'acceptation

- [ ] AC1 — Pour owner1 de la démo (`user.phone` posé, `metadata.phone` vide), la liste et la fiche rendent le numéro du compte.
- [ ] AC2 — `remaining_to_pay` de la fiche égale `totals.remaining_to_pay` de `GET /api/owner-statements?period=…&landlord_id=…`, pour trois périodes de la démo.
- [ ] AC3 — `PATCH {works_approval_threshold: 150000}` par l'admin rend 200 et la valeur est relue sur la fiche. Le même appel par un agent rend 403.
- [ ] AC4 — Après le passage du plafond à 150 000 F, un devis de 200 000 F soumis met la demande en `awaiting_owner`, et un devis de 100 000 F ne l'y met pas.
- [ ] AC5 — `GET /api/owners?filter[search]=sene` trouve « Mouhamed SÈNE » : repli de casse et d'accents par `App\Support\CaseInsensitive`, cf. `takussan-api/CLAUDE.md`.
- [ ] AC6 — Le nombre de requêtes SQL de la liste est le même pour 5 et pour 30 bailleurs.

## Hors périmètre

- L'écran (TCK-2641).
- La création d'un reversement, qui reste `POST /api/payouts` avec ses paiements cités. Un reversement « au montant libre » n'existe pas et n'est pas introduit.
- L'accès de l'agent à la fiche : à trancher, la maquette le cite en persona.
- Les moyens de versement du bailleur.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
