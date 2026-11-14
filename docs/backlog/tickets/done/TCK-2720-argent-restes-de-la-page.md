---
id: TCK-2720
title: "« Argent » : les bailleurs des reversements en cours comptés une fois, les montants d'un milliard tiennent dans leur colonne, le module mort retiré"
status: done
phase: P2
family: full
estimate: S
wave: 90
created: 2026-11-11
updated: 2026-11-11
depends_on: [TCK-2659]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#28-payout-"
tags: [full, argent, finances, reversements, fidelite, suivi-lot-1]
---

## Objectif utilisateur

L'admin d'agence lit sur la tuile « Reversements en attente » combien de bailleurs attendent leur argent, et lit en
entier un encaissement d'un milliard de francs sur un écran de bureau.

## Contexte

Restes de TCK-2659 (b5552cdb2), re-mesurés sur 2fcd7fb57 (après les correctifs b10afead0, a66aea9ce, f1bd713ae) :

1. **La tuile ne dit pas combien de bailleurs.** La maquette retenue (`app-argent`, a-0 bureau 1280 et 1440) écrit
   « Reversements en attente · 8 748 000 F · **5 bailleurs** · 3 à approuver ». La tuile additionne `payouts_pending` et
   `payouts_awaiting_approval` (montant et nombre) ; or `FinanceSummaryService::payouts()` ne compte les bailleurs que
   pour la file d'approbation (`payouts_awaiting_approval.landlords_count`, `COUNT(DISTINCT landlord_id)` filtré par
   `payee_role = landlord`). Deux comptes distincts ne s'additionnent pas : un bailleur qui a un reversement en attente
   d'approbation et un autre à verser compterait deux fois.
2. **`takussan-web/src/lib/queries/admin-finances.ts` n'a plus de lecteur** (`usePendingPayoutsCount`,
   `useDraftInvoicesCount` : leur seul consommateur, `FinanceKpis`, a été retiré par TCK-2659) ; seul son test l'importe.
3. **Un montant ≥ 1 000 000 000 F déborde la colonne Montant du registre** sous 1440 px (colonnes à largeur fixe,
   `table-fixed`, aux largeurs de la maquette).

## Décision

**Aucune décision du porteur requise** : fidélité à la maquette retenue et nettoyage.

## Contrat de données

- `GET /api/agencies/{agency}/finance/summary` : nouvelle clé `payouts_open {count, amount, landlords_count}` — les
  reversements `pending` **et** `awaiting_approval` de l'agence, au net ; `landlords_count` = bailleurs **distincts** sur
  l'union, même filtre `payee_role = landlord` que la file d'approbation. Les clés existantes restent, à l'identique.

## Direction UX / Artistique

- Tuile « Reversements en attente » : le détail de la maquette, « N bailleurs · M à approuver » (« M à approuver » réservé
  à qui le lit aujourd'hui) ; montant et nombre lus sur `payouts_open`.
- Colonne Montant du registre, à 1280 et 1440 : un montant à dix chiffres (« 1 234 567 890 F ») se lit en entier, sans
  ellipse ni chevauchement de la colonne voisine, et les colonnes gardent leurs proportions de la maquette pour les
  montants courants.

## Contraintes strictes (métier)

- `landlords_count` ne compte ni le prestataire payé (`payee_role` ≠ landlord) ni une caution rendue comptée comme
  reversement d'un autre rôle : la règle de la vérification adverse de TCK-2657, sur l'union.
- Une requête agrégée, comme aujourd'hui (pas de requête par statut).
- Les clés i18n de la tuile (`argent.tuiles.reversementsDetail`) se coordonnent avec qui édite les dictionnaires ; wo =
  texte français.

## Delta à produire

- [ ] `FinanceSummaryService::payouts()` : `payouts_open` dans la même requête (`COUNT(DISTINCT landlord_id) FILTER
      (WHERE status IN (…) AND payee_role = ?)`).
- [ ] Tuile du bureau et ligne du téléphone : lisent `payouts_open` ; détail « bailleurs · à approuver ».
- [ ] Suppression de `lib/queries/admin-finances.ts` et de son test.
- [ ] Largeur de la colonne Montant tenue pour dix chiffres.
- [ ] Tests : `FinanceSummaryPayoutsOpenTest` (API) ; test de la tuile (front).

## Critères d'acceptation

- [ ] AC1 — Agence avec : bailleur L1 → un reversement `awaiting_approval` et un `pending` ; bailleur L2 → un `pending` ;
      prestataire P → un `pending`. `payouts_open = {count: 4, landlords_count: 2}` ; `payouts_awaiting_approval.landlords_count
      = 1` (inchangé).
- [ ] AC2 — La tuile du bureau affiche « 2 bailleurs · 1 à approuver » sur ce décor.
- [ ] AC3 — `grep -rn "admin-finances" takussan-web/src` ne rend rien ; `npx tsc --noEmit` propre.
- [ ] AC4 — À 1280 px, un encaissement de 1 234 567 890 F : la cellule Montant a `scrollWidth ≤ clientWidth` et le texte
      rendu est le montant entier.

## Hors périmètre

- La barre d'onglets du téléphone (écart de fidélité de 4,8 à 5,4 %, navigation de la famille 3).
- La lisibilité des groupes de milliers (TCK-2714).
- L'export du registre (TCK-2721).

## Notes d'implémentation

**API.** `FinanceSummaryService::payouts()` rend `payouts_open {count, amount, landlords_count}` depuis la requête
agrégée existante, qui ne lit déjà que les deux files (`whereIn(status, [awaiting_approval, pending])`) : `COUNT(*)`,
`SUM(net_amount)` et `COUNT(DISTINCT landlord_id) FILTER (WHERE payee_role = landlord)`, sans filtre de statut. Les
clés existantes ne changent pas. `FinanceSummaryPayoutsOpenTest` (6 tests) couvre l'AC1, un bailleur présent dans la
seule file d'approbation, les statuts hors des files et l'autre agence, la caution rendue (`payee_role = tenant`), les
zéros, et **une seule** requête sur `payouts`. Six ablations, toutes rouges : sans le filtre `payee_role` ;
`COUNT` sans `DISTINCT` ; le compte limité à `pending` ; `gross_amount` au lieu de `net_amount` ; les bailleurs
limités à `pending`. Ce dernier mutant a d'abord **survécu**, parce que dans l'AC1 chaque bailleur a aussi un
reversement `pending`. Le test « un bailleur qui n'attend que l'approbation compte aussi » le tue.
`docs/spatie-query-builder.md` décrit la nouvelle clé.

**Tuile du bureau.** Montant et détail se lisent sur `payouts_open`. Le détail est la nouvelle clé
`argent.tuiles.reversementsBailleurs` (« 2 bailleurs · 1 à approuver »). Quand aucun bailleur n'attend (seulement des
prestataires ou des cautions rendues), la tuile reprend `reversementsDetail` sur `payouts_open.count`
(« 2 reversements », « Aucun en attente »). J'ai lu « M à approuver réservé à qui le lit aujourd'hui » comme « la
tuile garde son public actuel » : la partie « · M à approuver » n'est pas filtrée par `payouts.approve`. Cette lecture
est à confirmer.

**Téléphone.** La vue n'a pas de tuile. La ligne « Reversements » des registres affiche maintenant
`payouts_open.count` à droite. La maquette (`app-argent-lignes.tsx:188`) montre un nombre au même endroit (« 23 »). **Cette lecture est à confirmer** : le « 23 » peut aussi être le total du registre, puisque la ligne ouvre le registre entier des reversements. Si c'est le cas, la ligne doit lire ce total et non les reversements ouverts.

**Front, éprouvé.** La clé `reversementsBailleurs` est ajoutée (accord de team-lead du 2026-11-11 ; fr, en, wo = le
texte français avec `=1`). Le describe « TCK-2720 » d'`argent.tck-2659.test.tsx` (4 tests ; fichier : 38 verts) et
`cautions-du-registre.tck-2733.test.tsx` (4 verts). Quatre ablations de `PointDuMois.tsx`, une à la fois, md5
restauré, toutes rouges : le montant lu comme la somme des deux files (810 000 au lieu de 811 000) ; les bailleurs lus
sur la file d'approbation (« 1 bailleur ») ; la ligne du téléphone lue sur `payouts_pending.count` (3 au lieu de 4) ;
le repli sur `reversementsDetail` supprimé (rougit « prestataires seulement » et « Aucun en attente »).

**Colonne Montant.** Mesuré sur la vraie page `/app/agency/finances?tab=encaissements` (session de démonstration, le
texte d'une cellule remplacé par le montant), largeur de la boîte de contenu de la cellule comparée à celle du texte :

| Largeur d'écran | Avant (6,9rem) | Après | « 1 234 567 890 F » | « 1,234,567,890 F » |
|---|---|---|---|---|
| 1000 px (sous `lg`, 14 px, px-3 = 24 px) | 86,4 px | 105,6 px (`w-[8.1rem]`) | 98,3 px | 102,1 px |
| 1280 px (12,6 px, 21,6 px) | 88,8 px | 95,2 px (`lg:w-[7.3rem]`) | 88,5 px | 91,8 px |
| 1440 px | 104,8 px | inchangé (`7.9rem`) | 88,5 px | 91,8 px |

Avant la correction, le texte dépassait sa boîte de contenu en anglais à 1280 px et dans les deux langues sous `lg`.
Après, il tient partout. La colonne du payeur, sans largeur fixe, cède 6,4 px à 1280 px ; les autres colonnes ne
bougent pas.

⚠ **L'AC4 telle qu'écrite (`scrollWidth ≤ clientWidth`) accepte encore le défaut.** Ces deux mesures incluent le
padding. Avant la correction, à 1280 px en anglais, la cellule donnait `scrollWidth 110 = clientWidth 110` alors que
le texte débordait de 3 px dans le padding, jusqu'à toucher le bord. En français à 1280 px, le texte tenait déjà, à
0,3 px près. La mesure qui sépare l'avant de l'après compare le bord droit du texte au bord droit de la boîte de
contenu (bord de la cellule moins le padding). C'est celle du tableau ci-dessus.

**Nettoyage.** `lib/queries/admin-finances.ts` et son test sont supprimés. `grep -rn "admin-finances"
takussan-web/src` ne rend rien, et `tsc --noEmit` est propre.

**Pour /sync-specs.** `docs/features.md` ne décrit pas les clés du point du mois. Rien à reporter, sauf si la spec
veut nommer `payouts_open`.
