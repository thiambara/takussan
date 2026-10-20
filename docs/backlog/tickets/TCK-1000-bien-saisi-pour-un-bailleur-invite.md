---
id: TCK-1000
title: "Un bien saisi pour un bailleur invité passe à ce bailleur quand il accepte l'invitation, et l'invitation part du formulaire de bien (Q2 de TCK-997)"
status: todo
phase: P1
family: applicatif
estimate: M
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: [TCK-997, TCK-999]
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
    - docs/features.md#112-agence--équipe
  models:
    - docs/models-spec.md#3-property
    - docs/models-spec.md#34-ownerprofile-
tags: [back, front, properties, owners, invitations, porteur, pistes]
---

## Objectif utilisateur

Que l'agent qui saisit le bien d'un bailleur pas encore inscrit l'invite depuis le formulaire, et
que le bien rejoigne ce bailleur dès qu'il a accepté, sans geste de plus.

## Contrat de données

Décision du porteur du 2026-10-19 (Q2 a de TCK-997) et
[ADR-0036](../../adr/0036-l-agent-responsable-est-le-collaborateur-principal.md), amendement du
2026-10-19, voie 2.

- Colonne `properties.pending_owner_profile_id` (`models-spec.md` § 3).
- `POST /api/properties` : champ `pending_owner_profile_id`, un `OwnerProfile` `draft` de l'agence
  du bien dont l'invitation est `sent`.
- `POST /api/agencies/{agency}/owners/invite` (TCK-256), inchangé ; son `invitable_id` donne le
  profil à lier.
- `InvitationService::finalizeAccept` (acceptation), `revoke`, et le passage à `expired`.
- `PropertyOwnerTransfer` (TCK-999), voie `invitation_accepted`.

## Direction UX / Artistique

Dans le choix du bailleur du formulaire de bien (TCK-997) : « Inviter un nouveau bailleur »
(`InviteOwnerSheet`, comme l'annonce l'en-tête de `PropertyForm.tsx`). Une fois l'invitation partie,
le formulaire dit que le bien reste à l'agence jusqu'à l'acceptation, et la fiche du bien porte
« En attente de <nom> » tant que l'invitation court.

## Contraintes strictes (métier)

- **Voie 2 d'ADR-0036 amendé** : le bien est créé au nom de son auteur (`user_id`), lié au profil
  invité ; il passe au bailleur dans la transaction qui active le profil, et seulement si son
  titulaire est encore du personnel de l'agence (jamais depuis un bailleur).
- Invitation révoquée ou expirée : le lien est effacé, le bien reste à l'agence, rien d'autre ne
  change.
- Le transfert suit « ce que le transfert entraîne » (baux `draft` passés, baux au-delà gardés,
  reversements intacts, journal `owner_transferred` voie `invitation_accepted`, notification) par
  le service de TCK-999, sans le recopier.
- Un profil d'une autre agence, `active`, ou sans invitation `sent` → 422.
- Migration additive, `down()` qui retire la colonne et sa contrainte.

## Delta à produire

- [ ] Migration `add_pending_owner_profile_id_to_properties` (FK `owner_profiles`, nullable,
  `nullOnDelete`, index).
- [ ] `StorePropertyRequest` : `pending_owner_profile_id`, exclusif d'`owner_id` (422 si les deux).
- [ ] Acceptation : transfert des biens liés au profil, dans `finalizeAccept` ; révocation et
  expiration : lien effacé.
- [ ] `PropertyResource` : le bailleur en attente (nom) pour le personnel seulement.
- [ ] Écran : l'invitation depuis le choix du bailleur, et la mention « en attente ».
- [ ] Tests : `PropertyPendingOwnerTest`, test Vitest de l'invitation depuis le formulaire.

## Critères d'acceptation

Chaque test est rouge sans son correctif (ablation consignée dans les notes).

- [ ] AC1 — L'agent invite C, crée un bien lié au profil de C → 201, `user_id` = l'agent,
  `pending_owner_profile_id` = le profil ; C accepte l'invitation → `user_id` = le compte de C, le
  lien effacé, un bail `draft` du bien a `landlord_id` = C, C a la notification
  `property.assigned_to_owner` et lit le bien.
- [ ] AC2 — Invitation révoquée, puis expirée (deux cas) → le lien est effacé et `user_id` reste
  l'agent ; une acceptation tentée ensuite ne transfère rien.
- [ ] AC3 — `pending_owner_profile_id` = un profil d'une autre agence, un profil `active`, ou un
  profil dont l'invitation est révoquée → 422, aucun bien créé ; `owner_id` et
  `pending_owner_profile_id` ensemble → 422.
- [ ] AC4 — Un bien lié dont le titulaire est passé à un repreneur par la passation passe quand
  même à C à l'acceptation ; un bien lié dont le titulaire est devenu un bailleur (TCK-999) ne
  change pas.
- [ ] AC5 — `migrate:rollback` du pas de la migration rend la table sans la colonne (job
  `migrations-pgsql`).

## Hors périmètre

- Le geste manuel (TCK-999).
- Une relance de l'invitation depuis la fiche du bien.

## Notes d'implémentation

_(à remplir par implementing-specs)_

- À la fusion : retirer de `docs/models-spec.md` §3 la marque « à venir » de la colonne `pending_owner_profile_id` (« ➕ (à venir) ») et de l'invitation en attente (ligne `user_id`), et mettre à jour la phrase « Aujourd'hui » (passe `/sync-specs` 015, MD7).
