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

_(à remplir par implementing-specs)_
