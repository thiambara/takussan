---
id: TCK-2662
title: "Commissions : le solde d'abord — « On vous doit » pour l'agent, un solde par agent pour l'admin"
status: todo
phase: P1
family: front
estimate: L
wave: 90
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2661]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#85-commissionentry-"
tags: [front, commissions, mobile, audit-ux, app]
---

## Objectif utilisateur

L'agent voit au téléphone combien on lui doit et ce qu'on lui a payé, bien par bien ; l'admin voit ce qu'il doit à chaque agent et le solde en un geste, avec une preuve.

## Contrat de données

- Lignes : `GET /api/commissions` avec `include=beneficiary,lease.property`, filtres `status`, `beneficiary_id`, `earned_*` / `paid_*` (TCK-2661).
- Agrégats : `GET /api/commissions/summary?year=&month=` (TCK-2661).
- Gestes : `POST /api/commissions/{id}/mark-paid`, `POST /api/commissions/settle`, `POST /api/commissions/{id}/cancel` avec leurs champs (TCK-2661).
- Relevé : `GET /api/export/commissions?from=&to=` (ouvert au bénéficiaire par TCK-2661).

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=app-commissions&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans « Vue agent », « Vue admin par agent », « Solder un agent », « Registre par ligne », « Annuler (motif) », téléphone et bureau.
- **Agent, téléphone** : titre « Mes commissions » ; carte « On vous doit » (montant, nombre de baux, plus ancienne) ; « Payé cette année » et « Relevé » ; pastilles Dues · Payées · Annulées · Toutes ; une carte par ligne : le bien (titre et quartier, jamais la référence du bail) en titre, le montant en premier, « 40 % de 725 000 F », le rôle, la date (« bail activé le 30 oct. », « payée le 5 sept. · Wave », « annulée · {motif} »).
- **Agent, bureau** : dès `lg`, deux colonnes — à gauche la carte et les derniers paiements reçus, à droite le tableau Bien · Rôle · Base · Taux · Montant · Statut · Date, filtres de statut et d'année.
- **Admin, téléphone** : « {total} dus à {n} agents · payé en {mois} » ; une carte par agent (montant dû, nombre de lignes, « Solder ») ; le toucher ouvre ses lignes.
- **Admin, bureau** : bascule « Par agent / Par ligne ». Par agent : Agent · Dû · Lignes · Payé ce mois · Payé dans l'année · Dernier paiement · « Solder », ligne de total. Par ligne : le registre, filtre par bénéficiaire, menu « … » par ligne : « Marquer payée » (date, moyen, référence), « Voir le bail », « Annuler la commission… ».
- **Solder** : plein écran au téléphone, dialogue large au bureau ; lignes dues cochées (on peut en décocher), total recalculé et collant en bas, moyen, date, référence ; bouton « Confirmer le paiement de {montant} ».
- **Annuler** : dialogue qui dit la conséquence (« ne pourra plus être payée, l'agent verra le motif »), motif obligatoire en liste, bouton destructif « Annuler {montant} », secondaire « Garder la commission ».

## Contraintes strictes (métier)

Fonctions existantes à garder (`commissions/page.tsx`, `CommissionsLedger.tsx`) :

- Accès de tout le personnel (`assertCanReachAgencyStaffArea`) ; l'agent voit ses lignes, l'admin toutes (l'API tranche) ; une même route, deux lectures selon ce que l'API rend.
- Filtre de statut dans l'URL ; totaux Reste dû, Payé, Annulé ; part en clair (« 40 % de 725 000 F CFA ») ; origine (négociateur / collaborateur) ; pagination ; état vide expliqué.
- « Marquer payée » et « Annuler » réservés à `payouts.approve` ; **plus jamais en un clic** : l'un demande date, moyen et référence, l'autre un motif et une confirmation.
- Le module reste masquable par l'agence (« Menu de l'équipe »).
- i18n `fr` / `en` / `wo` (`wo` = texte français), vouvoiement ; montants via `useFormatteurs()`.

## Delta à produire

- [ ] Vue agent (téléphone et bureau).
- [ ] Vue admin par agent, bascule vers le registre par ligne, menu « … ».
- [ ] Parcours « Solder », dialogue « Marquer payée », dialogue « Annuler » avec motif.
- [ ] Tests : vue choisie selon l'appelant ; solde envoyé avec les seules lignes cochées ; annulation impossible sans motif ; aucun geste visible sans `payouts.approve`.

## Critères d'acceptation

- [ ] AC1 — À 390 px, la carte « On vous doit » et la première ligne due sont visibles sans défiler, et le montant de chaque carte est à l'écran (aucun défilement horizontal).
- [ ] AC2 — Une ligne s'intitule par le bien (« Appartement 3 ch. · Mermoz ») ; la référence `LS-…` n'apparaît pas sur la carte.
- [ ] AC3 — Décocher une ligne sur trois dans « Solder » envoie `entry_ids` à deux éléments (vu au réseau) et le bouton annonce la somme des deux.
- [ ] AC4 — Le bouton « Annuler {montant} » reste inactif tant qu'aucun motif n'est choisi ; le motif « Autre » exige un texte.
- [ ] AC5 — Un admin sans `payouts.approve` ne voit ni « Solder », ni le menu « … ».
- [ ] AC6 — « Relevé » télécharge le fichier de l'agent connecté sans 403.

## Hors périmètre

- La mention du montant dû dans le menu de l'agent (« Mes commissions · 1 240 000 F à percevoir ») : coque, famille 3.
- Le relevé mensuel (approche B) et la prévision (approche C), non retenus.

## Notes d'implémentation

_(à remplir par implementing-specs)_
