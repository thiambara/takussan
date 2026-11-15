---
id: TCK-2876
title: "Réservations, offre : « Contre-proposer » (barre, en-tête, carte Décision), financement, délai de signature, conditions, et « · N visites · première offre reçue »"
status: todo
phase: P1
family: front
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2870, TCK-2873]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#5-booking"
tags: [front, bookings, offre, audit-maquettes-2026-11-15]
---

## Objectif utilisateur

Devant une offre d'achat, l'agent voit comment l'acheteur paie, en combien de temps il signe et sous quelles conditions, et peut répondre par un autre prix au lieu de refuser.

## Contexte

Audit des maquettes de `/app` du 2026-11-15, famille commerciale (`audit-f5-commercial.md`, app-reservations e4). Données et route : TCK-2870 (financement, délai, conditions), TCK-2873 (contre-offre), [ADR-0110](../../../adr/0110-la-candidature-et-l-offre-portent-leurs-conditions-et-leur-dossier.md) § 1 et 5.

## Contrat de données

- `GET /api/bookings/{booking}` : `financing`, `signature_within_days`, `conditions`, `counter_offer`, `awaiting`, `property_visits_count`, `offer_rank` (TCK-2870, TCK-2873).
- `POST /api/bookings/{booking}/counter-offers` (TCK-2873).

## Direction UX / Artistique

**Référence de fidélité** : maquette `app-reservations`, approche **a**, écran **e4 Offre** — fichier `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-reservations-a.tsx` (l. 128-134 Quoi de l'offre ; l. 518 barre du téléphone ; l. 980, 1018 en-tête et carte Décision du bureau).

- **Téléphone (390)** — manque : « Contre-proposer » dans la barre collante (avec Refuser / Accepter) ; dans Quoi, « Financement », « Délai de signature », « Conditions » ; après « En vente depuis N jours », « · N visites · première offre reçue ».
- **Bureau (1440)** — manque : « Contre-proposer » dans l'en-tête et comme 3ᵉ bouton de la carte « Décision » ; les mêmes lignes du Quoi.
- La feuille « Contre-proposer » n'est pas dessinée : elle reprend la grammaire des feuilles de la fiche (feuille du bas au téléphone, panneau droit dès `xl`) — montant (prérempli du prix affiché), message facultatif, validité (défaut 3 jours), bouton « Contre-proposer {montant} ». Une contre-offre en cours se lit en tête du Quoi (« Contre-offre de 90 000 000 F envoyée · en attente de {prénom} jusqu'au … ») et remplace « Contre-proposer » par « Modifier la contre-offre ».

## Contraintes strictes (métier)

- [ADR-0110](../../../adr/0110-la-candidature-et-l-offre-portent-leurs-conditions-et-leur-dossier.md) § 5 ; « Contre-proposer » n'existe que sur une offre `pending`, sous la capacité qui permet Accepter.
- « · N visites » = `property_visits_count` (visites du bien, tous visiteurs) ; « première offre reçue » quand `offer_rank = 1`, sinon « {rang}ᵉ offre reçue ».
- i18n `fr`/`en`/`wo` ; libellés du financement par code (`cash` → « Comptant », `mortgage` → « Crédit immobilier », `mixed` → « Apport et crédit »).

## Delta à produire

- [ ] Lignes Financement / Délai de signature / Conditions.
- [ ] Geste « Contre-proposer » (barre, en-tête, carte Décision) et sa feuille.
- [ ] État « contre-offre en cours » en tête du Quoi et dans l'historique.
- [ ] Complément « · N visites · première offre reçue ».
- [ ] Tests de composant : présence du geste sur une offre `pending`, absence sur une candidature ; envoi du montant ; état en cours ; libellé du financement.

## Critères d'acceptation

- [ ] AC1 — À 390, une offre `pending` montre « Contre-proposer » entre Refuser et Accepter ; une candidature ne le montre pas.
- [ ] AC2 — Contre-proposer 90 000 000 F appelle la route avec ce montant ; la fiche montre ensuite « Contre-offre de 90 000 000 F envoyée » et « en attente de {prénom} ».
- [ ] AC3 — Une offre `financing = cash`, `signature_within_days = 30`, `conditions = "Aucune"` montre « Financement Comptant », « Délai de signature 30 jours », « Conditions Aucune ».
- [ ] AC4 — À 1440, la carte « Décision » de l'offre a trois boutons : Refuser, Contre-proposer, Accepter {montant}.

**Fidélité** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [ ] AC-F1 — Fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2876.json` : écran e4 de `app-reservations` (a), téléphone et bureau.
- [ ] AC-F2 — `fidelite compare` à 390 × 844 et 1440 × 900 sans écart non expliqué ; la feuille de contre-offre, non dessinée, est déclarée « hors maquette » avec son motif.

## Hors périmètre

- La réponse du client à la contre-offre (TCK-2879).

## Notes d'implémentation

_(à remplir par implementing-specs)_
