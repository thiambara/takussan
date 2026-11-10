---
id: TCK-2660
title: "Impayés : relancer sur WhatsApp avec le lien de paiement de l'échéance"
status: todo
phase: P1
family: front
estimate: M
wave: 90
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2657, TCK-2658]
blocks: [TCK-2624, TCK-2682]
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#84-leasepaymentlink-"
tags: [front, finances, relance, whatsapp, mobile, audit-ux, app]
---

## Objectif utilisateur

L'admin qui voit un loyer en retard relance le locataire en deux touches, sur WhatsApp, avec le montant et le lien pour payer, et sait qui a déjà relancé.

## Contrat de données

- Impayés par échéance : `GET /api/payments/history` avec `filter[status]=late,partially_paid`, `filter[days_late_min|max]`, tri `-days_late`, `include=payer,property,landlord,reminders` (TCK-2657, TCK-2658).
- Groupements existants : `GET /api/agencies/{agency}/finance/aging?group_by=tenant|landlord`.
- Lien de paiement : `POST /api/lease-payments/{payment}/payment-link` → `{url, expires_at}` (409 si l'échéance n'est plus payable).
- Relance : `POST /api/lease-payments/{payment}/reminders {channel: whatsapp|call}` et `GET …/reminders` (TCK-2658).
- Encaissement manuel existant : `POST /api/lease-payments/{payment}/mark-paid`.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-argent&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « Impayés et relance » et « Relancer (feuille, panneau) », téléphone et bureau.
- **Téléphone** : total dû et cautions détenues, bascule « Par locataire / Par bailleur », pastilles de retard (Tous · Plus de 30 j · 8–30 j · Moins de 8 j) ; une carte par impayé (locataire, bien, montant, « en retard de 34 j », dernière relance) avec deux boutons pleine largeur : « Relancer sur WhatsApp » (primaire) et « Appeler ». « Relancer » ouvre une feuille : montant, période et retard ; le message prérempli, modifiable ; le lien de paiement de l'échéance, à copier ; la dernière relance ; « Ouvrir WhatsApp ».
- **Bureau** : tableau Locataire · Bien · Bailleur · Montant dû · Retard · Dernière relance · actions, trié par retard ; un clic sur une ligne ouvre un panneau latéral « dossier de l'impayé » : échéances dues, pénalité, caution détenue, lien de paiement, historique des relances (manuelles et automatiques), « Appeler », « Encaisser un paiement », « Relancer ».
- Le message est au vouvoiement : « Bonjour {prénom}, le loyer de {mois} ({montant}) du {bien} reste à régler depuis le {date}. Vous pouvez le payer en ligne ici : {lien} ». Il ne nomme un moyen de paiement que s'il est proposé sur le lien.
- `md` n'est pas le bureau : le panneau latéral et le tableau commencent à `lg`.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0105](../../../adr/0105-la-relance-d-un-impaye-part-du-telephone-de-l-agence.md).
- Décision 13 (a) : la relance part **du WhatsApp de l'admin** (`https://wa.me/<numéro E.164 sans « + »>?text=<message encodé>`), Takussan n'envoie rien. L'ouverture de WhatsApp enregistre la relance (`channel: whatsapp`) ; « Appeler » (`tel:`) enregistre `channel: call`.
- Sans numéro de téléphone du locataire, « Relancer sur WhatsApp » est désactivé **avec sa raison à côté** (« Aucun numéro pour ce locataire ») et un lien vers la fiche client.
- Le lien de paiement est celui de l'échéance (TCK-602) ; un 409 dit que l'échéance ne se paie plus en ligne, sans ouvrir WhatsApp.
- N'afficher aucun « Lu le … » : rien ne le mesure (la maquette l'imagine).
- **Un seul composant Impayés** (décision du porteur du 2026-11-10, point 14 a) : l'onglet Impayés de Rapports (TCK-2629) et l'écran Impayés d'« Argent » (TCK-2660) sont **le même composant**, mêmes données, mêmes filtres, même relance unitaire et en lot (TCK-2682) — pas deux écrans qui se ressemblent. Ce qui diffère (en-tête, place dans la page) passe par ses propriétés. Ce ticket l'écrit ; TCK-2629 le monte dans Rapports.
- Fonctions existantes à garder (`OverduePaymentsTable`) : regroupement par locataire et par bailleur, tranches de retard, total, cautions détenues, lien vers la fiche client.
- i18n `fr` / `en` / `wo` (`wo` = texte français) ; montants via `useFormatteurs()`.

## Delta à produire

- [ ] Liste des impayés par échéance, mobile en cartes, bureau en tableau, pastilles de retard filtrées côté serveur.
- [ ] Feuille / panneau de relance : message prérempli et modifiable, lien de paiement, ouverture de WhatsApp, enregistrement de la relance.
- [ ] Panneau « dossier de l'impayé » au bureau, avec l'historique des relances.
- [ ] Tests : URL `wa.me` construite (numéro, texte encodé, lien de l'API) ; relance enregistrée ; bouton désactivé et sa raison sans numéro ; 409 du lien.

## Critères d'acceptation

- [ ] AC1 — « Ouvrir WhatsApp » ouvre `https://wa.me/221771234567?text=…` dont le texte décodé contient l'URL rendue par `POST …/payment-link` (vue au réseau), et un `POST …/reminders` part avec `channel: whatsapp` ; la carte affiche « relancé aujourd'hui » sans rechargement.
- [ ] AC2 — Une échéance payée n'a pas de bouton « Relancer ».
- [ ] AC3 — La pastille « Plus de 30 j » envoie `filter[days_late_min]=31` et le nombre de cartes égale `meta.total` de la réponse.
- [ ] AC4 — À 360 px, les deux boutons d'une carte mesurent au moins 44 px de haut et la carte ne déborde pas.
- [ ] AC5 — La chaîne « Lu le » n'apparaît nulle part dans le DOM de la page.
- [ ] AC6 — Avec un locataire sans téléphone, le bouton WhatsApp est désactivé et `aria-describedby` pointe vers la phrase qui dit pourquoi.

## Hors périmètre

- La relance en lot (« Relancer la sélection » de la maquette) : **dans le lot** (décision du porteur du 2026-11-10), portée par TCK-2682 comme une file guidée ([ADR-0105](../../../adr/0105-la-relance-d-un-impaye-part-du-telephone-de-l-agence.md), amendement du 2026-11-10).
- La relance par SMS ou e-mail envoyée par Takussan (options b et c de la décision 13).
- Les relances automatiques graduées réglées par l'agence (ambition de l'audit).

## Notes d'implémentation

_(à remplir par implementing-specs)_
