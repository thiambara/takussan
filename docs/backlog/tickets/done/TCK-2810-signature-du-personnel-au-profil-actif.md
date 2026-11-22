---
id: TCK-2810
title: "Signer pour le bailleur se juge sur le profil actif, comme lire le bail : le personnel de deux agences ne signe plus un bail de A depuis son profil B"
status: done
phase: P2
family: back
estimate: S
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#19-état-des-lieux--inventaires"
    - "docs/features.md#22-rôles--permissions"
  models:
    - "docs/models-spec.md#82-leasesignature-"
    - "docs/models-spec.md#24-inventory-"
tags: [back, baux, signature, etat-des-lieux, multi-espaces, profil-actif, suite-de-tck-2803]
---

## Objectif utilisateur

Le membre du personnel de deux agences ne signe un bail, ou un état des lieux, pour le bailleur que depuis l'espace
de l'agence du bail. C'est l'espace d'où il le lit.

## Contrat de données

**Origine.** Exception nommée par TCK-2803 (notes, « Une divergence restante ») et par l'amendement d'ADR-0042
(« Ce qui n'est pas décidé ») : ticket d'alignement à part, décision du porteur du lot du 2026-11-14.

**Constat, relu sur HEAD (`765093279`) le 2026-11-14.**

- La lecture juge le personnel sur le PROFIL ACTIF : `LeasePolicy::view` → `BasePolicy::isStaffOf` →
  `User::staffAgencyId()`, l'agence du profil actif si l'utilisateur y est personnel (ADR-0031 §3).
- La signature pour le bailleur le juge sur TOUTE agence où il est personnel :
  `LandlordSignatory::isMandatedStaff` → `MembershipCapabilityResolver::isStaffAt($user, $lease->agency_id)` et
  `canActAt(LeasesSign, $agency)`.
- **Mesuré par TCK-2803** (`BailLocataireDeLaListeEtDesGestesTest::test_ac1_chaque_porte_de_geste_est_incluse_dans_view`) :
  la seule divergence de la confrontation est `POST signature (bailleur)` pour « personnel de deux agences » ;
  `/signature/otp` lui rend 202, `GET /api/leases/{id}` 403. Le test l'asserte telle quelle.
- **Portes qui partagent `LandlordSignatory::allows`, relues :**
  - le code et la signature du bail (`LeasePolicy::sign`, `LeaseSignatureService::assertSigner`) : divergent ;
  - `LeaseSignatureService::rolesFor` et `can_sign_as` de `LeaseResource` : divergent (rendus seulement à un lecteur
    de `view`, donc invisibles à ce profil, mais même prédicat) ;
  - la signature d'état des lieux (`InventoryController::sign` → `InventorySignatureService::canSignAs`) : divergente,
    et c'est sa SEULE garde, sans `view` en amont ;
  - la voie papier (`ActivateLeaseRequest` : `LeasePolicy::update` ET `allows`) : **déjà alignée**, `update` juge le
    personnel par `isStaffOf`, donc par le profil actif. Elle n'est pas à changer ; elle entre dans les tests.

**Pas une fuite** : il est du personnel de l'agence du bail, tient `leases.sign` et lit le bail en basculant de
profil. La réponse de la signature ne porte plus le locataire (TCK-2803).

## Contraintes strictes (métier)

- **Le personnel mandaté se juge comme dans `view`** : personnel de l'agence du bail AU SENS DU PROFIL ACTIF
  (`staffAgencyId() === $lease->agency_id`), et `leases.sign` dans cette agence. La délégation de rôle en vigueur
  continue de compter (elle est dans `isStaffAt`, que `staffAgencyId` lit).
- La voie du bailleur (`BailleurDuBien::est`, TCK-2803) ne change pas : un bailleur signe pour lui-même quel que soit
  son profil actif.
- `onBehalfOf` et tout ce qui s'enregistre (preuves, `on_behalf_of`, `owner_signed_by`) ne changent pas pour le
  personnel dont le profil actif est l'agence du bail.
- ADR-0042 est amendé AVANT le code : la section « Ce qui n'est pas décidé » devient une décision.

## Delta à produire

- [x] Amendement d'ADR-0042 (et renvoi depuis ADR-0031 §3 si le paragraphe y cite la signature). — § *Amendement du 2026-11-14 (bis)*, écrit avant le code ; ADR-0031 §3 ne cite pas la signature : pas de renvoi.
- [x] `LandlordSignatory::isMandatedStaff` : le personnel jugé par `staffAgencyId()`, plus par `isStaffAt`. Docblock
  de la classe réécrit (« prédicat TCK-587 `isStaffAt` » n'y vaut plus).
- [x] `BailLocataireDeLaListeEtDesGestesTest::test_ac1_chaque_porte_de_geste_est_incluse_dans_view` : l'exception
  nommée disparaît.
- [x] Tests `SignatureAuProfilActifTest` (`tests/Feature/Lease/`, 7 tests).

## Critères d'acceptation

- [x] AC1 — Dans `test_ac1_chaque_porte_de_geste_est_incluse_dans_view`, l'assertion devient
  `$this->assertSame([], $fuites)` : aucune porte n'admet un profil que `view` refuse. Le commentaire de l'exception
  est retiré. — Preuve : vert ; sous ablation, rouge avec les deux portes nommées pour « personnel de deux agences ».
- [x] AC2 — La signature d'état des lieux entre dans la même confrontation : pour les treize profils du test de
  TCK-2803, `canSignAs(…, 'landlord')` n'admet personne que `InventoryPolicy::view` refuse. — Preuve : dans
  la même boucle, un état des lieux par bail confronté, conducteur hors des treize profils ; sous ablation, la ligne
  `POST inventories/{id}/sign (bailleur) admet « personnel de deux agences »` apparaît.
- [x] AC3 — Personnel de A et de B, profil actif B : `POST /api/leases/{id}/signature/otp` (rôle `landlord`) et
  `POST /api/inventories/{id}/sign` (rôle `landlord`) rendent 403 sur un bail de A. Le même compte, profil actif A :
  202 puis 200, et la preuve porte `on_behalf_of` = le bailleur, comme avant. — Preuve :
  `SignatureAuProfilActifTest::test_ac3_*` (trois tests, chaque 403 doublé du 403 de `GET /api/leases/{id}` sous le
  même profil) ; plus « sans profil résolu » et « personnel de A au profil de bailleur dans B » (décision 2 de
  l'amendement), chacun avec son témoin.
- [x] AC4 — `test_l_agent_createur_en_poste_mene_la_signature_jusqu_au_meme_etat_final` (TCK-2803) reste vert sans
  changement de son instantané. — Preuve : vert, fichier de test inchangé hors du bloc AC1.
- [x] AC5 — La voie papier : le même compte, profil actif B, reçoit 403 de `POST …/activate` avant ET après (témoin de
  l'alignement préexistant). — Preuve : `test_ac5_la_voie_papier_suit_deja_le_profil_actif`, vert avant (sous
  ablation) et après ; profil A : 200, bail actif.
- [x] AC6 — Ablation : `isStaffAt` remis dans `isMandatedStaff` rend AC1, AC2 et AC3 rouges. — Preuve (2026-11-14) : 5 rouges (AC1+AC2 dans le
  même test, quatre tests de refus de `SignatureAuProfilActifTest`), AC4 et AC5 verts ; fichier restauré, md5
  `06e4162520db9824e1bb0baa97537618` vérifié.

## Hors périmètre

- Une bascule automatique de profil depuis l'écran de signature.
- Les autres usages d'`isStaffAt` (jugement d'un TIERS, affectations) : ils sont voulus (docblock du résolveur).

## Notes d'implémentation

- Le prédicat : `$user->staffAgencyId() === (int) $agency->id`, puis `canActAt(LeasesSign, $agency)` inchangé.
  `staffAgencyId` lit `isStaffAt` restreint à l'agence du profil actif : la délégation en vigueur compte toujours.
- Les jugements de `SignatureAuProfilActifTest` passent tous par HTTP (`X-Profile-Id`, en-têtes vidés à chaque
  appel) : `staffAgencyId()` lit le profil actif de la requête, un appel direct après une requête de test verrait
  celui de la dernière.
- Docblock de `LeasePolicy::sign` complété (« au sens du profil actif ») ; index `docs/adr/README.md` : la ligne
  d'ADR-0042 cite l'amendement.
