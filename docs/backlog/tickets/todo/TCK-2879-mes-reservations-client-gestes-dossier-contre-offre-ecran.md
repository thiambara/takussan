---
id: TCK-2879
title: "Mes réservations, côté client : l'encart d'appel et le geste qu'il faut sur chaque carte (Payer l'acompte, Payer le solde, Compléter mon dossier, répondre à une contre-offre), « Annuler », et le dépôt des pièces"
status: todo
phase: P1
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2872, TCK-2873]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#5-booking"
tags: [front, bookings, client, dossier, audit-maquettes-2026-11-15]
---

## Objectif utilisateur

Le client voit sur chaque réservation ce qu'on attend de lui (un acompte avant jeudi, une pièce qui manque, une contre-offre à laquelle répondre) et le fait d'un toucher, sans ouvrir la réservation pour chercher.

## Contexte

Audit des maquettes de `/app` du 2026-11-15, famille commerciale (`audit-f5-commercial.md`, app-reservations e9 ; point 3 de la synthèse). `CarteDeReservation` (`liste/MesReservations.tsx:148-187`) n'a qu'un lien « Voir la réservation » ; `bookings.client.actions` ne connaît que `voir` et `avis`. « Compléter mon dossier » et la contre-offre attendent TCK-2872 et TCK-2873 ([ADR-0110](../../../adr/0110-la-candidature-et-l-offre-portent-leurs-conditions-et-leur-dossier.md)).

## Contrat de données

- `GET /api/bookings` (client) avec `include=property`, `booking_payments`, `dossier`, `counter_offer` (TCK-2872, TCK-2873).
- Paiement : la voie « Payer l'acompte / le solde » déjà offerte au client par la fiche réservation (non-régression TCK-2594) ; le client crée lui-même un paiement `pending` qu'il règle en ligne (`StoreBookingPaymentRequest`, l. 47-59) — un solde sans ligne se paie donc sans route neuve.
- « avant jeudi » : l'échéance de l'acompte (`response_deadline` de la réservation confirmée en attente d'acompte, ou la date d'arrivée pour le solde).
- `POST /api/bookings/{booking}/cancel` (existant) ; `POST /api/bookings/{booking}/dossier/{piece}/document` (TCK-2872) ; `POST …/counter-offers/{id}/accept|decline` (TCK-2873).

## Direction UX / Artistique

**Référence de fidélité** : maquette `app-reservations`, approche **a**, écran **e9 Client — mes réservations** — fichier `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-reservations-a.tsx` (données des cartes l. 687-689 ; sous-titre l. 1161).

- **Téléphone (390)** — manque sur chaque carte : l'**encart d'appel** (« Acompte de 33 000 F à payer avant jeudi. », « Acompte payé · solde de 147 000 F à l'arrivée », « Dossier 3/4 : il manque votre attestation de travail. ») ; le **geste primaire** (« Payer l'acompte », « Payer le solde », « Compléter mon dossier ») à la place du générique « Voir la réservation » ; le geste second **« Annuler »**.
- **Bureau (1440)** — manque : les mêmes encarts et gestes ; sous-titre « N en cours, dont un acompte à payer avant {jour} ».
- Contre-offre (non dessinée sur e9, ajout dû à ADR-0110 § 5) : encart « L'agence vous propose {montant} jusqu'au {date} » avec « Accepter » (primaire) et « Décliner ».
- « Compléter mon dossier » ouvre la réservation sur sa section Dossier, où chaque pièce manquante se dépose (photo au téléphone, fichier au bureau), comme l'ajout par photo du coffre (TCK-2656).

## Contraintes strictes (métier)

- Un seul geste primaire par carte, par priorité : contre-offre à répondre > acompte dû > pièce manquante > solde dû ; aucun quand rien n'est attendu (le lien vers la réservation reste sur la carte).
- « Annuler » seulement là où l'API permet au client d'annuler ; il passe par la confirmation existante.
- Le client ne lit que sa réservation (aucune donnée d'un autre candidat).
- i18n `fr`/`en`/`wo`, vouvoiement.

## Delta à produire

- [ ] Encart d'appel et geste primaire dérivés de la réservation.
- [ ] Geste « Annuler ».
- [ ] Section Dossier côté client dans la fiche réservation : pièces attendues, dépôt.
- [ ] Encart et gestes de la contre-offre.
- [ ] Sous-titre compté du bureau.
- [ ] Tests de composant : priorité des gestes ; textes d'appel ; Annuler absent quand interdit ; dépôt appelle la route ; Accepter / Décliner appellent les routes.

## Critères d'acceptation

- [ ] AC1 — À 390, un séjour confirmé dont l'acompte de 33 000 F est dû jeudi montre « Acompte de 33 000 F à payer avant jeudi. » et le bouton « Payer l'acompte », plus « Annuler ».
- [ ] AC2 — Une candidature 3/4 dont manque l'attestation de travail montre « Dossier 3/4 : il manque votre attestation de travail. » et « Compléter mon dossier », qui ouvre la section Dossier où le client dépose la pièce ; la carte passe ensuite à 4/4 sans geste primaire.
- [ ] AC3 — Une offre avec contre-offre `pending` montre l'encart et « Accepter » ; accepter fait passer la carte en « Confirmée ».
- [ ] AC4 — À 1440, le sous-titre dit « 3 en cours, dont un acompte à payer avant jeudi » quand c'est le cas.
- [ ] AC5 — Vérifier au navigateur, compte client à 390 px, que la coque titre la page « Mes réservations » (`MesReservations` ne déclare pas d'en-tête) ; corriger si non.

**Fidélité** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2879.json` : écran e9 de `app-reservations` (a), téléphone et bureau, avec les trois cartes de la maquette.
- [ ] AC-F2 — `fidelite compare` à 390 × 844 et 1440 × 900 sans écart non expliqué ; l'encart de contre-offre est déclaré « hors maquette » avec son motif.

## Hors périmètre

- Le côté personnel (TCK-2875, TCK-2876).

## Notes d'implémentation

**2026-11-15 — implémentation (agent délégué, vague 92).**

Prémisses qui différaient (re-mesurées) :
- **La liste ne sert pas les paiements** : `booking_payments` n'est émis que sous `whenLoaded('payments')`, l'index ne
  charge pas `payments` et `$requestLoadable` ne l'ouvre pas ; l'ouvrir aurait coûté une requête `Payout` par paiement
  (`BookingPaymentResource::paidOut`). **Corrigé côté API** (bloc TCK-2879) : `BookingController::index` somme le réglé
  en une sous-requête pour la page (`withSum`, après `buildQuery` : le sparse fieldset garde ses colonnes), compté comme
  `BookingPaymentService::dueFromCustomer` (paiements `paid`, ni caution ni « autre ») ; `BookingResource` émet
  `amount_paid` quand la somme est là (liste seule, absent de la fiche). Registre `DateInventoryByValueTest` complété.
- **« avant jeudi » n'a pas de source** : `responseDeadline()` est `null` hors `pending`, et aucune échéance d'acompte
  n'existe dans l'API. L'échéance dite est le jour d'ARRIVÉE : le nom du jour dans les six jours (« avant jeudi »),
  « avant le 21 nov. » au-delà, « dès maintenant » le jour venu.
- **Paiements : séjour seulement.** Le `total_amount` d'une candidature est le loyer, celui d'une offre le prix proposé :
  `CustomerPayCta` de la fiche offrait « Payer le solde » de tout ce montant au client d'une offre ou d'une candidature.
  **Défaut voisin corrigé** : la fiche ne propose plus de paiement au client hors séjour (même règle que la carte, sinon
  AC2 « 4/4 sans geste primaire » serait faux pour toute candidature).
- **Dossier : candidature seulement**, comme la section de la fiche (TCK-2875) ; « Compléter mon dossier » n'est jamais
  offert sur une offre, dont la fiche ne montre pas de dossier.
- **AC5** : `PageHeader` est monté (caché par CSS sous `md`) et déclare son titre à la coque (`DeclarerEnTete`,
  priorité `en-tete-de-page`) : la coque titre déjà « Mes réservations ». Prouvé par un test de composant ; le relevé au
  navigateur n'a pas été fait (pas de navigateur dans ce lot).

Livré :
- `lib/reservations/appel-du-client.ts` (pur) : `appelDuClient` (contre-offre > acompte > pièce manquante > solde ;
  « Dossier complet » sans geste), `clientPeutAnnuler` (la règle TCK-1301 de la fiche, désormais partagée),
  `formeDeLEcheance`, `acomptesDus` ; `contreOffreARepondre`, que `detail/contre-offre.tsx` réutilise.
- `lib/queries/booking-gestes-du-client.ts` : `useDeposerUnePiece` (multipart `file`) et `useRepondreALaContreOffre`
  (`accept` / `decline`). Module à part : les tests de la fiche mockent `bookings.ts`, `booking-dossier.ts` et
  `booking-counter-offer.ts` en fabrique fermée.
- Carte : encart d'appel (alerte pour l'acompte, sourdine sinon — maquette), un seul geste (« Payer l'acompte » plein,
  « Payer le solde » et « Compléter mon dossier » en contour, vers `#paiement` / `#dossier` de la fiche), « Annuler » par
  la feuille de la fiche (`FeuilleDeDecision`, motif en toutes lettres) là où `clientPeutAnnuler` ; contre-offre :
  encart, « Accepter » et « Décliner » (sans « Annuler » : trois gestes ne tiennent pas à 390, il reste dans la fiche).
- Sous-titre du bureau : « 3 en cours, dont un acompte à payer avant jeudi » (première page des réservations en cours,
  même lecture que la liste « En cours »).
- Fiche du client : ancres `#paiement` (bloc avis et paiement ; la section Paiements quand un paiement est déjà en
  attente — `CustomerPayCta` se tait alors et « Payer en ligne » vit là) et `#dossier` (section ou carte Dossier),
  descente à l'ancre une fois la réservation lue (`detail/useAncreDeLaFiche.ts`) ; tant que la demande est ouverte
  (`pending` / `confirmed`, `booking.dossier_closed` sinon), dépôt d'une pièce manquante (« Prendre une
  photo » au téléphone, `capture`, « Déposer » un fichier au bureau ; 10 Mo, refus `booking.dossier_closed` dit sous la
  pièce) ; la contre-offre qui attend le client s'y répond (l'avis `counter_offer_received` mène à la fiche).
- Tests : `appel-du-client.tck-2879` (12), `booking-gestes-du-client.tck-2879` (2, routes réelles),
  `MesReservations.gestes.tck-2879` (10), `DepotDeLaPiece.tck-2879` (6), `BookingDetail.client.tck-2879` (5), API
  `BookingAmountPaidTest` (2). Tests mis à jour : `MesReservations.tck-2594` (l'en-tête lit la page « En cours »),
  `BookingDetail.candidature.tck-2875` et `BookingDetail.offre.tck-2876` (le client dépose et répond désormais).
- Dix-huit ablations une à une, toutes rouges puis restaurées (md5) : filtre caution/« autre » de la somme (API), priorité
  de la contre-offre, séjour seul pour l'acompte, Annuler d'un séjour commencé, seuil des six jours, geste du dossier,
  ancre `#dossier` de la carte, sous-titre de l'acompte, style plein de l'acompte, encart d'alerte, borne des 10 Mo,
  dépôt au seul client, paiement hors séjour de la fiche, descente à l'ancre, ancre de la section Dossier, `#paiement`
  sur la section Paiements avec un paiement en attente, dépôt fermé sur une candidature refusée, « avant le 28 nov. ».
- Gardes : `tsc`, ESLint, `check:i18n`, `check:i18n-namespaces`, `check:vouvoiement`, `check:classes-emises` verts ;
  toutes les `scripts/check-*.mjs` racine vertes sauf `check-status-badge-unique` (rouge sur
  `components/payments/locataire/ToutTelechargerLesQuittances.tsx`, fichier non suivi d'un autre agent). API : les trois
  balayages et les trois gardes d'architecture, `RequestLoadableEmittedTest` verts. 41 fichiers de test du domaine
  réservations verts (312) ; les cinq `*.garde.test.*` du front verts.

Fidélité : fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2879.json` (contre-offre « hors maquette », échéance « donnée ») ;
AC-F2 non mesuré (pas de navigateur dans ce lot).
