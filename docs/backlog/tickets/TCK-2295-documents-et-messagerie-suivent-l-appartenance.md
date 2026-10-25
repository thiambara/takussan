---
id: TCK-2295
title: "Les documents suivent la règle d'auteur, et une fiche client supprimée ne relie plus personne dans la messagerie"
status: done
phase: P1
family: bug
estimate: M
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#22-rôles--permissions"
    - "docs/features.md#17-communication--messagerie"
  adr:
    - "docs/adr/0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md#amendement-du-2026-10-25--laccès-suit-lappartenance"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-218--ce-que-le-retrait-éteint-et-que-la-suspension-laisse--délégations-de-rôle-et-colonnes-dauteur"
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-223--agrégats-en-sql-brut-sur-des-tables-à-softdeletes-sans-deleted_at-is-null"
tags: [api, authorization, documents, messaging, crm, pistes]
---

## Contexte

Réfs : **P218.06, P223.02** du fichier de pistes, `validé` par le porteur le 2026-10-25. Décisions D3
et D4 de l'amendement du 2026-10-25 d'ADR-0031 (« l'accès suit l'appartenance »).

- **D3 (P218.06)** : `DocumentPolicy` était sortie de la règle d'auteur (B.7) faute de mesure. Le
  téléverseur (`uploaded_by` : `view`, `update`, `share`, la liste de `DocumentController::index`) et
  les trois branches d'auteur de `reaches` (`created_by_id` d'une réservation, `added_by_id` d'une
  fiche client, `conducted_by` d'un état des lieux) gardaient leurs documents sans condition
  d'appartenance.
- **D4 (P223.02)** : les trois jointures `customers` de la règle 2 de `MessagingReach` (le lien CRM)
  ne filtraient pas `deleted_at`. Après `DELETE /api/customers/{id}`, l'agent et le client se
  joignaient encore, et `POST /api/conversations` ouvrait un fil entre eux (201).

## Décision du porteur

- **P218.06** :
  > validé — validation du porteur (2026-10-25) : la règle d'auteur d'ADR-0031 s'applique à `DocumentPolicy` (`uploaded_by` et les trois branches d'auteur de `reaches`, liste comprise), avec la branche client de réservation et l'exception de l'état des lieux, après un relevé par sonde de chaque lecteur légitime
- **P223.02** :
  > validé — validation du porteur (2026-10-25) : `whereNull(deleted_at)` sur les trois jointures `customers` de `MessagingReach`, écrit dans le docblock et dans `docs/features.md`

## Relevé par sonde (P218.06, avant tout code)

Sonde temporaire `tests/Feature/TmpSonde/SondeDocumentsP21806Test.php` (retirée), sur l'arbre
`75e8596e4` + D2. Documents d'un bien d'agence, d'une réservation, d'une fiche et d'un état des lieux.
Pour chaque cas, `GET /api/documents/{id}`, `can('update')`, `can('share')` et présence dans
`GET /api/documents`.

| Lecteur | Avant | Après |
|---|---|---|
| Agent actif : son téléversement, et ce qu'il a saisi | 200, gestes, listé | inchangé |
| Agent suspendu ou retiré : `uploaded_by` | 200, update et share oui, listé | 403, aucun geste, non listé |
| Agent suspendu ou retiré : documents de l'admin sur sa réservation, sa fiche, son état des lieux | 200 | 403 |
| Agent suspendu ou retiré : pièce de son propre profil | 200, gestes, listé | inchangé |
| Client du tunnel : document de l'agence sur sa réservation, et sa pièce | 200 ; sa pièce gestes et listée | inchangé (par la branche client) |
| Locataire : pièce jointe à son bail | 200, gestes, listée | inchangé |
| Client : pièce jointe à sa fiche | 200, gestes, listée | inchangé |
| Bailleur bloqué : pièce de son bien, de son bail, de son profil ; document de l'état des lieux qu'il a conduit | 200, aucun geste, listé | inchangé |
| Utilisateur : document sur lui-même | 200, gestes, listé | inchangé |

Le seul écart parmi les témoins est un document d'un locataire sur un état des lieux, posé par la
fabrique. Il est passé de 200 à 403. `POST /api/documents` ne le permet pas : `reaches` n'a pas de
branche locataire pour un état des lieux. Les autres créateurs de `Document` sont `ProfilePieces`
(le profil de l'appelant), `AgencyUpgradeRequestService` (les statuts, par le déposant) et
`DocumentPdfService::store`, qui n'a aucun appelant (`grep`).

## Delta à produire

- [x] `DocumentPolicy::televerseurGarde` : la branche `uploaded_by` de `view`, `update` et `share`.
- [x] `DocumentPolicy::reaches` : `created_by_id` et `added_by_id` par `auteurEncoreMembre`, avec la
      branche client de réservation ; `conducted_by` selon l'exception de l'état des lieux.
- [x] `DocumentPolicy::restreindreAuTeleverseur`, lu par `DocumentController::index`.
- [x] `MembershipCapabilityResolver::isMemberAt` lit l'amorce `owner` (budget de la liste).
- [x] `MessagingReach` : `whereNull('…deleted_at')` sur les trois jointures `customers`, et le
      docblock ; `docs/features.md` § 1.7.
- [x] `tests/Feature/Documents/AuteurDuDocumentEncoreMembreTest.php`,
      `tests/Feature/Messaging/FicheClientSupprimeeLienCrmTest.php`.

## Critères d'acceptation

- [x] AC1 (P218.06) — Agent suspendu, puis retiré : sur le document qu'il a téléversé, `view`,
      `update`, `share` et `delete` refusés, `GET` 403, absent de `GET /api/documents` ; sur les
      documents d'une réservation, d'une fiche et d'un état des lieux qu'il a saisis, `view` et
      `attachTo` refusés, `GET` 403.
- [x] AC2 (P218.06) — Les témoins de la sonde gardent leur accès : agent actif, client du tunnel
      (lecture, pièce jointe, `attachTo`), locataire et client sur leur pièce (gestes compris),
      bailleur bloqué (lecture, liste, sans geste), agent suspendu sur les pièces de son profil,
      document sans agence.
- [x] AC3 (P223.02) — Fiche d'agence supprimée par `DELETE /api/customers/{id}` : le rattachement
      reste, mais ni l'agent ni le client ne se joignent plus (branches b et c), et
      `POST /api/conversations` rend 422. Fiche sans agence supprimée : les deux comptes rattachés ne
      se joignent plus (branche a).
- [x] AC4 (P223.02) — Témoins : une fiche vivante relie toujours, et un fil ouvert avant la
      suppression garde ses correspondants (règle 1).

## Hypothèses

- **Pièces de son propre profil** : un document porté par un profil que l'appelant détient
  (`Document::PROFILE_TYPES`, `user_id` = lui) reste au téléverseur. C'est une donnée sur lui-même,
  comme un document porté par son `User`. La règle seule la retirait à l'agent suspendu (sonde). On
  prend l'option qui ne retire rien à un appelant légitime.
- **Écriture** : `landlordWrites` est gardé (le bailleur bloqué n'écrit pas). La branche ne vaut en
  écriture que pour un membre, ou si `reaches` atteint le porteur en écriture. Sans ce second cas,
  le locataire et le client perdaient la modification et le partage de leur propre pièce (sonde).
- **Branche client de réservation** : elle vaut en lecture et pour joindre une pièce. Le client du
  tunnel joignait des pièces par `created_by_id`, et il le fait désormais par sa branche de client.
- **Agence d'un état des lieux** : `inventories` n'a pas de colonne `agency_id`, donc la règle lit
  celle du bien. `agencyOf()` reste nul pour un état des lieux dans `landlordWrites` et `share`. Le
  changer modifierait les gestes du bailleur bloqué, hors de la décision.
- **Bien, bail, fiche ou réservation supprimé** : `documentable` est nul, et le document est jugé
  sans agence, comme avant pour `agencyOf`. La liste fait de même.

## Hors périmètre

- `GET /api/search/documents` (`DocumentSearchService`) filtre Meilisearch par `uploaded_by` seul.
  L'agence du porteur n'est pas indexée, et l'identifiant n'est pas filtrable : appliquer la règle
  demande de changer l'index.
- `DashboardTenantService` (noms des documents récents) et l'archive RGPD (`DataExportBuilder`,
  angle 247) lisent `uploaded_by` sans la règle.

## Notes d'implémentation

- Ablation, morceau par morceau (`AuteurDuDocumentEncoreMembreTest` et `DocumentAbilitiesTest`) :
  - `view`, `update`, `share`, la liste, `created_by_id`, `added_by_id` et `conducted_by`, chacun
    remis : 2 rouges (suspendu, retiré). La liste remise fait aussi rougir le témoin sans agence.
  - La branche client retirée : 1 rouge, le témoin du tunnel.
  - `estSonProfil` retiré : 1 rouge, le témoin de la pièce de profil.
  - Le secours en écriture retiré : 3 rouges (tunnel, locataire, client).
  - Le propriétaire de tout statut retiré de la liste : 1 rouge, le témoin du bailleur bloqué.
  - L'amorce `owner` retirée : 1 rouge, le budget de requêtes (57 contre 27).
  - Le propriétaire de tout statut retiré de `view` seul reste vert : la branche du bailleur de
    `reaches` le couvre déjà.
  - Correctif remis : 12 verts.
- `whereDoesntHaveMorph` écarte aussi tout document d'un type hors de sa liste. La liste passe donc
  par `whereNot(whereHasMorph(…))`. Le premier essai retirait les documents sur soi-même et les
  pièces d'un prestataire (`ImpersonationProfilePiecesTest` rouge).
- `MigratedAuthorizationRulesTest::test_document_update_is_narrower_than_view` : le téléverseur
  était un compte sans aucun lien avec l'agence du bien. Il porte désormais un profil propriétaire
  de l'agence, comme les autres cas du fichier.
- D4, ablation jointure par jointure : chacune remise → 1 rouge sur sa branche (a, b, c) ; remise → 3 verts.
