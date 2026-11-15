---
id: TCK-2916
title: "Paiements : « Tout télécharger » l'historique du locataire, et les revenus du bailleur complets (prochain versement et compte, règle de versement, relances, bail et photo par bien, avis et moyen des versements, compteur)"
status: todo
phase: P2
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2909, TCK-2915]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#15-leasepayment-"
    - "docs/models-spec.md#28-payout-"
tags: [front, paiements, locataire, bailleur, quittances, audit-ux, app]
---

## Objectif utilisateur

Le locataire récupère toutes ses quittances d'un toucher ; le bailleur lit sur « Loyers » quand et sur quel compte part son argent, pourquoi un loyer manque (et que l'agence a relancé), et télécharge l'avis de chaque versement.

## Contrat de données

- Archive `receipts:all` (et l'archive préparée), compte masqué de `next_payout`, moyen et nature des reversements, `payouts_count`, `lease_reference` / `photo_url` / `reminders[]` par bien, règle de versement : TCK-2915.
- Avis de versement PDF : `GET /api/payouts/{id}/notice/pdf` (TCK-2909).

Audit (`audit-f4-patrimoine.md`, app-paiements) :

- **e0** et **e2** (locataire, téléphone et bureau) : « Tout télécharger » (tél.) / « Tout télécharger (.zip) » (bureau) de l'Historique absent — absent aussi de la fiche `TCK-2650.json` (écart silencieux).
- **e4** (bailleur, téléphone et bureau) : « Prochain versement prévu le … par virement » + compte (rendu seulement si `next_payout` servi — à vérifier au navigateur) ; règle « Le versement part le 15… » ; note de relance d'un bien en retard ; « Bail LS-… » et photo par bien ; « Avis » téléchargeable d'un versement + moyen ; compteur de l'onglet Versements. Fiche `TCK-2651.json` a-4.

## Direction UX / Artistique

**Référence de fidélité** : page `app-paiements`, approche `a` :

- **e0 « Locataire — quelque chose est dû »** et **e2 « Locataire — à jour »** — `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-paiements-locataire.tsx` l. 209 (téléphone : action « Tout télécharger » du titre « Historique ») et l. 243 (bureau : « Tout télécharger (.zip) »).
- **e4 « Bailleur — Mes revenus »** — `app-paiements-bailleur.tsx` :
  - tête « Reste à vous verser » : « Prochain versement prévu le 15 nov. par virement — CBAO ••• 4521 · le relevé PDF est joint à la notification » (l. 17-31) ;
  - la règle « Le versement part le 15 de chaque mois pour ce qui est encaissé. Un loyer reçu après cette date rejoint le versement suivant. » (l. 188) ;
  - la note de relance d'un bien en retard : téléphone (l. 130) « Garage Ouest Foire : relancé par Dakar Immo le 8 nov. … », bureau (l. 243) avec chaque relance et son canal ;
  - par bien : vignette photo et « Bail LS-… » (l. 195-215) ;
  - derniers versements : moyen · référence (l. 256) et le geste « Avis » (l. 263) ;
  - onglet « Versements (3) » (l. 15).

## Contraintes strictes (métier)

- « Tout télécharger » : archive préparée quand le volume l'exige (parcours existant du coffre, TCK-2812), jamais un ZIP construit dans le navigateur.
- Le jour de versement affiché est celui servi (mandat, sinon agence) — jamais « 15 » écrit en dur.
- Aucune note interne de relance n'est affichée (l'API ne la sert pas au bailleur).
- La ligne « Reste à vous verser » en pied de la ventilation n'est **pas** ajoutée : ADR-0100, amendement du 2026-11-12 § 7, validé par le porteur (voir le rapport des manques non ticketés).
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel.

## Delta à produire

- [ ] Historique du locataire : « Tout télécharger » (tél.) / « Tout télécharger (.zip) » (bureau).
- [ ] Revenus du bailleur : compte du prochain versement, règle, relances, bail et photo par bien, moyen et « Avis » des versements, compteur de l'onglet.
- [ ] Fiches de fidélité `TCK-2650.json` (l'écart silencieux y est écrit puis levé) et `TCK-2651.json` (a-4 levé).
- [ ] Tests : « Tout télécharger » appelle l'archive `receipts:all` ; relances rendues depuis `reminders[]` ; « Avis » vers `…/notice/pdf` ; « Versements (3) » ; règle avec `payout_day = 10` → « le 10 ».

## Critères d'acceptation

- [ ] AC1 — À 390, le titre « Historique » du locataire porte « Tout télécharger » ; à 1440, « Tout télécharger (.zip) » ; le geste demande l'archive `receipts:all` et le téléchargement démarre (ou l'état de préparation s'affiche).
- [ ] AC2 — Avec `next_payout = {scheduled_at: 2026-11-15, payment_method: bank_transfer, payout_method_masked: "CBAO ••• 4521"}`, la tête rend « Prochain versement prévu le 15 nov. par virement » et « CBAO ••• 4521 ».
- [ ] AC3 — Avec un jour de versement servi à 10, la règle dit « Le versement part le 10 de chaque mois… ».
- [ ] AC4 — Un bien en retard dont `reminders` porte une relance SMS du 8 nov. rend « relancé par <agence> le 8 nov. » (téléphone) et la liste des relances avec leur canal (bureau).
- [ ] AC5 — Chaque ligne par bien rend sa vignette et « Bail LS-… ».
- [ ] AC6 — Chaque versement rend son moyen et un bouton « Avis » qui télécharge `GET /api/payouts/{id}/notice/pdf` ; l'onglet rend « Versements (n) » depuis `payouts_count`.
- [ ] AC7 — Vérifier au navigateur, sur un bailleur avec un versement programmé, que la ligne « Prochain versement » apparaît ; corriger si absente.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)) — fiches : `docs/qa/audit-ux-2026-11/fidelite/TCK-2650.json` et `TCK-2651.json` :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2650.json` et `TCK-2651.json` liste chaque écran de maquette implémenté par ce ticket (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés ; les écarts que ce ticket lève en sont retirés.
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'ADR-0106 § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif (une des trois exceptions d'ADR-0106 § 2, ou une donnée).
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une, sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- Le titre « Loyers » au lieu de « Mes revenus » (ADR-0100 § 3, décision du porteur).
- La ligne « Reste à vous verser » en pied de ventilation (ADR-0100, amendement du 2026-11-12).

## Notes d'implémentation

_(à remplir par implementing-specs)_
