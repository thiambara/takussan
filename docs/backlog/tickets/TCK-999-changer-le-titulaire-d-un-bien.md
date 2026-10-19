---
id: TCK-999
title: "« Changer le titulaire » : un bien saisi au nom du personnel passe à un bailleur de l'agence, avec ses baux en brouillon (Q5 de TCK-997)"
status: todo
phase: P1
family: applicatif
estimate: M
wave: null
created: 2026-10-19
updated: 2026-10-19
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

- [ ] `PropertyPolicy::transferOwner`.
- [ ] `TransferPropertyOwnerRequest` (`owner_id`, même règle que `owner_id` de TCK-997 ;
  `property.owner_transfer_forbidden` quand le titulaire actuel est un bailleur).
- [ ] `PropertyOwnerTransfer` (aperçu et transfert), `PropertyOwnerController` (deux routes dans
  `routes/api/properties.php`).
- [ ] Écran : le geste et sa confirmation sur la fiche du bien ; libellés `fr`, `en`, `wo` = français.
- [ ] Tests : `PropertyOwnerTransferTest`, `RepairReassignedOwnersIgnoresTransferTest`, test Vitest
  de la confirmation.

## Critères d'acceptation

Chaque test est rouge sans son correctif (ablation consignée dans les notes).

- [ ] AC1 — Bien tenu par l'agent A, un bail `draft` et un bail `active` (landlord A), un loyer payé
  et reversé à A sur le bail actif. L'admin transfère à B → 200 ; `user_id` = B, le bail `draft` a
  `landlord_id` = B, le bail `active` garde A, le reversement émis est identique octet pour octet ;
  B lit le bien et le brouillon, pas le bail actif ; B a la notification `property.assigned_to_owner`.
- [ ] AC2 — L'aperçu rend exactement ces deux listes (un brouillon qui passe, un bail qui reste) et
  n'écrit rien (`user_id`, baux et `activity_log` inchangés).
- [ ] AC3 — Refus 403 pour l'agent A lui-même, pour un agent tenant `properties.update_any` et pour
  B ; refus 422 vers un bailleur `draft`, `inactive` ou d'une autre agence, vers un membre du
  personnel, et pour un bien dont le titulaire est déjà un bailleur. Dans tous les cas, rien n'est
  écrit.
- [ ] AC4 — Après le transfert, `php artisan properties:repair-reassigned-owners` laisse
  `user_id` = B et le brouillon à B ; `--dry-run` ne liste pas ce bien.
- [ ] AC5 — Le journal porte une ligne `owner_transferred` (voie `manual`, A, B, identifiants des
  baux passés et gardés) et aucune ligne `Property` / `updated` sur `user_id`.

## Hors périmètre

- Le transfert à l'acceptation d'une invitation (TCK-1000), qui réutilise le service.
- La reprise par le bailleur d'un bail déjà signé (ADR-0036, amendement : reste ouvert).
- Un transfert en masse.

## Notes d'implémentation

_(à remplir par implementing-specs)_
