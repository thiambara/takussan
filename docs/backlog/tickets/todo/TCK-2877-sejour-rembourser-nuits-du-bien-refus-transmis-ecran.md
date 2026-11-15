---
id: TCK-2877
title: "Réservations, séjour et décisions : heures d'arrivée et de départ, voyageurs, « Rembourser » depuis un séjour confirmé, carte « Nuits du bien » au bureau, paiement « Caution » ou « Autre », refus dont le message part au client"
status: todo
phase: P1
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2892, TCK-2874]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#5-booking"
    - "docs/models-spec.md#6-bookingpayment"
tags: [front, bookings, sejour, remboursement, audit-maquettes-2026-11-15]
---

## Objectif utilisateur

Devant un séjour, l'agent sait quand le voyageur arrive et part, combien ils sont, quelles nuits du bien sont prises autour, et rembourse sans attendre que la réservation soit fermée ; quand il refuse une demande, le client reçoit le message qu'il a écrit.

## Contexte

Audit des maquettes de `/app` du 2026-11-15, famille commerciale (`audit-f5-commercial.md`, app-reservations e2, e5, e6, e7 ; point 4 de la synthèse). Relevé :

- `DatesDuSejour` (`detail/pieces-du-detail.tsx:241-258`) n'a ni heures ni voyageurs ;
- « Rembourser » n'existe que dans `BookingRefundPanel`, monté seulement sur une réservation fermée (`BookingRefundPanel.tsx:36`) — **l'API rembourse déjà tout paiement `paid`** (`BookingPaymentService::refund`, aucune condition sur le statut de la réservation) : le manque est d'écran seul ;
- `CalendrierDesNuits` n'est importé que par le tunnel client (`BookingTunnel.tsx:46`) ;
- la feuille de refus dit « Le motif reste sur la réservation » et nomme le champ « Précision » ; la maquette dit « Message à {prénom} — le motif lui est transmis avec ce message » (TCK-2874 le fait partir) ;
- types de paiement « Caution » et « Autre » (TCK-2892).

## Contrat de données

- `GET /api/bookings/{booking}` : `guests`, `property.check_in_from`, `property.check_out_before` (TCK-2892) ; paiements (`booking_payments`).
- `POST /api/booking-payments/{payment}/refund` (existant) ; `POST /api/bookings/{booking}/payments` (types neufs, TCK-2892).
- `POST /api/bookings/{booking}/reject` avec `reason_code` et `message` (TCK-2874).
- Nuits du bien : la lecture de disponibilité qu'utilise `CalendrierDesNuits` dans le tunnel, plus les réservations du bien pour le mois (`GET /api/bookings?filter[property_id]=…&filter[kind]=stay`).

## Direction UX / Artistique

**Référence de fidélité** : maquette `app-reservations`, approche **a** — fichier `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-reservations-a.tsx` ; écrans **e2 Refuser (motif)**, **e5 Séjour**, **e6 Enregistrer un paiement**, **e7 Rembourser** ; téléphone et bureau.

- **Téléphone (390)** — manque : e5, sous les dates « Arrivée … à partir de 14:00 » / « Départ … avant 11:00 » et « 3 nuits · 2 voyageurs » (l. 145-155) ; « Rembourser » dans « Autres gestes » d'un séjour confirmé qui a un paiement `paid` (l. 218), qui ouvre la feuille e7 (l. 631-643) ; e2, champ « Message à {prénom} » et son aide « le motif lui est transmis avec ce message » ; e6, choix « Caution » et « Autre » (l. 297).
- **Bureau (1440)** — manque : « Rembourser » dans l'en-tête (l. 1048) ; carte **« Nuits du bien · {mois} »** (ce séjour / autres séjours / en attente hachuré, « N nuits libres ») ; les mêmes lignes de dates.
- Heures par défaut 14:00 / 11:00 quand le bien ne les dit pas (ADR-0110 § 1), sans les écrire.

## Contraintes strictes (métier)

- Le geste « Rembourser » n'apparaît que sous `can_refund` et s'il existe un paiement `paid` non entièrement remboursé ; il prérempli le plafond (payé − déjà remboursé).
- Le bloc « Remboursement à traiter » d'une réservation fermée reste (non-régression TCK-2594).
- « Autre » exige une note (422 de l'API lisible).
- i18n `fr`/`en`/`wo`.

## Delta à produire

- [ ] Dates du séjour : heures et voyageurs.
- [ ] « Rembourser » dans Autres gestes (téléphone) et en-tête (bureau) d'un séjour confirmé payé.
- [ ] Carte « Nuits du bien » au bureau.
- [ ] Feuille de refus : « Message à {prénom} » envoyé comme `message`, motif comme `reason_code`.
- [ ] Feuille de paiement : types Caution et Autre.
- [ ] Tests de composant : heures du bien et défaut ; Rembourser présent sur un séjour confirmé payé, absent sans paiement payé ; refus envoie les deux champs ; Autre sans note bloqué.

## Critères d'acceptation

- [ ] AC1 — À 390, un séjour d'un bien sans heures montre « à partir de 14:00 » et « avant 11:00 » ; un bien `check_in_from = 15:00` montre « à partir de 15:00 » ; « 3 nuits · 2 voyageurs » quand `guests = 2`.
- [ ] AC2 — Un séjour **confirmé** avec un acompte payé de 49 500 F montre « Rembourser » ; la feuille dit « Au plus 49 500 F » et le bouton « Rembourser 49 500 F ».
- [ ] AC3 — À 1440, la carte « Nuits du bien · novembre » marque les nuits du séjour, celles des autres séjours et, hachurées, celles en attente, et compte les nuits libres.
- [ ] AC4 — Refuser avec « Dossier incomplet » et le message « Il manque l'engagement du garant » envoie `reason_code` et `message` ; l'aide dit que le motif est transmis avec le message.
- [ ] AC5 — Vérifier au navigateur, avec un séjour confirmé acompte payé et solde dû : « Payer en ligne » est proposé au client sur le solde attendu (maquette l. 205-207) ; corriger si absent.
- [ ] AC6 — Vérifier au navigateur entre 768 et 1279 px que les feuilles (Refuser, Paiement, Rembourser) s'ouvrent en feuille du bas sans débord horizontal ; corriger si non.
- [ ] AC7 — Vérifier au navigateur une réservation fermée qui porte un acompte payé, reversé ou non : le bloc « Remboursement à traiter » et l'avertissement « déjà reversé au bailleur » (e7) ; corriger si absents.

**Fidélité** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2877.json` : écrans e2, e5, e6, e7 de `app-reservations` (a), téléphone et bureau (séjour confirmé, acompte payé ; demande en attente pour e2).
- [ ] AC-F2 — `fidelite compare` à 390 × 844 et 1440 × 900 sans écart non expliqué.

## Hors périmètre

- La candidature (TCK-2875) et l'offre (TCK-2876).

## Notes d'implémentation

_(à remplir par implementing-specs)_
