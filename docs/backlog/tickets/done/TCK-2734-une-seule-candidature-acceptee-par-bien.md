---
id: TCK-2734
title: "Deux candidatures acceptées sur la même location : une seule à la fois, ou plusieurs (décision du porteur)"
status: done
phase: P1
family: back
estimate: S
wave: 89
created: 2026-11-11
updated: 2026-11-11
depends_on: [TCK-2579]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#5-booking"
tags: [back, bookings, candidature, suivi-lot-1, decision-porteur]
---

## Objectif utilisateur

L'agent qui accepte la candidature d'un client pour une location au mois sait que personne d'autre n'a déjà été
accepté sur ce logement, et le client qu'on prévient « acceptée » n'est pas en concurrence avec un second client
prévenu de la même façon.

## Contexte

Relevé dans le journal du lot 1 (`docs/plans/2026-11-11-audit-ux-app-implementation.md`, entrée TCK-2579, « à
trancher par le porteur ») et re-mesuré dans le code le 2026-11-11 :

- [ADR-0102](../../../adr/0102-une-reservation-porte-sa-nature.md) § 3 : « une candidature ou une offre ne bloque
  aucune nuit ». `PropertyAvailabilityService::confirmedOverlapQuery()` ne retient donc que les réservations
  `kind = stay`.
- `BookingService::confirm()` appelle `assertNoOverlap()`, donc `assertAvailable()`, qui ne voit que les séjours.
  **Rien ne refuse la confirmation d'une seconde candidature sur le même bien** quand une première est déjà
  confirmée, datée ou non. Lu dans le code, pas encore éprouvé par un test.
- La création du bail depuis une réservation (`LeaseService`, `?booking_id=`, TCK-2643) ne lit que la réservation
  qu'on lui passe.

## Décision

**Décidé par le porteur le 2026-11-11 : (a), la recommandation (« je valide tout »).**

- **(a) Une seule candidature confirmée par bien à la fois.** Confirmer une seconde candidature rend
  `409 booking.application_already_accepted` tant que la première est `confirmed`. Elle est libérée quand le bail
  est créé depuis elle, quand elle est annulée ou quand elle est refusée. La confirmation dit « acceptée » au
  client : en accepter deux, c'est promettre le même logement à deux personnes.
- **(b) Plusieurs candidatures confirmées (liste courte).** Le bail créé depuis l'une d'elles fait passer les
  autres à `rejected`, et leurs clients sont prévenus. Le mot affiché au client à la confirmation devient « retenue »,
  pas « acceptée ».
- **(c) Statu quo.** Plusieurs candidatures confirmées, aucune fermeture automatique. Le fait est seulement écrit
  dans la spec.

Les offres d'achat (`kind = offer`) ne sont pas concernées : plusieurs offres sur un bien à vendre sont normales.

## Contrat de données

Aucune colonne neuve. Pour (a) : une règle sous le verrou du bien que `confirm()` pose déjà
(`Property::lockForUpdate()`). Pour (b) : la fermeture des autres candidatures dans la transaction de création du
bail.

## Contraintes strictes (métier)

- La règle est jugée sous le verrou existant du bien (piège PostgreSQL n° 2 de `takussan-api/CLAUDE.md` : verrouiller
  la ligne parent, jamais `lockForUpdate()->count()`).
- Un séjour (`stay`) garde sa règle de nuits (`assertAvailable`), inchangée.
- Le code d'erreur est un code (`abort_code`), jamais un libellé (ADR-0032). Le front le traduit.

## Delta à produire (option a)

- [ ] `BookingService::confirm()` : sous le verrou du bien, refuser `kind = application` si une autre candidature du
      même bien est `confirmed` → `409 booking.application_already_accepted`
- [ ] `lang/*/` côté front : le message du code (fr ; en ; wo = fr, Wolof en pause)
- [ ] Tests : `BookingApplicationSingleAcceptedTest`

## Critères d'acceptation (option a)

- [ ] AC1 — La prémisse est éprouvée avant le correctif : le test d'AC2, joué sur le code d'avant, est rouge (la
      seconde confirmation passe)
- [ ] AC2 — La seconde confirmation rend 409 `booking.application_already_accepted`, et son statut reste `pending`
- [ ] AC3 — Une fois la première annulée, refusée ou convertie en bail, la seconde se confirme
- [ ] AC4 — Deux offres d'achat sur un même bien se confirment toutes deux, et deux séjours qui ne se chevauchent pas
      aussi (témoins : la règle ne déborde pas sur les autres natures)
- [ ] AC5 — Ablation : retirer la règle rougit AC2 et AC3, et pas AC4

## Hors périmètre

- Les lecteurs qui lisent les réservations confirmées sans leur nature (TCK-2735)
- Les pièces du dossier de candidature et le garant (ADR-0102, « hors modèle »)

## Notes d'implémentation

- **Une candidature confirmée ne peut pas passer à « refusée »** : `reject` n'accepte qu'une candidature en attente et rend 422 sinon. Une fois une candidature acceptée, le bien n'est donc libéré que par la création du bail depuis cette candidature ou par une annulation (de l'agent ou du client).
- La seconde confirmation est refusée **sous le verrou du bien** (409 `booking.application_already_accepted`). Côté front, aucune clé neuve : le dialogue de BookingDetail affiche la prose localisée de l'API, par `useMessageErreurApi`.

## Vérification (2026-11-11)

Vérification adverse acceptée pour le delta.
- **Concurrence** : mesurée avec deux connexions. La seconde confirmation attend le verrou du bien, puis rend 409. Sans le verrou, les deux passent.
- **Libération** : l'annulation par l'agent ou par le client libère le bien, et la création du bail depuis la candidature aussi.
- **« Refusée »** : inatteignable, car le refus d'une candidature acceptée rend 422.
- **Message au client** : le dialogue de BookingDetail affiche la prose de l'API, en fr et en en.

Reste une seconde porte, hors delta : la création d'un bail ne lit pas la règle. Deux cas laissent A « acceptée » :
- un bail créé depuis une AUTRE candidature encore en attente ;
- un bail créé pour le client de A sans `booking_id`.

Toute candidature suivante rend alors 409 jusqu'à l'annulation de A. En démo, 10 candidatures acceptées sont déjà dans ce cas. La décision est remontée au porteur ; un ticket de suite la porte.

Mineurs, au lot 2 :
- un témoin « offre sur un bien à candidature acceptée » ;
- un test du verrou, porté du jetable de concurrence.

## Seconde porte — le bail ferme les autres candidatures (2026-11-12)

**Décision du porteur (option a), relayée le 2026-11-12.** À la création d'un bail (`LeaseService::create`), les autres
candidatures ouvertes du bien (`pending`, `confirmed`) se ferment, acceptée comprise :

- elles passent `rejected`, leurs paiements en attente sont annulés, et `BookingClosed` ouvre la tâche de remboursement
  d'un acompte encaissé, comme pour un refus ;
- leur auteur (le compte du client) reçoit `booking.application_not_selected`, « Candidature non retenue », une fois,
  après le commit. Un client sans compte ne reçoit rien, comme pour `booking.rejected`.

Tout se passe dans la transaction du bail, dans l'ordre global des verrous (`takussan-api/CLAUDE.md`, piège n° 10) :
le bien, puis les réservations en une passe par identifiant croissant.

**Écart à la lettre de la décision.** Les candidatures ouvertes du LOCATAIRE du bail sont celles du bail, avec ou sans
`booking_id` : elles passent `completed`, sans avis. Lui dire « non retenue » serait faux. C'est le seul cas de la démo
où un bail a suivi la confirmation : la candidature 42, avec un bail créé sans `booking_id` pour le même client.

**Ce que la règle ne fait pas :**
- Elle ne vaut que pour la suite et ne libère aucune donnée existante. Mesuré en démo (lecture seule) : 10 des
  20 candidatures acceptées sont sur un bien qui a un bail, et 9 de ces 10 ont été acceptées APRÈS ce bail (confirmées
  sur un bien déjà loué : une autre porte, que cette règle ne ferme pas).
- Elle ne touche ni les offres d'achat ni les séjours.
- Le renouvellement (`LeaseRenewalService`) n'emprunte pas `create()` et ne ferme rien.

Tests : `BailFermeLesAutresCandidaturesTest`. Dans `BookingApplicationSingleAcceptedTest`, le cas « convertie en bail »
change de sens : la seconde candidature est désormais close par le bail.

## Décision 7 — les candidatures se closent quand le bail PART (2026-11-12, soir)

**Décision du porteur (option b, contre la recommandation), relayée par team-lead** : les autres candidatures ne se
ferment plus à la création du brouillon. Elles se ferment à l'**envoi du bail en signature**, avec l'avis « non
retenue ». Un brouillon abandonné ne ferme rien. Cette décision remplace le « À la création d'un bail » de la section
précédente.

**Lecture retenue, gardée par team-lead (2026-11-12) et présentée au porteur comme décision prise** : la candidature d'origine (ou celles du futur locataire) passe
`completed` **au même moment** que les autres se ferment, c'est-à-dire à l'envoi, et non à la création du brouillon.
Pendant le brouillon, elle reste `confirmed` : ses nuits bloquent encore et la règle de TCK-2734 tient. La prose de
`booking.application_already_accepted` le dit désormais : « …annulez-la, ou envoyez son bail en signature… ».

- `LeaseService::create()` ne ferme plus rien. Il verrouille le bien, puis crée le bail.
- `LeaseService::cloreLesCandidaturesDuBien(Lease, User)` porte la clôture : la réservation d'origine passe `completed`,
  les candidatures du locataire aussi, et les autres passent `rejected` avec un avis après le commit. Deux appelants :
  - `LeaseSignatureService::request()`, après les refus (422, 409 `terms_changed`) : un envoi refusé ne ferme rien ;
  - `signOnPaper()`, qui accepte un brouillon jamais envoyé. Il clôt au même moment logique, celui où le bail part.
- **Le renouvellement ne ferme rien** (`renewed_from_lease_id` non nul). Ses candidatures ont été closes au départ du
  bail d'origine.
- **Ordre des verrous** : les deux transactions de `LeaseSignatureService` prennent maintenant le bien AVANT le bail
  (`LeaseService::verrouillerLeBienPuisLeBail`), puis les réservations. `PropertyOwnerTransfer` écrit les baux après le
  bien : prendre le bail d'abord aurait inversé l'ordre global (`takussan-api/CLAUDE.md`, piège n° 10).
- **À reprendre ailleurs** (signalé à team-lead, fichiers de terrain-7) :
  - le texte « Vérifier » de TCK-2643 doit dire « L'envoi en signature clôturera… » ;
  - le commentaire de `LeaseDefaults.php` (vers les lignes 120 à 123) cite encore la fermeture à la création.

Tests :
- `BailFermeLesAutresCandidaturesTest` réécrit (14) : le brouillon ne ferme rien, l'envoi ferme, papier, renouvellement,
  envoi refusé, avis après le commit, rejeu, ordre des verrous à l'envoi et sur papier.
- `BailTireDUneCandidatureTest` : la candidature d'origine se termine à l'envoi. Ses nuits libérées le sont désormais
  pour un séjour, puisque la candidature voisine est close par l'envoi.
- `BookingApplicationSingleAcceptedTest`, AC3 : pendant le brouillon, toujours 409 ; après l'envoi, la première est
  `completed` et la seconde `rejected` ; une entrée après la fin du bail se confirme.

Ablations (une à la fois, md5 vérifié avant restauration) :
- **a1 — plus de clôture à l'envoi** : 10 rouges dans `BailFermeLesAutresCandidaturesTest` et `BailTireDUneCandidatureTest`.
- **a2 — plus de clôture sur papier** : 2 rouges (papier, ordre des verrous sur papier).
- **a3 — garde du renouvellement retirée** : 1 rouge.
- **a4 — le bail verrouillé sans le bien** : 2 rouges (ordre des verrous, à l'envoi et sur papier).
- **Ordre des verrous des autres transactions du bail** (relevé, lecture) : `sign()`, `terminate`, l'échéancier
  et la résiliation anticipée verrouillent le bail seul et n'écrivent aucune ligne de `properties`. Rien n'y inverse
  l'ordre bien → bail.
- **a11 — la clôture remise à la création du brouillon** (la régression que la décision écarte) : 7 rouges, dont « le
  brouillon ne ferme rien », « un envoi refusé ne ferme rien » et « la première convertie en bail ne retient plus le bien ».

### Réserve r2 de la vérification de d87e423e7 — interblocage avec l'achat de boost (2026-11-13)

- **Mesuré.** Une sonde `DB::listen` a relevé toutes les écritures avec leur `transactionLevel`. Sous le verrou du bien, l'envoi en signature et la signature sur papier touchent l'agence de deux façons :
  - par le journal : `activity_log.agency_id` porte la clé étrangère `activity_log_agency_fk`, donc un `KEY SHARE` sur la ligne de l'agence ;
  - par le compteur de `LeaseObserver` (`update "agencies"`).
- **Le cycle.** `BoostPurchaseService::lock()` prenait l'agence (`for update`) puis le bien : sur un même bien, cela formait un cycle avec l'envoi.
- **Correctif retenu : le boost prend le bien, puis l'agence.** Deux voies ont été écartées :
  - **« L'agence d'abord » à l'envoi** aurait ouvert un cycle neuf avec tout écrivain qui tient un bien puis journalise (`BookingService::confirm`, par exemple).
  - **Sortir le compteur de la transaction** ne suffisait pas : le cycle passe aussi par le journal.
- **Épinglé de deux côtés**, avec deux ablations, toutes deux rouges :
  - `BoostPurchaseUnderLockTest::test_l_achat_verrouille_le_bien_avant_l_agence` : rouge sur l'ancien ordre ;
  - les deux tests d'ordre de `BailFermeLesAutresCandidaturesTest` affirment désormais que rien ne touche l'agence (`for update`, `update "agencies"`, insertion à `agency_id`) avant le verrou du bien : rouges sous « agence d'abord » à l'envoi.
- **Documentation.** Le piège n° 10 de `takussan-api/CLAUDE.md` est complété (place du bail, des réservations et de l'agence).
- **Reste ouvert**, et antérieur : `PayoutService` (agence → bail) contre `sign()` (bail → agence par l'observateur).
- **Mesuré ensuite** par verif-patrimoine (2026-11-13), à deux processus, avec `request()` contre `purchase()` réels : 0 interblocage sur 2164 itérations après 1ca16f458, et 53 achats tués (`40P01`) sur 120 sous l'ordre inverse.
