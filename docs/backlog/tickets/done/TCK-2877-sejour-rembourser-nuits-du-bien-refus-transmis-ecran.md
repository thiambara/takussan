---
id: TCK-2877
title: "Réservations, séjour et décisions : heures d'arrivée et de départ, voyageurs, « Rembourser » depuis un séjour confirmé, carte « Nuits du bien » au bureau, paiement « Caution » ou « Autre », refus dont le message part au client"
status: done
phase: P1
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-16
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

2026-11-15 — agent d'implémentation (vague 92), front seul.

**Fait**

- `DatesDuSejour` (`detail/pieces-du-detail.tsx`) : « à partir de {heure} » / « avant {heure} » sous chaque jour, depuis `property.check_in_from` / `check_out_before`, 14:00 / 11:00 par défaut (dits, jamais écrits) ; « 3 nuits · 2 voyageurs » quand `guests` est servi.
- « Rembourser » d'un séjour **confirmé** : `Autres gestes` au téléphone (avant « Annuler le séjour »), en-tête au bureau (entre Annuler et Enregistrer un paiement) ; sous `can_refund`, hors client, s'il reste un paiement `paid` pas entièrement remboursé. `BookingRefundDialog` est exporté et sert les deux entrées ; plusieurs paiements remboursables se choisissent en pastilles. Le bloc « Remboursement à traiter » d'une réservation fermée est inchangé.
- **Défaut voisin corrigé** : le plafond du remboursement était `payment.amount` ; il est désormais payé − `refund_amount` (TCK-1214 laisse `paid` une ligne remboursée en partie). `BookingPayment` déclare `refund_amount` / `refund_reason`.
- **Défaut voisin corrigé** : l'encaissé de la fiche (jauge, solde, « Enregistrer un paiement » prérempli) et `CustomerPayCta` comptaient une caution ou un paiement « autre » ; ils les excluent comme `BookingPaymentService::dueFromCustomer`.
- Carte « Nuits du bien · {mois} » au bureau (`detail/nuits-du-bien.tsx`, lectures dans `lib/queries/nuits-du-bien.ts`), au personnel et au bailleur, jamais au client : le mois de l'arrivée, ce séjour en plein, les autres séjours confirmés en teinte, les demandes en attente hachurées, les nuits bloquées par le bailleur (`/properties/{id}/unavailabilities`, 403 toléré) barrées et hors des libres. Plages `[début, fin)` (ADR-0041). L'index `/api/bookings` n'a pas de filtre de dates : les séjours du bien sont lus page par page (`lireToutesLesPages`, 100 par page), comme `usePropertyConfirmedStays`.
- Teinte « autres » en `bg-primary/15` et non `bg-accent/20` de la maquette : `check-valeurs-arbitraires-app` réserve l'accent aux badges *featured*. La table des cases est déclarée dans `TABLES_DE_TONS_CONNUES` (`scripts/check-status-badge-unique.mjs`) : c'est l'occupation d'une nuit, pas un statut.
- Feuille de refus : « Message à {prénom} », aide « Le motif lui est transmis avec ce message. » ; envoie `reason` (motif en mots + message, ce qui reste écrit sur la réservation), `reason_code` (pastille → `BookingRejectionReason`, table `CODE_DU_MOTIF`) et `message` (borné à 500, la borne de l'API). Clé `refuser.precision` retirée.
- Feuille de paiement : types Acompte, Solde, Caution, Autre (ordre de la maquette), puis Frais ; « Autre » exige une note (refine zod, clé `validation.booking.notesRequiredForOther` ; l'API la juge aussi).
- **Garde rouge corrigée** : `traducteurs-de-messages.test.ts` rougissait sur `FeuilleDeContreOffre.tsx` (TCK-2876 appelait `msgValidation` hors de `lib/schemas/`) : schéma déplacé en `contreOffreSchema` dans `lib/schemas/booking.ts`.

**Tests** : `BookingDetail.sejour.tck-2877.test.tsx` (neuf, 12), `feuilles.tck-2594.test.tsx` (refus, paiement, plafond) ; tous les `BookingDetail.*` et `feuilles/*` verts (106 + 59). Ablations une à une (heure par défaut, `canRefundStay`, `reason_code`, exclusion de la caution, plafond, refine « Autre », nuits en attente) : chacune rougit son test, fichier restauré au md5.

**Non mesuré (navigateur interdit par le brief du lot)** : AC5 (« Payer en ligne » sur le solde : `GesteDuPaiement` le rend sur toute ligne `pending`, et `CustomerPayCta` crée la ligne du solde côté client — inchangé), AC6 (les trois feuilles passent par `FeuilleOuPanneau`, feuille du bas sous 80 rem), AC7 (bloc et avertissement « déjà reversé » inchangés, couverts par `feuilles.tck-2594`), AC-F1/F2.

