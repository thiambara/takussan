---
id: TCK-2594
title: "Réservations : un écran, trois natures — Séjours, Candidatures, Offres — chacune avec son vocabulaire, le client en tête et la suite en bas"
status: todo
phase: P1
family: front
estimate: L
wave: 89
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2579, TCK-2580, TCK-2593, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#5-booking"
    - "docs/models-spec.md#6-bookingpayment"
tags: [front, bookings, mobile, audit-ux, app]
---

## Objectif utilisateur

L'agent voit ce qu'il doit décider — un séjour, une candidature, une offre —, sait qui la porte, et passe à la suite (accepter, encaisser, créer le bail) sans chercher ; le client suit ses réservations dans ses mots.

## Contrat de données

- `GET /api/bookings` avec `filter[kind]`, `filter[status]`, `filter[managed_by]=me`, `filter[search]`, `filter[property_id]`, `filter[customer_id]`, `include=property,customer` (téléphone, `visits_on_property`), `fields[…]` (TCK-2579, TCK-2593) ; `GET /api/bookings/counts` (TCK-2593).
- Détail, décisions, paiements, reçus, remboursements : routes existantes de `BookingDetail.tsx`, `BookingPaymentDialog.tsx`, `BookingRefundPanel.tsx`.
- « Saisir une candidature ou une offre » : TCK-2580.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-reservations&a=a` — écrans « Liste », « Candidature », « Refuser (motif) », « Acceptée — créer le bail », « Offre », « Séjour », « Enregistrer un paiement », « Rembourser », « Client — mes réservations », « Vide — personnel », « Vide — client » ; **référence de fidélité, non versionnée**, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
- En tête, segmenté **Séjours · Candidatures · Offres** avec le nombre « à décider » de chacun ; puis les statuts en pastilles avec compteurs, **« À décider » en premier**, **Terminées** ajoutée ; interrupteur « Mes biens seulement » (`?only_mine=1`).
- La page ouvre sur « À décider » s'il n'est pas vide, sinon sur « Confirmées » (l'audit relève l'ouverture sur un onglet vide).
- Ligne : avatar et nom du client, bien, montant **dans le vocabulaire de la nature** (« 3 nuits · 165 000 F », « Loyer 250 000 F/mois », « Offre 85 000 000 F »), âge de la demande, statut.
- Détail en trois blocs : **Qui** (client, téléphone, Appeler, WhatsApp, Fiche, visites passées sur ce bien) ; **Quoi** (dates ou loyer et entrée ou prix offert et écart au prix affiché, acompte, message) ; **Suite** en barre collante (Refuser / Accepter ; une fois acceptée : « Créer le bail » pour une candidature, « Enregistrer un paiement » pour un séjour) ; Paiements et Historique en sections repliées.
- Offre : « Prix affiché 95 000 000 F · offre 85 000 000 F (−10,5 %) ».
- **Téléphone (360-390 px)** : feuilles basses pour Refuser, Enregistrer un paiement, Rembourser, Saisir ; cibles ≥ 44 px. **Bureau (≥ 1280 px)** : tableau Client · Bien · Montant · Statut · Reçue avec filtres Bien et Client ; détail en deux colonnes dès `lg` (dossier à gauche ; décision et historique à droite) — fin des cartes à 60 % vides et des actions isolées en haut à droite.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0102](../../../adr/0102-une-reservation-porte-sa-nature.md).

**Pas de régression** (`BookingsList.tsx`, `BookingDetail.tsx`, `BookingPaymentDialog.tsx`, `BookingRefundPanel.tsx`, audit § 5) :
- statuts dans `?status=` (En attente → « À décider », Confirmées, Refusées, Annulées, Expirées, **+ Terminées**), une page de 30 ; `?only_mine=1` et sa case décochable ;
- détail : référence, Dates / Créée le / Expire le (**« Expire le » seulement pour une demande en attente** — l'audit le relève sur une confirmée), Total / Acompte (Payé), message ;
- personnel, chacun sous sa capacité : Accepter, Refuser (motif), **Créer le bail** (candidature confirmée d'un bien à louer → `/app/leases/new?booking_id=`, P48.03), Enregistrer un paiement (montant, type, moyen, référence, notes), Annuler (motif) ;
- Paiements : date, type, moyen **en clair** (« Orange Money », pas `orange_money`), référence, montant, statut, « Payer en ligne », reçu PDF (libellé « Reçu », pas « Quittance », pour un acompte) ;
- Remboursement : état, « Rembourser » par paiement (montant, motif, avertissement si les fonds ont été reversés) ;
- Historique ;
- client : Payer l'acompte / le solde, Laisser un avis, Annuler ; « Mes réservations » (En cours, Terminées, Annulées) ;
- états vides distincts : personnel « Aucune demande à décider. » ; client « Vous n'avez pas encore réservé. » **avec** « Parcourir les biens » (l'audit relève que le personnel voit aujourd'hui le texte du client, et que le client n'a pas de bouton).
- Montants : séparateur de milliers **visible** dans toutes les graisses (l'audit relève « 491164 F CFA » en `font-semibold`, U+202F non dessiné : la correction doit tenir pour la police du total, vérifiée au navigateur).
- i18n `fr`/`en`/`wo` (`wo` = français) ; vouvoiement côté personnel comme côté client (décision 2).

## Delta à produire

- [ ] Liste à trois natures, compteurs, onglet Terminées, ouverture sur la bonne pastille, recherche et filtres.
- [ ] Détail Qui / Quoi / Suite par nature ; sections Paiements et Historique.
- [ ] Vues client ; états vides ; formats (moyen de paiement, montants, « Reçu »).
- [ ] Tests : nature → `filter[kind]` ; compteurs depuis `counts` (une requête) ; ouverture sur Confirmées quand À décider est vide ; « Expire le » absent d'une confirmée ; « Créer le bail » présent sur une candidature confirmée seulement ; moyen de paiement en clair ; vides distincts personnel / client.

## Critères d'acceptation

- [ ] AC1 — À 390 px, un agent ouvre la page : segmenté avec trois comptes, « À décider » sélectionné ; chaque ligne montre le nom du client.
- [ ] AC2 — La ligne de l'offre d'Ibrahima Sarr dit « Offre 85 000 000 F » et son détail « −10,5 % » sous le prix affiché.
- [ ] AC3 — Avec zéro demande en attente, la page s'ouvre sur « Confirmées » ; l'onglet « Terminées » liste les réservations `completed`.
- [ ] AC4 — À 1280 px, le total « 491 164 F » d'une réservation montre un espace visible entre 491 et 164 (mesure de largeur du rendu, pas du texte).
- [ ] AC5 — Connecté en client sans réservation : « Vous n'avez pas encore réservé. » et un lien « Parcourir les biens » vers la liste publique.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2594.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- Pièces du dossier, garant, rapport revenus / loyer, « Expire demain », contre-offre, calendrier des nuits du bien : montrés par la maquette, sans donnée ; à reprendre si la décision 2 bascule vers trois pages.
- La saisie (TCK-2580).

## Notes d'implémentation

_(à remplir par implementing-specs)_
