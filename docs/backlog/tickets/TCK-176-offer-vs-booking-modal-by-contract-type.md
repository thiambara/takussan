---
id: TCK-176
title: Fiche bien — modale différenciée Réserver (location) vs Faire une offre (vente)
status: todo
phase: P1
family: front
estimate: M
created: 2026-05-05
updated: 2026-05-05
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#13-réservations-courte-durée--visites
    - docs/features.md#14-location-longue-durée-baux
  models:
    - docs/models-spec.md#5-booking
tags: [front, bookings, sales]
---

## Objectif utilisateur

Sur la fiche d'un bien à vendre, le formulaire qui s'ouvre derrière « Faire une offre » doit demander un montant et un délai de validité — pas des dates de séjour et un nombre d'invités comme aujourd'hui.

## Contrat de données

Smoke test 2026-05-05 (TC-LOC-11) :

- Sur un bien `À vendre` (ex. `appartement-f2-a-ouakam-vzlk1z`), le bouton `Faire une offre` ouvre une modale dont la description est : « Précisez vos dates et le nombre d'invités. Le propriétaire confirmera votre demande. ». Champs : `Arrivée`, `Départ`, `Invités` (1–20), `Message`.
- La submit POST `["slug",{"start_date":"2026-06-10","end_date":"2026-06-15","guests":1}]` réussit (200 `{ok:true}`) et crée une `bookings` avec `total_amount = property.price` et des dates aberrantes — comme si on réservait un Airbnb pour 5 jours sur un bien à 121M FCFA.
- C'est la **même modale** que pour la location courte ; seul le libellé du bouton change.

Spec attendue (TC-LOC-11) : pour une **vente**, le formulaire doit collecter `montant proposé`, `montant d'acompte`, `caution`, `délai de validité de l'offre`, `acceptation des CGU`. Pour une **location courte** : conserver l'existant (dates + invités).

## Direction UX / Artistique

- La modale de vente est plus sobre : un seul champ « Montant proposé » mis en avant, un sub-text qui rappelle le prix d'affichage (`121 000 000 F CFA` en exemple), un champ « Validité de l'offre » (date), une checkbox CGU, un bouton `Envoyer l'offre`.
- La modale de location courte garde son intitulé et ses champs actuels (`Arrivée`, `Départ`, `Invités`, `Message`).
- Dans les deux cas, le titre de la modale et la description doivent être adaptés au contrat.

## Contraintes strictes (métier)

- Le mapping côté backend doit accepter un `offer_amount` et un `offer_expires_at` sur `bookings` (ou via metadata) sans casser le flow location.
- Sur une vente, ne **jamais** envoyer `start_date`/`end_date`/`guests`.
- La `bookings.total_amount` reflète le `offer_amount` du customer (pas le prix d'affichage du bien) ; le statut reste `pending` jusqu'à confirmation propriétaire.
- L'acceptation des CGU est obligatoire avant submit.

## Delta à produire

- [ ] Frontend : duplique/factorise le composant modal en deux variants (`BookingRequestDialog` pour location, `OfferRequestDialog` pour vente) ou un composant unique paramétré par `contract_type`.
- [ ] Frontend : sur une vente, render `OfferRequestDialog` quand on clique `Faire une offre` ; payload server action = `{ offer_amount, offer_expires_at, message }`.
- [ ] Frontend : checkbox CGU obligatoire (lien vers la page légale qui sera créée séparément — placeholder href OK pour ce ticket).
- [ ] Backend : étendre le `StoreBookingRequest` pour valider conditionnellement selon le `contract_type` du `Property` ciblé : `offer_amount` + `offer_expires_at` requis pour une vente, `start_date`/`end_date` requis pour une location courte.
- [ ] Backend : populer `total_amount` depuis `offer_amount` côté vente.
- [ ] Tests : 2 scénarios FormRequest, 2 scénarios Feature (création vente OK + création location courte OK), 1 scénario UI (modale rendue avec les bons champs selon `contract_type`).

## Critères d'acceptation

- [ ] Sur un bien `À vendre` : la modale `Faire une offre` ne contient ni champ Dates ni champ Invités ; soumettre crée une booking avec `total_amount = offer_amount`, `start_date` / `end_date` à `NULL` (ou métadata).
- [ ] Sur un bien `À louer` (location courte) : modale inchangée, comportement actuel préservé.
- [ ] Sur un bien `À louer` (location longue / `Postuler`) : pas de régression — le CTA `Postuler` reste comme défini par TCK-165.
- [ ] Aucune `bookings.start_date`/`end_date` n'est créée sur une vente.

## Hors périmètre

- Acceptation/refus côté agent ou propriétaire (workflow existant).
- Génération du contrat de vente PDF (hors scope — V2).
- Page `/legal/cgu` (couverte par un autre ticket — ici simple lien).

## Notes d'implémentation

_(à remplir par implementing-specs)_
