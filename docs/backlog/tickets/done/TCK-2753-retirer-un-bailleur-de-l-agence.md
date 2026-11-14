---
id: TCK-2753
title: "Retirer un bailleur de l'agence : refusé tant qu'il laisse un bien, un bail en cours ou de l'argent dû ; son profil devient « parti », rien n'est effacé"
status: done
phase: P1
family: full
estimate: L
wave: 90
created: 2026-11-12
updated: 2026-11-14
depends_on: [TCK-2641, TCK-2760]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#34-ownerprofile-"
tags: [back, front, owners, team, payouts, security, audit-ux]
---

## Objectif utilisateur

L'admin d'agence met fin au mandat d'un bailleur depuis sa fiche (« Retirer de l'agence »). Avant d'agir, il sait ce qui l'en empêche encore (biens, baux, argent). Une fois le bailleur parti, rien de son histoire ne s'est perdu.

## Contrat de données

Décision : **[ADR-0108](../../../adr/0108-le-depart-d-un-bailleur.md)** (décision 5 (a) du porteur, 2026-11-12), à lire en entier avant de commencer. Le solde qui décide de l'argent est celui de TCK-2760 ([ADR-0100](../../../adr/0100-une-page-paiements-par-public.md), amendement du 2026-11-12).

Constat (relevé le 2026-11-12, pendant TCK-2641) :

- `AgencyMemberRemovalService::remove()` refuse un bailleur : 422 `agency_member.not_staff`. Pour un bailleur, seule la suspension existe (TCK-587).
- La fiche de TCK-2641 porte « Suspendre l'accès » / « Réactiver », sans « Retirer ».

À servir :

- **`GET /api/owners/{ownerProfile}/departure`** → `{ blocking: { properties, leases, positive_balance, upcoming_payouts, unpaid_out_pieces }, balance: { remaining_to_pay, as_of }, can_depart: bool }`.
- **`DELETE /api/owners/{ownerProfile}`** :
  - 200 → le profil, avec `status: "inactive"` et `departed_at` ;
  - 422 `owner.departure_not_empty` avec le même `blocking` ;
  - 422 `owner.departure_draft` ;
  - 422 `owner.already_departed` ;
  - 422 `owner.departure_self` ;
  - 422 `owner.departure_individual`.
- **`GET /api/owners`** : un profil `inactive` n'est plus listé par défaut, et `filter[status]=inactive` le rend. `summary.owners` ne le compte plus.
- **L'invitation** d'un bailleur parti (par e-mail ou par numéro) : 409, avec un message qui dit qu'il **a quitté** l'agence.

`departed_at` est la date de l'entrée `owner_departed` du journal (ADR-0108 § 7). Aucune colonne neuve.

## Direction UX / Artistique

- Sur la fiche `/app/owners/[id]`, « Retirer de l'agence » est **séparé** des gestes de suspension, plus bas, en ton destructif. Il n'est rendu qu'à un administrateur de l'agence.
- **Avant d'agir**, la fiche lit `…/departure`.
  - **Si quelque chose bloque**, le dialogue dit quoi, en mots et avec les nombres (« 2 biens encore dans l'agence », « 1 bail en cours », « 180 000 F restent à lui verser », « 1 reversement en cours »), et ne propose pas de confirmer.
  - **Sinon**, il dit l'effet : le bailleur n'aura plus accès à l'agence, ses relevés et son histoire restent, et un solde négatif éventuel est à recouvrer hors de la plateforme.
- La confirmation passe par la double authentification (le dialogue de code de TCK-1203).
- **Après le départ**, la fiche dit « Parti le … » et ne propose plus ni suspendre, ni réactiver, ni retirer.
- i18n : `fr` / `en` / `wo` (le `wo` porte le texte français tel quel), vouvoiement, montants par `useFormatteurs()`.

## Contraintes strictes (métier)

- **Les conditions de refus** (ADR-0108 § 1 à 3), chacune comptée :
  - `properties` : biens non supprimés de l'agence dont il est le bailleur (`BailleurDuBien`), **tout statut**, archivé et vendu compris ;
  - `leases` : baux de l'agence où il est `landlord_id`, statut `draft`, `pending_signature`, `active` ou `terminating`, **même sur un bien supprimé** ;
  - `positive_balance` : 1 si `balance.remaining_to_pay > 0` (TCK-2760), 0 sinon. **Jamais le reste de période** ;
  - `upcoming_payouts` : reversements à lui dans l'agence, statut de `PayoutStatus::upcoming()` ;
  - `unpaid_out_pieces` : la règle de `AccountDeletionService::agenciesOwingPayout`, **extraite** dans une méthode partagée par les deux appelants, jamais recopiée.
- **Ce que le bailleur doit à l'agence ne bloque pas** : ni une reprise en attente (`PayoutClawbacks::outstanding`), qu'on ne lit pas dans le solde, ni un trop-versé (solde négatif). Les deux montants s'écrivent au journal du départ.
- **Le bailleur parti n'écrit plus.** La garde d'écriture du bailleur (`HasProfiles::isBlockedOwnerAt` et son amorce `blocked_owner` dans `MembershipCapabilityResolver`) compte `blocked` **et** `inactive`. Ses lecteurs passent tous sous la règle, et chacun est relu : `BasePolicy::landlordWrites` / `bailleurEcrit`, `LeasePolicy`, `PropertyModerationPolicy`, `BookingMoneyAccess` et `LandlordSignatory`. Un bailleur parti ne signe pas, ne rembourse pas, ne joint rien.
- **Une seule méthode d'inventaire** sert `…/departure`, la garde et le corps du 422.
- **La garde recompte sous verrou**, dans la transaction : les biens du bailleur dans l'agence par identifiant croissant, puis la ligne du profil. C'est l'ordre bien → utilisateur du dépôt (`takussan-api/CLAUDE.md`, « Migrations — les pièges PostgreSQL »).
- **L'effet** : `owner_profiles.status = inactive`, et rien d'autre ne change en base que le journal. **Aucune suppression** : biens, baux, paiements, reversements, instantanés de relevé, documents, fils.
- **Les jetons** sont révoqués si le bailleur ne garde aucun profil actif ailleurs, comme `TeamMemberSuspensionService`.
- **Qui** : un profil d'administrateur **actif** dans l'agence du profil (`isAgencyAdminAt`), ou le super-admin. **Pas une capacité** (précédent `CustomerPolicy::viewSensitive`). `…/departure` suit la même règle.
- **Double authentification** :
  - `OwnerDepartureController@destroy` entre dans `ProtectedActions::AGENCY_TWO_FACTOR` ;
  - `OwnerDepartureController` entre dans `FAMILY_CONTROLLERS` (`owners.php` n'est pas une famille) ;
  - `ProtectedActionsCoverageTest` reste vert.
- **Journal** : `activity('Membership')`, évènement `owner_departed`, avec `agency_id`, `owner_profile_id`, `user_id`, l'inventaire, `outstanding_clawback` et `negative_balance` (chacun à son montant ou `null`).
- **Les refus de forme** : soi-même (`owner.departure_self`), une agence `individual` (`owner.departure_individual`), un brouillon, un départ déjà fait (ADR-0108 § 7). L'audit du modèle (`OwnerProfile::AUDIT_ONLY`) écrit le changement de statut.
- **`inactive` ne se résout jamais en profil actif.** Les règles « de tout statut » (`BailleurDuBien`, `BeneficiaireDuReversement`) **ne changent pas**.
- **Codes d'erreur** : `lang/{fr,en,wo}/errors.php`. Message d'invitation : `lang/{fr,en,wo}/owners.php`.

## Delta à produire

- [ ] `App\Services\Owners\OwnerDeparture` (inventaire) et `OwnerDepartureService` (garde sous verrou, effet, journal, jetons).
- [ ] La garde d'écriture du bailleur : `isBlockedOwnerAt` et l'amorce `blocked_owner` comptent `inactive`. Docblocks à jour, et ses cinq lecteurs relus.
- [ ] La règle « pièce reversable non portée » extraite de `AccountDeletionService::agenciesOwingPayout` en une méthode partagée. `agenciesOwingPayout` l'appelle.
- [ ] `OwnerDepartureController` (`show` pour `…/departure`, `destroy`) et ses routes dans `routes/api/owners.php`.
- [ ] `ProtectedActions` : `AGENCY_TWO_FACTOR` et `FAMILY_CONTROLLERS`.
- [ ] `OwnerProfileController::index` (défaut sans `inactive`) et `OwnerDirectory::summary` (`owners` sans `inactive`).
- [ ] `OwnerInvitationService` : `assertNoActiveOwnerInAgency` et `assertRecipientIsNotOwnerInAgency` disent « a quitté » pour un profil `inactive`.
- [ ] Codes et messages (fr, en, wo).
- [ ] Front : « Retirer de l'agence » sur la fiche (cf. Direction UX) ; « Parti le … ».
- [ ] Tests :
  - `OwnerDepartureTest` (refus, effet, journal, jetons) ;
  - `OwnerDepartureAuthorizationTest` ;
  - `OwnerDepartedReadsTest` (ce qui reste lisible et reversable) ;
  - le carnet et l'invitation ;
  - le test front du dialogue.

## Critères d'acceptation

Fixture commune : une agence A, son administrateur actif Ad, le bailleur L d'A (compte U, profil P), et l'histoire de L dans A, soit un bien supprimé et un bail `terminated`, avec paiements, un reversement versé et un instantané de relevé.

- [ ] **AC1 — Chaque condition bloque, et se compte.** Les conditions d'argent se recouvrent : un encaissement non reversé fait à la fois un solde positif et une pièce non portée. Chaque cas est donc posé sur la fixture et vérifié sur le **vecteur exact** de `blocking`, et non sur le seul refus. Dans chaque cas, `DELETE /api/owners/{P}` rend 422 `owner.departure_not_empty` avec ce vecteur (les clés absentes valent 0), P reste `active`, et aucune entrée `owner_departed` n'est écrite.
  - (a) un bien d'A, **archivé**, non supprimé → `properties: 1` ;
  - (b) un bail `draft` sur un bien **supprimé** → `leases: 1` ;
  - (c) un bail `pending_signature` → `leases: 1` ;
  - (d) **le cas de TCK-2760** : octobre reversé le 3 novembre, novembre encaissé et non reversé. Le reste de novembre (`totals.remaining_to_pay`) vaut 0, et le départ est **refusé** avec `positive_balance: 1, unpaid_out_pieces: 1` ;
  - (e) un reversement `scheduled` qui porte toutes les pièces → `upcoming_payouts: 1, positive_balance: 1, unpaid_out_pieces: 0` ;
  - (f) une pièce non portée, sous un **trop-versé** plus grand que son net → `unpaid_out_pieces: 1, positive_balance: 0`. Le trop-versé se construit par un reversement terminé dont le net dépasse celui de ses pièces, inséré directement. Une reprise ne le produit pas : elle ne change pas le solde.

  **Ablation**, une par condition, et chacune rend son test rouge :
  - ne plus compter les biens archivés : (a) ;
  - ne compter les baux que sur les biens non supprimés : (b) ;
  - lire le reste **de période** au lieu du solde : (d) ;
  - retirer le compte des reversements à venir : (e) ;
  - retirer la règle des pièces non portées : (f).
- [ ] **AC2 — Ce qui ne bloque pas.** On part de la fixture seule, et on y ajoute :
  - un bail `expired` et un bail `renewed` ;
  - une **reprise en attente** : un remboursement d'une pièce déjà reversée, non imputée, de sorte que `PayoutClawbacks::outstanding` ne soit pas vide ;
  - un **trop-versé**.

  On attend :
  - 200, et P vaut `inactive` ;
  - le journal porte `owner_departed`, avec l'inventaire à zéro, `outstanding_clawback` au montant du reliquat et `negative_balance` au montant du trop-versé ;
  - l'audit du modèle porte le changement de statut.
- [ ] **AC3 — Le même inventaire partout.**
  - `GET …/departure` rend, dans les six cas de l'AC1, le même `blocking` que le corps du 422, et `can_depart: false`.
  - Sur la fixture seule : `can_depart: true`.
- [ ] **AC4 — Rien n'est effacé.** Les comptes de biens (`withTrashed`), baux, paiements de loyer, reversements, instantanés, documents et participants de fils de L dans A sont identiques avant et après le départ.
- [ ] **AC5 — Ce que « parti » ferme.**
  - `X-Active-Profile-Hint: P` ne fait pas de P le profil actif.
  - `/api/auth/me` ne rend pas `owner` pour A (s'il n'a pas d'autre profil bailleur actif dans A).
  - Joindre un document à son bail terminé → 403. Ablation : ne compter que `blocked` dans la garde d'écriture rend ce test rouge.
  - « Réactiver » (`POST …/team/{U}/reactivate`) → 422 `team.nothing_to_reactivate`, et P reste `inactive`.
- [ ] **AC6 — Ce que « parti » garde.**
  - U lit son bail `terminated` par identifiant (200).
  - Le personnel d'A détenteur de `payouts.create` lit le relevé de L (200).
  - **Un arriéré** de ce bail, encaissé **après** le départ, est proposé à la préparation d'un reversement à L, et `PayoutService::create` l'accepte.
- [ ] **AC7 — Les jetons.**
  - U sans autre profil actif : ses jetons sont révoqués.
  - U avec un profil actif dans une autre agence : ils restent.
- [ ] **AC8 — Qui.**
  - Un agent d'A dont le rôle personnalisé porte **toutes** les capacités → 403, sur `DELETE` comme sur `…/departure`.
  - Un administrateur d'une autre agence → **404** (amendé le 2026-11-13 : la réponse ne dit pas que le profil existe ; `OwnerDepartureRequest` rend 404 hors de l'agence, avant la policy).
  - Ad sans double authentification sur la session → refus de la garde 2FA, avec le code que lit le front (TCK-1203).
  - Le super-admin, 2FA saisie sur sa session → 200.
  - Retirer l'entrée de `AGENCY_TWO_FACTOR` rend `ProtectedActionsCoverageTest` ou le test 2FA rouge.
- [ ] **AC9 — Les autres refus.**
  - Un profil `draft` → 422 `owner.departure_draft`.
  - P déjà `inactive` → 422 `owner.already_departed`.
  - Ad retire son propre profil de bailleur dans A → 422 `owner.departure_self`.
  - L'hôte d'une agence `individual` (administrateur et bailleur), par le super-admin → 422 `owner.departure_individual`.
  - Aucun journal dans les deux cas.
- [ ] **AC10 — Le carnet.**
  - Après le départ, `GET /api/owners` ne liste pas P, et `filter[status]=inactive` le liste.
  - `summary.owners` a baissé de 1.
  - `GET /api/owners/{P}` reste lisible par Ad (200).
  - Sous `filter[has_remaining]=1`, un bailleur parti à qui il reste de l'argent à verser est listé : il compte dans `summary.with_remaining` (décision du 2026-11-13). `filter[has_remaining]=0` l'écarte comme le carnet seul.
- [ ] **AC11 — L'invitation.**
  - Inviter U dans A, par son e-mail puis par son numéro vérifié → 409, avec le message « a quitté » (clé distincte de `already_member`).
  - Un bailleur actif d'A reçoit toujours `already_member`.
- [ ] **AC12 — Le front.**
  - Pour un bailleur bloqué (réponse simulée `can_depart: false`, `properties: 2`), le dialogue nomme « 2 biens » et ne propose pas de confirmer.
  - Débloqué, la confirmation envoie `DELETE` après le code.
  - La fiche dit ensuite « Parti le … » et ne rend plus les gestes de suspension ni de retrait.
  - Le geste n'est pas rendu à un agent.

## Hors périmètre

- **Le retour d'un bailleur parti** : écarté par le porteur le 2026-11-12, un profil retiré ne revient pas (ADR-0108 § 9). Ce ticket sert seulement le refus de l'invitation, qui dit qu'il **a quitté** l'agence. Un retour voulu un jour serait un amendement de l'ADR, pas un ticket de suite.
- **Le changement de titulaire d'un bien** d'un bailleur à un autre (TCK-999 ne va que du personnel vers un bailleur).
- **Une surface où le bailleur parti relit ses relevés** : l'agence les lui envoie.
- **La suspension et la réactivation** : TCK-2641.

## Notes d'implémentation

### Décisions du 2026-11-13 (relayées par team-lead)

- **AC8, administrateur d'une autre agence : 404, et non 403.** Le refus ne dit pas que le profil existe. L'AC est amendé.
- **`filter[has_remaining]=1` liste aussi les bailleurs partis.** C'était la recommandation de l'implémentation. Un
  parti à qui un arriéré encaissé après son départ reste à verser compte dans `summary.with_remaining` et
  `remaining_to_pay`, et la liste que ces chiffres annoncent le montre. `OwnerProfileController::index` n'écarte
  donc plus `inactive` quand ce filtre est vrai. `=0` garde l'exclusion : un parti n'est pas « à jour ». Épinglé par
  `OwnerDepartedTest::test_ac10_un_parti_a_qui_il_reste_a_verser_se_liste_sous_has_remaining`, rouge sous les deux
  ablations : exclusion rétablie, ou levée aussi pour `=0`.
- **Suivi : pas de vue « Partis » pour l'instant.** Aucun écran ne liste les bailleurs partis. Ils se relisent par
  `filter[status]=inactive` côté API, et sous « Avec reste à verser » quand il leur reste de l'argent. Une vue
  dédiée sera un ticket à part, si le besoin apparaît.

### Contre-vérification de 97dfe6c35 — trois trous fermés et une décision (2026-11-13)

- **r0 — un bail échu ne se renouvelle plus au nom d'un bailleur parti.** Avant, l'admin renouvelait le bail
  `expired` d'un bailleur parti : un bail neuf naissait à son nom, sur un bien supprimé. `LeaseRenewalService::renew()`
  refuse désormais, sous le verrou du bail parent, un bien supprimé (422 `lease.renewal_property_deleted`), puis un
  bailleur dont le profil de l'agence est parti ou bloqué (422 `lease.renewal_owner_departed`, profil relu sous
  `FOR SHARE`). Les autres naissances de bail ne recopient pas un `landlord_id` existant : `LeaseService` le prend sur
  le bien vivant. Épinglé par `OwnerDepartedRenewalTest`.
- **r1 — la course entre le départ et l'écriture d'un bien.** `bailleurActif()` jugeait le bailleur avant
  l'écriture, sans verrou : un départ pouvait passer entre les deux. La saisie (bailleur désigné, lot qui hérite du
  bailleur de son parent, proposition d'un bailleur) et le transfert (`PUT /api/properties/{id}/owner`) rejugent
  maintenant le bailleur APRÈS l'écriture, dans la même transaction, profil sous `FOR SHARE`
  (`TitulaireALaSaisie::exigerActifSousVerrou()`, 422 `property.owner_not_in_agency`). L'ordre est celui du départ :
  bien, puis profil. Épinglé par `OwnerDepartedPropertyRaceTest`, qui fait courir le départ dans `creating` ou
  `updating`. Le refus n'est plus journalisé comme un échec de création.
- **r2 — le dossier d'un bailleur parti ou suspendu est figé.** `kyc/upload`, `kyc/submit` et `tax-id` rendent 403
  `owner.profile_read_only` (`OwnerProfile::exigerEcrivable()`), avant la validation, au super-admin aussi.
  Épinglé par `OwnerDepartedDossierTest`.
- **q1 — décision de team-lead, en attente du porteur : le bailleur parti lit le fil de son bail, il n'y écrit plus.**
  `ConversationAccess::allowsWriting()` refuse l'écriture à qui ne tient, dans l'agence du fil, qu'un profil non
  actif, sauf au locataire du bail. `abilities.can_send_message` suit. Le bailleur suspendu est traité de la même
  façon. Épinglé par `OwnerDepartedThreadTest`. Hors de ce point, non tranchés : l'ouverture d'un fil neuf par le
  bailleur parti, et l'ajout de participants.

### S2 — le bailleur parti ou suspendu n'ouvre plus de fil ni n'ajoute personne (2026-11-13)

- Mesuré avant : un bailleur parti joignait encore le locataire et l'agent de son ancien bail (directe 201, groupe
  201) — toute l'atteinte venait du fil du bail, qu'il lit encore (q1).
- `ConversationAccess::agencesFermeesAuBailleur()` : les agences où l'acteur tient un profil propriétaire parti ou
  suspendu et aucun profil actif. `MessagingReach` y écarte les fils de bail ou de bien (sauf ceux d'un bail dont il
  est le LOCATAIRE), les fiches clients de l'agence et l'équipe de l'agence du groupe qu'il complète. Les directes,
  les groupes, l'ajout de participants et les deux sélecteurs de contacts lisent la même règle. Ses autres agences,
  ce qu'il tient comme locataire et le locataire qui le joint ne changent pas. Épinglé par `OwnerDepartedReachTest`.
- **Décision ouverte (team-lead, 2026-11-13, remontée au porteur)** : une conversation DIRECTE, sans bail ni bien,
  déjà ouverte entre le bailleur parti et une personne de l'agence quittée, reste telle quelle — il peut y écrire,
  et une « nouvelle » directe vers cette personne rend ce fil (`DirectConversationService::firstOrCreate`). Motif :
  une conversation de personne à personne déjà ouverte, et l'agence peut encore avoir besoin de le joindre. Rien
  n'est fermé tant que le porteur n'a pas tranché.
- **r1 de la contre-vérification de 2eba3431c (2026-11-13)** : la règle fermait la joignabilité, pas le contexte.
  Par les directes gardées ouvertes, l'agent et le locataire restaient ses correspondants, et `guardContext` ne
  jugeait que le `view` du bail ou du bien, qu'il garde : `POST /api/conversations` rattachait une directe
  (`lease_id`) et un groupe (`lease_id` + `property_id`) à son bail de l'agence quittée (201 et 201), et le message
  initial s'écrivait là où `POST …/messages` rend 403. `GuardsConversationScope::guardContext` refuse désormais un
  bail ou un bien d'une agence de `agencesFermeesAuBailleur`, sauf le bail dont l'acteur est le locataire — la
  règle de `MessagingReach::filsFermes`. Les directes simples restent ouvertes (décision ci-dessus).
