---
id: TCK-1000
title: "Un bien saisi pour un bailleur invité passe à ce bailleur quand il accepte l'invitation, et l'invitation part du formulaire de bien (Q2 de TCK-997)"
status: done
phase: P1
family: applicatif
estimate: M
wave: null
created: 2026-10-19
updated: 2026-10-25
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

## Validation du porteur (2026-10-25)

Recopiée mot pour mot du statut de P15.06 :

- P15.06 : validation du porteur (2026-10-25) : décisions 1a à 6a du porteur (2026-10-19), consignées dans TCK-997, TCK-999 et TCK-1000, V1 et V7 accordés ; les biens déjà saisis ne changent pas de titulaire en silence au déploiement

Ce qu'en tient ce ticket : « changer le titulaire » est un geste explicite de l'admin d'agence, avec
aperçu et confirmation ; aucune migration ne réécrit `user_id` ; la migration
`pending_owner_profile_id` ajoute une colonne nullable, sans la remplir.

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

- [x] Migration `add_pending_owner_profile_id_to_properties` (FK `owner_profiles`, nullable,
  `nullOnDelete`, index).
- [x] `StorePropertyRequest` : `pending_owner_profile_id`, exclusif d'`owner_id` (422 si les deux).
- [x] Acceptation : transfert des biens liés au profil, dans `finalizeAccept` ; révocation et
  expiration : lien effacé.
- [x] `PropertyResource` : le bailleur en attente (nom) pour le personnel seulement.
- [x] Écran : l'invitation depuis le choix du bailleur, et la mention « en attente ».
- [x] Tests : `PropertyPendingOwnerTest`, test Vitest de l'invitation depuis le formulaire.

## Critères d'acceptation

Chaque test est rouge sans son correctif (ablation consignée dans les notes).

- [x] AC1 — L'agent invite C, crée un bien lié au profil de C → 201, `user_id` = l'agent,
  `pending_owner_profile_id` = le profil ; C accepte l'invitation → `user_id` = le compte de C, le
  lien effacé, un bail `draft` du bien a `landlord_id` = C, C a la notification
  `property.assigned_to_owner` et lit le bien.
- [x] AC2 — Invitation révoquée, puis expirée (deux cas) → le lien est effacé et `user_id` reste
  l'agent ; une acceptation tentée ensuite ne transfère rien.
- [x] AC3 — `pending_owner_profile_id` = un profil d'une autre agence, un profil `active`, ou un
  profil dont l'invitation est révoquée → 422, aucun bien créé ; `owner_id` et
  `pending_owner_profile_id` ensemble → 422.
- [x] AC4 — Un bien lié dont le titulaire est passé à un repreneur par la passation passe quand
  même à C à l'acceptation ; un bien lié dont le titulaire est devenu un bailleur (TCK-999) ne
  change pas.
- [x] AC5 — `migrate:rollback` du pas de la migration rend la table sans la colonne (job
  `migrations-pgsql`).

## Hors périmètre

- Le geste manuel (TCK-999).
- Une relance de l'invitation depuis la fiche du bien.

## Notes d'implémentation

- Fait (2026-10-25) : `docs/models-spec.md` §3 — la marque « à venir » de `pending_owner_profile_id` et de l'invitation en attente (ligne `user_id`) est retirée, la phrase « Aujourd'hui » nomme les trois voies (passe `/sync-specs` 015, MD7).

**Ce qui est livré.**

- Migration `2026_10_25_120000_add_pending_owner_profile_id_to_properties` : FK `owner_profiles`
  nullable `nullOnDelete` (`properties_pending_owner_profile_fk`), index
  (`properties_pending_owner_profile_idx`), **sans reprise de données** (validation du porteur du
  2026-10-25) ; `down()` retire contrainte, index et colonne. Le job `migrations-pgsql` la rejoue
  (elle trie après sa borne).
- `StorePropertyRequest` : `pending_owner_profile_id` (`prohibits:owner_id`). Jugé par
  `TitulaireALaSaisie::bailleurEnAttente()` : mêmes refus qu'`owner_id` pour la proposition,
  l'agence `individual` et le bien sans agence (`property.owner_designation_forbidden`) ; un
  `OwnerProfile` `draft`, sans compte, de l'agence du bien, avec une invitation `pending()` (`sent`
  ET non échue), sinon `property.pending_owner_not_invited` (code neuf, fr/en/wo) ; un lot sous le
  bien d'un bailleur → `property.parent_owner_mismatch`. `user_id` reste l'auteur.
- Acceptation : `InvitationService::finalizeAccept`, juste après le passage du profil à `active`
  avec son compte, appelle `PropertyOwnerTransfer::aLAcceptation()` : les biens liés perdent le
  lien, et chacun passe par `transfer(…, VOIE_INVITATION)` (TCK-999, non recopié) s'il est de
  l'agence du profil et que `refus()` est nul. Un bien refusé (titulaire devenu bailleur) reste à
  l'agence sans faire échouer l'acceptation.
- Révocation (`revoke`, donc aussi `revokeOpenForAgency`) et expiration (`expire`, la commande
  `invitations:expire`) : `TitulaireALaSaisie::delier()`, sous le verrou de l'invitation.
- `PropertyResource` : `pending_owner {profile_id, name}` sur la fiche, au personnel actif de
  l'agence du bien et au super-admin seulement.
- Front : « Inviter un nouveau bailleur » dans `ChoixDuBailleur` (feuille `InviteOwnerSheet`
  partagée), offert par `new/page.tsx` à l'admin ou à `team.invite` (la règle de `/app/owners`), et
  seulement là où le choix du bailleur l'est ; note « le bien reste à l'agence jusqu'à ce que <nom>
  accepte », « Ne pas lier ce bien à cette invitation » ; `avecBailleur()` envoie
  `pending_owner_profile_id` sans `owner_id`. La fiche porte « En attente de <nom> ». L'en-tête de
  `PropertyForm.tsx` (formulaire d'édition) ne porte plus le TODO de TCK-256.

**Choix pris faute de décision, les plus conservateurs.**

- Le lien effacé ne se journalise pas sur le bien (requête directe, sans `updated_at`) : la ligne
  `invitation_revoked` / `invitation_expired` de l'invitation en dit la raison, et rien d'autre du
  bien ne change (contrainte « rien d'autre ne change »).
- L'effacement d'un compte (`AccountDeletionService`, TCK-1060) révoque par requête les invitations
  qui le visent, sans passer par `revoke()` : il efface aussi le lien. Hors de la liste du ticket,
  ajouté pour qu'aucune révocation ne laisse un « En attente de » sans invitation derrière.
- Une invitation `sent` échue mais pas encore balayée par la commande est refusée à la création
  (`pending()` et non le seul statut) : elle ne s'accepte déjà plus (410).
- Une relance (`resend`) d'une invitation expirée ne rétablit pas le lien : la relance depuis la
  fiche est hors périmètre, et le lien perdu se repose à la main en recréant le choix.
- Le nom affiché dans le formulaire vient de la saisie de la feuille : `onInvited` reçoit un second
  argument (la saisie), l'invitation rendue par l'API ne portant pas de nom.
- L'acteur journalisé du transfert à l'acceptation est le bailleur qui accepte (`causedBy`).

**Vérifications.**

- API : `PropertyPendingOwnerTest` (10 tests), et les classes voisines `InvitationAcceptTest`,
  `AcceptationNActiveQueLeBrouillonTest`, `ExpirationFaceAuGesteConcurrentTest`,
  `InvitationLifecycleTest`, `InviteOwnerTest`, `AccountDeletionExecuteTest`,
  `PropertyOwnerDesignationTest`, `PropertyChildOwnerTest`, `PropertyOwnerTransferTest`,
  `PropertyDuplicationOwnerTest` : 108 tests verts (charge 3,5 / 4,3 / 4,0, 8 cœurs). Pint propre.
- Front : `ChoixDuBailleur.invitation.tck-1000.test.tsx` (7), `bailleur-en-attente.tck-1000.test.tsx`
  (2), `InviteOwnerSheet.saisie.tck-1000.test.tsx` (1), `page.choix-du-bailleur.tck-997.test.tsx`
  (+4) ; `src/components/property-form/__tests__/` entier, la fiche, `owners/__tests__` : verts.
  `tsc --noEmit`, ESLint des fichiers touchés, `check:i18n`, `check:i18n-namespaces`,
  `check:classes-emises` : verts. Non vérifié au navigateur.

**Ablations** (chaque correctif retiré, test rouge constaté, correctif remis) :

| | correctif retiré | rouge |
|---|---|---|
| B1 | pas de transfert à l'acceptation | AC1, AC4 |
| B2 | `revoke` ne délie pas | AC2 révoquée |
| B3 | `expire` ne délie pas | AC2 expirée |
| B4 | profil non jugé à la création | AC3 profil, AC3 échue/lot |
| B5 | pas de `prohibits:owner_id` | AC3 ensemble |
| B6 | `pending_owner` lu par tous | AC1 fiche |
| B7 | tout bien lié passe, sans `refus()` | AC4 |
| B8 | l'acceptation ne délie pas | AC1, AC4 |
| B9 | l'effacement du compte ne délie pas | AC2 effacement |
| B10 | pas de garde du parent | AC3 échue/lot |
| B11 | invitation échue admise (statut seul) | AC3 échue/lot |
| F1 | corps sans `pending_owner_profile_id` | 2 tests |
| F2 | invitation offerte sans droit | 1 |
| F3 | choisir un bailleur garde le lien | 1 |
| F4 | page sans la règle `team.invite` | 1 |
| F5 | fiche sans « En attente de » | 1 |
| F6 | « Ne pas lier » sans effet | 1 |
| F7 | la feuille ne passe pas la saisie | 1 (`InviteOwnerSheet.saisie`) |
| F7b | le nom saisi ignoré | 2 |
| F8 | le lien non posé à l'invitation | 3 |
