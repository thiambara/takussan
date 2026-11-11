---
id: TCK-2580
title: "Saisir une candidature ou une offre pour un client, depuis une visite, une fiche client ou les réservations"
status: done
phase: P0
family: front
estimate: M
wave: 89
created: 2026-11-10
updated: 2026-11-11
depends_on: [TCK-2579, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691]
blocks: [TCK-2581, TCK-2594]
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#5-booking"
tags: [front, bookings, crm, mobile, audit-ux, app, p0]
---

## Objectif utilisateur

L'agent enregistre en une feuille ce que le client lui a dit de vive voix — sa candidature ou son offre —, sans rechercher à nouveau ni le client ni le bien, et sait que le client en sera prévenu.

## Contrat de données

- `POST /api/bookings` avec `kind` (`application` | `offer`), `property_id`, `customer_id`, `start_date` (entrée), `total_amount`, `offer_expires_at`, `notes` (TCK-2579).
- Recherche du bien : la recherche de biens de la console déjà utilisée par la planification de visite ; recherche du client : `GET /api/customers?filter[search]=` avec `fields[customers]`.
- La nature se déduit du bien choisi (`contract_type`, `rent_period`) ; le loyer ou le prix affiché sert de valeur par défaut.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-reservations&a=a` — écran « Saisir une offre » (feuille « Saisir une demande »), et `?p=app-fil-commercial&a=a` — écran « Et maintenant ? » (ligne « Saisir sa candidature maintenant ») ; **référence de fidélité, non versionnée**, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
- Ordre : Client (prérempli, « Changer ») · Bien (prérempli, une seule recherche) · Nature en segmenté Candidature / Offre d'achat, la nature du bien sélectionnée et l'autre désactivée avec sa raison (« Ce bien est à louer : la demande est une candidature ») · montants (Loyer proposé + Date d'entrée, ou Montant offert + Valable jusqu'au, avec l'écart au prix affiché « −10,5 % ») · Message · encart « Le client sera prévenu et pourra annuler » (la maquette dit « … compléter son dossier » : aucun dossier n'existe en base, le texte dit ce qui est vrai).
- Bouton qui dit la nature : « Enregistrer la candidature » / « Enregistrer l'offre ».
- Succès : toast, puis la réservation créée s'ouvre (ou, depuis une visite, retour à « Et maintenant ? » avec la ligne cochée).
- **Téléphone (360-390 px)** : feuille plein écran, bouton collant au-dessus de la zone sûre, cibles ≥ 44 px, clavier numérique pour les montants. **Bureau (≥ 1280 px)** : panneau latéral droit de 480 px par-dessus la page d'origine. Entre `md` et `lg`, le panneau garde la largeur du téléphone (`md` n'est pas le bureau).

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0102](../../../adr/0102-une-reservation-porte-sa-nature.md).
- Trois points d'entrée, chacun prérempli : la suite d'une visite terminée (client **et** bien de la visite), la fiche client (client), la page Réservations (rien).
- Visible pour le personnel de l'agence seulement ; le bailleur et le client ne voient jamais l'entrée.
- Les erreurs 422 de TCK-2579 (`booking.customer_required`, `booking.kind_mismatch`, montant) s'affichent sur leur champ.
- Montants en F CFA, séparateur de milliers visible (police comprise : l'audit a relevé U+202F non dessiné en `font-semibold`), saisie sans décimales.
- i18n : tout libellé neuf en `fr`/`en`/`wo` (`wo` = texte français tel quel) ; vouvoiement.

## Delta à produire

- [ ] Feuille / panneau « Saisir une candidature ou une offre », avec ses trois entrées préremplies.
- [ ] Entrée « Saisir une candidature ou une offre » dans l'en-tête de la page Réservations et dans les gestes de la fiche client.
- [ ] Tests : nature déduite et l'autre désactivée ; corps envoyé pour une candidature et pour une offre (vérifié sur la requête) ; erreurs 422 sur le bon champ ; entrée absente pour un bailleur.

## Critères d'acceptation

- [ ] AC1 — Depuis une visite terminée du studio de Mermoz (à louer, 250 000 F/mois) avec Bineta Ndoye, la feuille s'ouvre avec Bineta et le studio déjà posés, « Candidature » sélectionnée, « Offre d'achat » désactivée ; l'envoi poste `kind=application`, `customer_id` de Bineta, `property_id` du studio, `total_amount=250000`.
- [ ] AC2 — Sur une villa à vendre affichée 95 000 000 F, saisir 85 000 000 affiche « −10,5 % » et poste `kind=offer`, `total_amount=85000000`.
- [ ] AC3 — À 360 px, le bouton « Enregistrer … » reste visible clavier ouvert ; à 1280 px, le panneau ne recouvre pas la colonne de navigation.
- [ ] AC4 — Connecté en bailleur, ni la page Réservations ni la fiche client n'offrent l'entrée (DOM).

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2580.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- Les pièces du dossier, le garant (« Compléter mon dossier » côté client).
- La décision sur la demande (accepter, refuser) : TCK-2594.

## Notes d'implémentation

_(à remplir par implementing-specs)_
