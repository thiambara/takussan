---
id: TCK-2760
title: "Le reste à verser au bailleur est un solde cumulé arrêté au jour : `balance` dans le relevé, le même chiffre sur la fiche et au carnet"
status: todo
phase: P1
family: back
estimate: M
wave: 88
created: 2026-11-12
updated: 2026-11-12
depends_on: []
blocks: [TCK-2651, TCK-2753]
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#28-payout-"
    - "docs/models-spec.md#101-ownerstatementsnapshot-"
tags: [back, payments, payouts, owners, audit-ux, app]
---

## Objectif utilisateur

Le bailleur lit en tête de sa page ce que l'agence lui doit **aujourd'hui**, que l'agence verse dans le mois ou le mois suivant.

## Contrat de données

Décision : [ADR-0100](../../../adr/0100-une-page-paiements-par-public.md), **amendement du 2026-11-12** (décision 4 (a) du porteur).

Relevé du 2026-11-12 (0bec981e2) :

- `totals.remaining_to_pay` = `net − paid_out` **de la période** (`OwnerStatementService::figures`, `remainingToPay`).
- Sur la base de démo, 1305 reversements au bailleur sur 1305 sont versés le mois suivant leurs pièces (contre-sonde de verif-patrimoine, lecture seule). Le reste de novembre y est donc le net de novembre moins le versement des loyers d'octobre.

À servir :

- **`GET /api/owner-statements?period=`** gagne `balance: { remaining_to_pay: number, as_of: "YYYY-MM-DD" }`.
  - C'est le solde cumulé **au jour**, quelle que soit la période demandée.
  - `as_of` est la date du jour à Dakar.
- **La fiche bailleur** (`GET /api/owners/{id}`, servie par `OwnerDirectory`) gagne le même `balance`, à côté de `figures`, qui reste le bloc du mois.
- **Le carnet** (`GET /api/owners`) : le solde cumulé au jour remplace le reste du mois dans quatre lecteurs :
  - `remaining_to_pay` de chaque ligne ;
  - le filtre qui le lit (`OwnerProfile`, `OwnerDirectory::remainingToPayIn`) ;
  - le tri `sort=-remaining_to_pay` (`OwnerRemainingToPaySort`) ;
  - `summary.remaining_to_pay` / `with_remaining` (`OwnerDirectory::summary`).
- **Le PDF et le CSV du relevé** n'impriment pas `remaining_to_pay` (relevé du 2026-11-12 : aucune occurrence dans `resources/views` ni dans `lang/`). Ils ne changent pas.
- **`totals.remaining_to_pay`** et **`figures.remaining_to_pay`** restent, inchangés : ce sont les écarts **de la période**. Les instantanés envoyés les portent figés.

## Contraintes strictes (métier)

- **Un seul calcul.** Le solde est `OwnerStatementService::remainingToPay()` appliqué aux totaux de `figures()` sur la fenêtre `[origine, aujourd'hui]`. L'origine est une constante, antérieure à toute donnée.
  - Pas de seconde formule : ni somme SQL du net et du versé, ni soustraction dans le front.
  - Une méthode pour un bailleur, une pour plusieurs. Le nombre de requêtes de la seconde ne dépend pas du nombre de bailleurs, comme `totalsFor` (TCK-2640).
- **Arrêté au jour.** Le solde ne dépend pas de `period`.
- **Hors instantané.** `OwnerStatementSnapshots::record()` retire `balance` du payload, comme `next_payout`. `served()` le sert au jour. Les totaux d'un mois envoyé ne changent pas (TCK-2321).
- **Le signe.** Le solde est rendu tel quel, négatif compris. `summary.remaining_to_pay` ne somme que les soldes positifs, et `with_remaining` ne compte qu'eux, comme aujourd'hui.
- **Portée.** Le solde est celui du bailleur **dans l'agence** du relevé, et les pièces d'une autre agence n'y entrent pas : c'est la règle de `figures()`.
- **Le droit de lire** ne change pas : `OwnerStatementPolicy`, et la policy de la fiche et du carnet.

## Delta à produire

- [ ] `OwnerStatementService` :
  - [ ] la constante d'origine ;
  - [ ] `balances(Agency $agency, array $landlordIds): array` (par bailleur : `remaining_to_pay`, `as_of`) et `balance(Agency, User)`, sur `figures()` ;
  - [ ] `statement()` rend `balance`.
- [ ] `OwnerStatementSnapshots` : `record()` retire `balance`, `served()` sert celui du calcul du jour.
- [ ] `OwnerDirectory` : `balance` sur la fiche ; la ligne du carnet, la somme de tête et le tri lisent `balances()`. `monthFigures()` garde `collected` du mois.
- [ ] `OwnerRemainingToPaySort` : trie sur le solde.
- [ ] Docblocks : `remainingToPay`, `monthFigures` et `summary` disent quel chiffre ils rendent.
- [ ] Tests : `OwnerStatementBalanceTest` (nouveau). `OwnerStatementRemainingTest`, `OwnerListSummaryTest`, `OwnerProfileListFiguresTest`, `OwnerDetailMoneyTest` et `OwnerStatementSnapshotUnchangedTest` sont mis à jour là où ils lisaient le reste de période sous le nom du carnet.

## Critères d'acceptation

Fixture commune : un bailleur L d'une agence A, commission de 10 %.

- Loyer d'octobre de 100 000 encaissé le 5 octobre.
- Reversement de 90 000 versé le **3 novembre**.
- Loyer de novembre de 100 000 encaissé le 5 novembre, pas encore reversé.
- Date simulée : le 20 novembre.

- [ ] **AC1 — Le cas qui discrimine.**
  - `period=2026-11` : `totals.remaining_to_pay` = 0 (90 000 − 90 000) et `balance.remaining_to_pay` = 90 000.
  - `period=2026-10` : `totals.remaining_to_pay` = 90 000, et `balance.remaining_to_pay` reste 90 000. Le solde ne dépend pas de la période.
  - `balance.as_of` = `2026-11-20`.
  - Ablation : servir `totals.remaining_to_pay` à la place du solde rend le test rouge.
- [ ] **AC2 — L'invariant.** Le bailleur M a six mois d'histoire :
  - une reprise (ADR-0039) **imputée** sur un reversement terminé ;
  - une facture d'intervention imputée ;
  - un reversement qui porte des pièces de deux mois.

  La somme des `totals.remaining_to_pay` des six relevés mensuels est égale à `balance.remaining_to_pay`, à 0,01 près par mois. Ablation : compter le versé sans `clawback_amount` dans le seul calcul du solde (une seconde formule) rend le test rouge.
- [ ] **AC2 bis — La reprise ne change pas le solde.** Une reprise datée et **non imputée** ne change pas `balance.remaining_to_pay` : même valeur avant et après le remboursement qui la crée. `PayoutClawbacks::outstanding` la rend.
- [ ] **AC3 — Le relevé envoyé.**
  - Le relevé d'octobre de L est enregistré (`record`) avant le reversement du 3 novembre.
  - Le 20 novembre, `served(octobre)` rend les `totals` figés à l'envoi, et `balance.remaining_to_pay` = 90 000, au jour.
  - Le payload en base ne contient pas la clé `balance`.
  - `rectification` est nul : le solde, vivant, ne fait pas naître de faux rectificatif.
- [ ] **AC4 — Un chiffre, trois lecteurs.**
  - Pour L, `balance.remaining_to_pay` du relevé, `balance.remaining_to_pay` de la fiche et `remaining_to_pay` de sa ligne au carnet sont égaux, le 20 novembre.
  - Le reste **de période** de la fiche (`figures.remaining_to_pay`) vaut 0. Le test échoue si le carnet ou la fiche lisent le reste de période.
- [ ] **AC5 — Le tri et la somme.**
  - Deux bailleurs, dont l'ordre selon le reste de période est **l'inverse** de l'ordre selon le solde : `sort=-remaining_to_pay` suit le solde.
  - Un troisième, trop versé (solde négatif), n'entre ni dans `summary.remaining_to_pay` ni dans `with_remaining`. Son solde est rendu négatif sur sa ligne. Le trop-versé se construit par un reversement terminé dont le net dépasse celui de ses pièces, inséré directement : aucun geste de l'application ne le produit.
- [ ] **AC6 — Les requêtes.** Le carnet d'une page de 2 bailleurs et celui d'une page de 6 émettent le même nombre de requêtes.
- [ ] **AC7 — Le coût, mesuré.**
  - Le temps de `GET /api/owners?sort=-remaining_to_pay` (agence d'owner1) et de `GET /api/owner-statements?period=2026-11` (owner1) est relevé sur la base de démo, avant et après le ticket, avec les trois moyennes d'`uptime` et `sysctl -n hw.ncpu`. Les chiffres vont dans les Notes.
  - S'il dépasse une seconde, le ticket le signale au porteur. Le report du solde (ADR-0100, amendement, Conséquences) est la suite prévue, et ce ticket ne l'implémente pas.

## Hors périmètre

- Les écrans :
  - la page « Loyers » lit `balance` (TCK-2651) ;
  - la fiche bailleur du front (`FicheDuBailleur`) lit encore `figures.remaining_to_pay`. Elle doit lire `balance.remaining_to_pay` sous le libellé « Reste à verser » : à porter par le ticket de la fiche (TCK-2641) ou par un correctif d'une ligne ;
  - le carnet du front lit `remaining_to_pay` de la ligne, dont seule la valeur change : rien à faire.
- Le solde reporté (instantané plus mois courant), si la mesure de l'AC7 le demande.
- Les exports PDF et CSV du relevé : ils restent ceux de la période.

## Notes d'implémentation

_(à remplir par implementing-specs)_
