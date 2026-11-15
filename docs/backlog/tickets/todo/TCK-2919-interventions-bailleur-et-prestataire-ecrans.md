---
id: TCK-2919
title: "Interventions du bailleur et du prestataire : « Depuis janvier » et les devis consultés chez le bailleur ; « À facturer », « Facturer », le calendrier et le relevé des factures chez le prestataire"
status: todo
phase: P2
family: front
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: [TCK-2911]
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#21-maintenancerequest-"
    - "docs/models-spec.md#77-serviceproviderbill-"
tags: [front, interventions, bailleur, prestataire, factures, audit-ux, app]
---

## Objectif utilisateur

Le bailleur lit ce que les interventions lui ont coûté depuis janvier et voit les devis que l'agence a comparés ; le prestataire facture ce qu'il a terminé, voit sa semaine en calendrier et télécharge le relevé de ses factures.

## Contrat de données

- Bilan `GET /api/owner/maintenance-summary`, `quote_alternatives[]`, factures `draft` + `POST …/submit`, relevé `GET service-provider-bills/statement/pdf` : TCK-2911.
- Calendrier : `GET /api/calendar` rend déjà les interventions assignées (`CalendarEventCollector`) — et la page `/app/calendar` existe.

Audit (`audit-f4-patrimoine.md`, app-interventions) :

- **e6** (bailleur, téléphone et bureau) : bloc « Depuis janvier » (Interventions 12 dont 9 closes · « À votre charge » · « Par bien » / « Historique par bien ») absent ; mise en concurrence (« a consulté deux autres artisans ») absente.
- **e7** (prestataire) : « À facturer · 2 » et le geste « Facturer » absents ; « Relevé de mes factures » (bureau) et « Calendrier » (téléphone) absents. Fiche `TCK-2654.json` a-7.

## Direction UX / Artistique

**Référence de fidélité** : page `app-interventions`, approche `a`, fichier `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-interventions-autres.tsx` :

- **e6 « Bailleur — devis à approuver »** :
  - téléphone (l. 480-500) : bloc « Depuis janvier », action « Par bien », chiffres « Interventions 12 — dont 9 closes » et « À votre charge 1 521 000 F — déduit de vos revenus » ;
  - bureau (l. 503-530) : même bloc, action « Historique par bien » ;
  - téléphone et bureau, dans la carte du devis (l. 436) : « Au-dessus de 150 000 F, votre mandat prévoit votre accord. Dakar Immo a consulté deux autres artisans (520 000 F et 610 000 F) et recommande ce devis. »
- **e7 « Prestataire — Ma semaine »** :
  - téléphone (l. 650-695) : action « Calendrier » sur « Cette semaine » (l. 661), section « À facturer · 2 » avec « Facturer » par ligne (`AFacturer`, l. 596-620) ;
  - bureau (l. 745-800) : sous-titre « … — 1 à accepter, 2 prévues, 2 à facturer », bouton « Relevé de mes factures » en tête, section « À facturer · 2 ».

## Contraintes strictes (métier)

- « Par bien » / « Historique par bien » ouvrent le détail `by_property` (feuille au téléphone, panneau au bureau), chaque bien menant à son historique d'interventions.
- La phrase de mise en concurrence n'est rendue que si `quote_alternatives` est non vide ; elle cite les montants servis.
- « Facturer » ouvre la saisie du montant final (prérempli du devis approuvé) et de la pièce, puis envoie `submit` ; la ligne quitte « À facturer ».
- « Relevé de mes factures » propose la période (mois courant par défaut).
- Libellés neufs en `fr`/`en`/`wo`, `wo` = le texte français tel quel.

## Delta à produire

- [ ] Bailleur : bloc « Depuis janvier » + détail par bien ; phrase de mise en concurrence dans la carte du devis.
- [ ] Prestataire : « À facturer » + « Facturer » ; « Calendrier » (téléphone) vers le calendrier ; « Relevé de mes factures » (bureau) ; sous-titre compté.
- [ ] Fiche de fidélité `TCK-2654.json` (a-7 et le bloc bailleur levés) ; docblock de `InterventionsDuBailleur`.
- [ ] Tests : bloc rendu depuis la réponse ; « dont 9 closes » ; phrase des devis concurrents présente/absente ; « Facturer » → `POST …/submit` ; « Relevé » → `…/statement/pdf` avec la période ; « Calendrier » → `/app/calendar`.

## Critères d'acceptation

- [ ] AC1 — Avec `{total: 12, closed: 9, charged_amount: 1521000}`, le bailleur voit « Depuis janvier », « 12 », « dont 9 closes » et « 1 521 000 F » à 390 et à 1440 ; « Par bien » (téléphone) / « Historique par bien » (bureau) ouvre la liste des biens avec leurs chiffres.
- [ ] AC2 — Une demande avec deux devis concurrents de 520 000 F et 610 000 F rend la phrase « … a consulté deux autres artisans (520 000 F et 610 000 F) … » ; sans devis concurrent, la phrase s'arrête au seuil du mandat.
- [ ] AC3 — Le prestataire avec 2 factures `draft` voit « À facturer · 2 » ; « Facturer » sur l'une envoie `POST /api/service-provider-bills/{id}/submit` avec le montant saisi, et la section passe à « À facturer · 1 ».
- [ ] AC4 — À 390, « Cette semaine » porte l'action « Calendrier » qui mène au calendrier filtré sur ses interventions ; à 1440, « Relevé de mes factures » télécharge le relevé de la période choisie.
- [ ] AC5 — Le sous-titre du bureau compte « n à accepter, n prévues, n à facturer » depuis les données servies.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)) — fiche : `docs/qa/audit-ux-2026-11/fidelite/TCK-2654.json` (écrans e6, e7) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2654.json` (écrans e6, e7) liste chaque écran de maquette implémenté par ce ticket (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés ; les écarts que ce ticket lève en sont retirés.
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'ADR-0106 § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif (une des trois exceptions d'ADR-0106 § 2, ou une donnée).
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une, sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- L'agence et le locataire (TCK-2918).

## Notes d'implémentation

_(à remplir par implementing-specs)_
