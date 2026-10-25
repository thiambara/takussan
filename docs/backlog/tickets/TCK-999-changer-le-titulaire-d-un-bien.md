---
id: TCK-999
title: "« Changer le titulaire » : un bien saisi au nom du personnel passe à un bailleur de l'agence, avec ses baux en brouillon (Q5 de TCK-997)"
status: done
phase: P1
family: applicatif
estimate: M
wave: null
created: 2026-10-19
updated: 2026-10-25
depends_on: [TCK-997]
blocks: [TCK-1000]
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
  models:
    - docs/models-spec.md#3-property
    - docs/models-spec.md#14-lease-
tags: [back, front, properties, leases, owners, porteur, pistes]
---

## Objectif utilisateur

Que l'admin d'agence rende à son bailleur un bien que le personnel a saisi à son propre nom avant
TCK-997, pour que le bailleur le voie et en reçoive les loyers à venir.

## Contrat de données

Décision du porteur du 2026-10-19 (Q5 a de TCK-997) et
[ADR-0036](../../adr/0036-l-agent-responsable-est-le-collaborateur-principal.md), amendement du
2026-10-19, voie 3 et « ce que le transfert entraîne ».

- `GET /api/properties/{property}/owner-transfer?owner_id=` : aperçu, sans écriture — les baux qui
  passent (`draft` de l'ancien titulaire) et ceux qui restent (au-delà de `draft`).
- `PUT /api/properties/{property}/owner` (`owner_id`) : le transfert.
- Service `App\Services\Property\PropertyOwnerTransfer::transfer(Property, User $owner, User $actor, string $voie)`,
  réutilisé par TCK-1000 (voie `invitation_accepted`).
- Notification `property.assigned_to_owner` (TCK-997).

## Validation du porteur (2026-10-25)

Recopiée mot pour mot du statut de P15.06 :

- P15.06 : validation du porteur (2026-10-25) : décisions 1a à 6a du porteur (2026-10-19), consignées dans TCK-997, TCK-999 et TCK-1000, V1 et V7 accordés ; les biens déjà saisis ne changent pas de titulaire en silence au déploiement

Ce qu'en tient ce ticket : « changer le titulaire » est un geste explicite de l'admin d'agence, avec
aperçu et confirmation ; aucune migration ne réécrit `user_id` ; la migration
`pending_owner_profile_id` ajoute une colonne nullable, sans la remplir.

## Direction UX / Artistique

Sur la fiche d'un bien tenu par le personnel, pour l'admin d'agence : « Changer le titulaire »,
choix d'un bailleur actif, puis une confirmation qui dit en clair ce qui suit le bien et ce qui
reste (« 2 baux en brouillon passeront à Awa Diop ; le bail signé de M. Ndiaye reste au nom de
l'agence »). Rien pour un bien qui a déjà un bailleur pour titulaire.

## Contraintes strictes (métier)

- **Voie 3 d'ADR-0036 amendé** : du personnel vers un bailleur `active` de l'agence du bien, jamais
  depuis un bailleur, jamais vers le personnel (la passation s'en charge).
- **Admin de l'agence du bien seul** (`PropertyPolicy::transferOwner`, profil `AgencyAdminProfile`
  actif ; le super-admin par `Gate::before`, comme partout) : le geste décide à qui vont des loyers.
- **Une transaction**, ligne du bien verrouillée (`lockForUpdate`, piège PostgreSQL n° 2) : `user_id`,
  baux `draft` de l'ancien titulaire (`landlord_id`), journal.
- Baux au-delà de `draft`, reversements émis, paiements de ces baux : **inchangés**.
- Journal `activity('Property')` / `owner_transferred` (ancien et nouveau titulaire, voie, baux
  passés, baux gardés), journal du modèle coupé (ADR-0059 § 4) : `properties:repair-reassigned-owners`
  ne doit pas défaire le transfert.
- Un lot n'est pas entraîné par son parent : chaque bien se transfère seul (le rattachement exige le
  même titulaire, TCK-997).

## Delta à produire

- [x] `PropertyPolicy::transferOwner`.
- [x] `TransferPropertyOwnerRequest` (`owner_id`, même règle que `owner_id` de TCK-997 ;
  `property.owner_transfer_forbidden` quand le titulaire actuel est un bailleur).
- [x] `PropertyOwnerTransfer` (aperçu et transfert), `PropertyOwnerController` (deux routes dans
  `routes/api/properties.php`).
- [x] Écran : le geste et sa confirmation sur la fiche du bien ; libellés `fr`, `en`, `wo` = français.
- [x] Tests : `PropertyOwnerTransferTest`, `RepairReassignedOwnersIgnoresTransferTest`, test Vitest
  de la confirmation.

## Critères d'acceptation

Chaque test est rouge sans son correctif (ablation consignée dans les notes).

- [x] AC1 — Bien tenu par l'agent A, un bail `draft` et un bail `active` (landlord A), un loyer payé
  et reversé à A sur le bail actif. L'admin transfère à B → 200 ; `user_id` = B, le bail `draft` a
  `landlord_id` = B, le bail `active` garde A, le reversement émis est identique octet pour octet ;
  B lit le bien et le brouillon, pas le bail actif ; B a la notification `property.assigned_to_owner`.
- [x] AC2 — L'aperçu rend exactement ces deux listes (un brouillon qui passe, un bail qui reste) et
  n'écrit rien (`user_id`, baux et `activity_log` inchangés).
- [x] AC3 — Refus 403 pour l'agent A lui-même, pour un agent tenant `properties.update_any` et pour
  B ; refus 422 vers un bailleur `draft`, `inactive` ou d'une autre agence, vers un membre du
  personnel, et pour un bien dont le titulaire est déjà un bailleur. Dans tous les cas, rien n'est
  écrit.
- [x] AC4 — Après le transfert, `php artisan properties:repair-reassigned-owners` laisse
  `user_id` = B et le brouillon à B ; `--dry-run` ne liste pas ce bien.
- [x] AC5 — Le journal porte une ligne `owner_transferred` (voie `manual`, A, B, identifiants des
  baux passés et gardés) et aucune ligne `Property` / `updated` sur `user_id`.

## Hors périmètre

- Le transfert à l'acceptation d'une invitation (TCK-1000), qui réutilise le service.
- La reprise par le bailleur d'un bail déjà signé (ADR-0036, amendement : reste ouvert).
- Un transfert en masse.

## Notes d'implémentation

Implémenté le 2026-10-25 par l'implémenteur (lot L12b), branche `feat/tck-999-1000-titulaire-et-bailleur-invite`
(depuis TCK-997, PR #1535). Commits : `70f07876f` (API), `bd2b1a6e9` (écran).

**Où vit la règle.** `App\Services\Property\PropertyOwnerTransfer` : `refus()` (le code, sans rien
lever ni écrire — TCK-1000 s'en sert pour laisser un bien à l'agence sans faire échouer une
acceptation), `apercu()` et `transfer()`. La cible suit `TitulaireALaSaisie::bailleurActif()`, la
règle de `owner_id` de TCK-997, désormais publique ; l'avis est `TitulaireALaSaisie::prevenir()`,
extrait d'`annoncer()`. Le refus est rejugé sous le verrou de la ligne du bien.

**Choix faits, à relire.**

- **Un lot sous le bien d'un AUTRE bailleur ne lui est pas transféré** (422
  `property.parent_owner_mismatch`) : le ticket ne le dit pas, mais ADR-0036 (Q4) veut qu'un lot
  rattaché sous le bien d'un bailleur ait ce titulaire, et le geste aurait été la seule voie pour
  défaire l'invariant. Un lot dont le parent est tenu par le personnel se transfère seul.
- **Le seul titulaire refusé est un bailleur de l'agence** (`TitulaireALaSaisie::tenuParUnBailleur`) :
  un bien tenu par un agent parti (aucun profil) se transfère aussi, c'est un des cas que le geste
  sert. Une agence `individual` n'a pas de bailleur actif : la cible y est refusée en 422.
- **Le compte visé absent rend 422 `property.owner_not_in_agency`**, comme un compte qui n'est pas
  bailleur : pas d'oracle d'existence.
- **« Ce qui reste », c'est tout bail du bien qui ne passe pas** : les baux au-delà de `draft`, et un
  brouillon dont le bailleur n'est pas l'ancien titulaire. Les baux supprimés (soft delete) ne sont
  ni montrés ni réécrits.
- **Le geste n'exige pas la 2FA** : `ProtectedActions` ne le liste pas, le ticket ne le demande pas.
  Il décide à qui vont des loyers à venir ; l'ajouter est une décision du porteur.
- **La fiche lit `abilities.transfer_owner`** (`properties.show`, appelant connu), qui combine la
  policy et « le personnel tient le bien » : l'écran ne refait aucune des deux règles.
- L'écran reprend la liste des bailleurs actifs du choix de TCK-997 (`useBailleursActifs`, exportée) :
  mêmes limites (pas de recherche, un bailleur sans compte n'est pas proposé).

**Ablations** (chaque fois rouge, puis rétabli vert) :

- API — A1 journal du modèle non coupé : AC5 et AC4 (`RepairReassignedOwnersIgnoresTransferTest`)
  rouges ; A2 brouillons non passés : AC1 et AC4 ; A3 policy = `update` (agent, `update_any`) : 2
  cas d'AC3 ; A4 transfert depuis un bailleur admis : AC3 « déjà tenu par un bailleur » ; A5 cible non
  jugée : 5 cas d'AC3 ; A6 sans avis : AC1 ; A7 aperçu qui écrit : AC2 ; A8 sans contrôle du parent :
  le test du lot ; A9 tous les baux passent : AC1, AC2, AC5 ; `abilities.transfer_owner` sans le
  contrôle du titulaire bailleur : le test de la fiche.
- Écran — F1 sans la liste des baux qui restent ; F2 confirmation ouverte sans aperçu ; F3 geste
  vers une autre cible ; F4 aperçu lu avant le choix : un rouge chacun ; F5 page sans la garde
  `abilities.transfer_owner` : 2 rouges.

**Vérifications.** `PropertyOwnerTransferTest` (15) et `RepairReassignedOwnersIgnoresTransferTest`
(1) verts ; 11 classes voisines vertes (157 tests : désignation, lot, copie, réparation, CRUD et
autorisation des biens, chargements du `show`, contrat du front, autorisation avant validation,
sparse fieldsets, `ProtectedActionsCoverageTest`). Front : 2 fichiers neufs (7 tests) et 3 voisins
verts, `tsc --noEmit`, ESLint des fichiers touchés, `check:i18n`, `check:i18n-namespaces`,
`check:classes-emises` propres. Gardes du dépôt vertes. Non vérifié au navigateur (jsdom seulement).

- *Fait le 2026-10-25* : retirer de `docs/models-spec.md` §3 la marque « à venir » de « changer le titulaire » (ligne `user_id`), et mettre à jour la phrase « Aujourd'hui » (passe `/sync-specs` 015, MD7).
