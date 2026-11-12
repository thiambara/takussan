---
id: TCK-2651
title: "« Loyers » : le bailleur lit d'abord ce qui reste à lui verser, puis chaque bien, et les opérations sans identifiant technique"
status: todo
phase: P1
family: front
estimate: M
wave: 88
created: 2026-11-10
updated: 2026-11-12
depends_on: [TCK-2649, TCK-2684, TCK-2687, TCK-2688, TCK-2689, TCK-2691, TCK-2760]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#28-payout-"
    - "docs/models-spec.md#101-ownerstatementsnapshot-"
tags: [front, payments, payouts, owners, mobile, audit-ux, app]
---

## Objectif utilisateur

Le bailleur, souvent dans la diaspora, ouvre ses revenus et lit sans appeler l'agence :

- ce qui reste à lui verser, et quand ;
- comment son encaissé se décompose ;
- où en est chacun de ses biens ce mois-ci.

Il télécharge son relevé et son attestation annuelle.

## Contrat de données

- `GET /api/owner-statements?period=` avec `next_payout` et `properties[]` enrichi (TCK-2649), et **`balance.remaining_to_pay`**, le solde cumulé au jour (TCK-2760). Exports `/pdf` et `/csv`, existants.
- **Le reste à verser est le solde cumulé**, décidé par le porteur le 2026-11-12 ([ADR-0100](../../../adr/0100-une-page-paiements-par-public.md), amendement du 2026-11-12) : tout le net dû moins tout le versé, arrêté au jour, quel que soit le mois choisi. `totals.remaining_to_pay` est l'écart **du mois** (net du mois moins versé du mois). Sur la démo, il vaut le net du mois moins le versement du mois précédent (1305 reversements sur 1305 versés le mois suivant) : ce n'est pas ce que l'agence doit au bailleur.
- Le registre, les factures et les reversements : les endpoints existants de `PaymentsTabs`, inchangés.

## Direction UX / Artistique

- **Maquette de référence** : `/fr/playground/maquettes?p=app-paiements&a=a`.
  - C'est une **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
  - Écran « Bailleur — Mes revenus », au téléphone et au bureau.
- **Titre** : **« Loyers »** (décidé par le porteur le 2026-11-10, [ADR-0100](../../../adr/0100-une-page-paiements-par-public.md) § 3), le même mot que l'onglet et l'entrée de menu (TCK-2618), avec le sélecteur « Novembre 2026 ▾ » en français. La maquette titre « Mes revenus » : ce n'est pas une référence de libellé. « Mes revenus » ne subsiste qu'en carte de tête (« Ce qui vous revient en novembre »).
- **Carte de tête** : « Reste à vous verser », le montant (le solde cumulé au jour, qui ne change pas avec le mois choisi), puis « Prochain versement prévu le … par … » quand un reversement est programmé.
- **Ventilation** : Encaissé · Commission (taux) · Interventions · Déjà versé — **ceux du mois choisi**. Elle ne se soustrait pas en tête : « Reste à vous verser » n'est pas Net − Déjà versé du mois (ADR-0100, amendement du 2026-11-12, § 7).
- **Documents** : « Relevé PDF », « Attestation annuelle », et le CSV, gardé.
- **« Par bien »** : bien, locataire, loyer, état du mois (« Payé ✓ », « En retard de 6 j »).
- **« Toutes les opérations › »** : le registre actuel, où le bien et le locataire sont nommés.
- **Bureau (≥ 1280 px)** :
  - deux colonnes dès `lg` : le relevé à gauche, le tableau par bien à droite ;
  - onglets « Revenus · Versements · Factures · Opérations ».
- **Téléphone (360-390 px)** : le reste à verser et sa date dans le premier écran. Les onglets défilent avec un indice visible.

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0100](../../../adr/0100-une-page-paiements-par-public.md).

**Rien ne se perd** (audit famille 4, § 5, *Fonctions existantes* 4-6, lues dans `PaymentsTabs.tsx` et `OwnerStatementPanel.tsx`), pour le bailleur :

- registre filtrable (statut, du / au) ;
- factures et leur détail ;
- reversements et leur détail ;
- relevé au mois ou « Toute l'année (attestation annuelle) » : Encaissé, Commission, Interventions, Net, Déjà versé, pénalités dues ;
- **PDF et CSV** ;
- le rectificatif d'un relevé déjà envoyé (TCK-2321), tel qu'il est servi aujourd'hui.

Autres contraintes :

- **Le reste à verser est `balance.remaining_to_pay`**, jamais `totals.remaining_to_pay` (l'écart du mois), jamais une soustraction faite dans le front. Aucun écran de ce ticket n'affiche `totals.remaining_to_pay` sous un libellé « Reste à verser ».
- **Aucun identifiant technique visible** dans les quatre onglets :
  - pas de « #8 » pour un bailleur (`PayoutsTable.tsx:88`) ;
  - pas de « Bail #63 » ;
  - les filtres « Type d'entité » et « ID entité · Ex: 42 » disparaissent pour le bailleur, remplacés par bien et locataire nommés.
- **Sélecteur de mois** : un composant de l'application, jamais `<input type="month">`. Il affiche « Interventions 0 F », jamais « -0 F CFA ».
- **Décision famille 4 n° 4a** (une page par public) : `/app/payments` sert le locataire (TCK-2650) et le bailleur (ce ticket). Le personnel garde son accès actuel tant que la page Argent de la famille 6 n'a pas repris les factures, les reversements et les factures de prestataires. La redirection du personnel est portée par TCK-2677.
- **i18n** : `fr` / `en` / `wo` (le `wo` porte le texte français tel quel), vouvoiement, montants par `useFormatteurs()`.

## Delta à produire

- [ ] Page « Loyers » pour le profil bailleur : carte de tête, ventilation, documents, « Par bien ».
- [ ] Onglets « Revenus · Versements · Factures · Opérations ». Le registre sans identifiants techniques.
- [ ] Sélecteur de mois localisé.
- [ ] Tests :
  - reste à verser lu sur `balance`, avec une réponse où `balance.remaining_to_pay` ≠ `totals.remaining_to_pay` ;
  - « Par bien » égal à `properties[]` ;
  - aucun « #n » ni « ID entité » rendu ;
  - mois localisé ;
  - exports présents.

## Critères d'acceptation

- [ ] AC1 — owner1, novembre : le montant de « Reste à vous verser » est exactement `balance.remaining_to_pay` de la réponse réseau, **et diffère** de `totals.remaining_to_pay` de la même réponse. Sur la démo, ils diffèrent puisque l'agence verse le mois suivant. Sinon, le test du front le prouve sur une réponse simulée où ils diffèrent. Choisir octobre ne change pas ce montant, alors que la ventilation change.
- [ ] AC2 — « Par bien » rend une ligne par élément de `properties[]`, avec son titre et son locataire. Un bien en retard dit « En retard de N j ».
- [ ] AC3 — Dans les quatre onglets, le DOM ne contient ni « ID entité » ni un motif `#\d+` pour désigner un bailleur, un bail ou une facture.
- [ ] AC4 — Le sélecteur affiche « novembre 2026 » en `fr`, et le changer recharge le relevé avec `period=2026-11`. `grep 'type="month"'` ne rend rien dans les écrans touchés.
- [ ] AC5 — À 390 px, le reste à verser et la date du prochain versement sont visibles sans défiler. « Relevé PDF » et « Attestation annuelle » rendent leur fichier.

**Fidélité au pixel** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), préparation : TCK-2684 → TCK-2691) :

- [ ] AC-F1 — **Fiche de fidélité** : `docs/qa/audit-ux-2026-11/fidelite/TCK-2651.json` (modèle de TCK-2684) liste chaque écran de maquette implémenté (page, approche, écran, référence gelée datée), la persona et la route du produit, l'état reproduit, les rôles des composants de données, les zones à contenu identique et les alias de libellés (vouvoiement, renommage décidé).
- [ ] AC-F2 — **Zéro écart non expliqué** : à 390 × 844 (`rem` 16) et à 1440 × 900 (`rem` 16, densité ×0,9 — [ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)), `fidelite compare` contre la référence gelée ne rend aucun écart au-delà des tolérances d'[ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 5 — ou chaque écart restant figure au tableau « écarts acceptés » de la PR, avec son motif : une des trois exceptions d'ADR-0106 § 2, ou une donnée.
- [ ] AC-F3 — **Rien ne manque** : aucun libellé ni aucune icône de la maquette n'est absent du produit sans alias ou motif écrit, et aucun élément d'interface n'est absent de la maquette sans motif.
- [ ] AC-F4 — **Zones identiques** : chaque zone déclarée dans la fiche (coque, tête de page, barre de filtres) a au plus 0,5 % de pixels différents.
- [ ] AC-F5 — **Preuve dans la PR** : par écran et par appareil, la ligne `conformes · écarts · absents · % pixels`, et le chemin du rideau ; le porteur valide sur le rideau.
- [ ] AC-F6 — **Largeurs intermédiaires** (ADR-0106 § 4) : à 1280, l'écran suit la maquette « bureau 1280 » quand la page en a une (visionneuse, `l=1280`), sinon la maquette 1440 sans débord ni coupe ; à 1024 et à 768, le document ne défile pas horizontalement (`scrollWidth − innerWidth = 0`), aucune grille à piste fixe ni aucun panneau de 480 px ne reste à côté du contenu sous 1280, et toute table défile dans son conteneur.

## Hors périmètre

- La vue argent de l'agence (TCK-2659) et la redirection du personnel (TCK-2677).
- Le versement programmé et son avis (ambition de l'audit).
- La fiche du bailleur vue par l'agence (TCK-2641).
- L'étiquette de l'onglet et du menu (« Loyers », TCK-2618).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
