---
id: TCK-942
title: "Boost : une Vedette prolongée se rembourse tranche par tranche, les jours les plus tardifs au prix de la tranche qui les a achetés"
status: done
phase: P1
family: bug
estimate: M
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features: []
  models:
    - "docs/models-spec.md#93-propertyboost-"
    - "docs/models-spec.md#100-propertyboosttranche-"
  adr:
    - "docs/adr/0061-credits-d-espace-et-boost-des-annonces.md#amendement-du-2026-10-18--le-remboursement-dune-vedette-prolongée-p2405"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-24--crédits-et-boost--idempotence-des-achats-remboursements-ce-que-voit-lespace"
tags: [back, credits, boost, remboursement, migration, pistes]
---

## Contexte

Réf : **Piste P24.05** du fichier de pistes, `retenu · à valider`, chemin fermé sur
`docs/models-spec.md` pour l'implémenteur des agents. Décision du porteur, recopiée de la ligne
Statut :

> porteur (2026-10-18) : traité hors agents, en session : remboursement par tranche datée (les jours restants les plus tardifs, au prix de la tranche qui les a achetés), le modèle dans `models-spec.md`, tests « offerte puis achetée » et « achetée puis offerte »

Une prolongation de Vedette additionnait prix et durée sur la même ligne
(`BoostPurchaseService::featured()`), et le remboursement rendait
`prix cumulé × jours pleins restants / durée cumulée` (`BoostLifecycle::refundableCredits()`). Le
prix était étalé sur toute la durée alors que les jours payés sont au bout : une Vedette offerte
30 jours puis achetée 7 jours (20 crédits), louée au 25ᵉ jour, rendait **6** crédits pour 7 jours
payés intacts ; achetée puis offerte, elle rendait **plus** que les jours payés restants.
[ADR-0061, amendement du 2026-10-18](../../adr/0061-credits-d-espace-et-boost-des-annonces.md#amendement-du-2026-10-18--le-remboursement-dune-vedette-prolongée-p2405)
fixe la règle.

## Objectif utilisateur

Un espace dont le bien est loué, vendu ou supprimé récupère exactement les crédits des jours qu'il a
payés et qui ne seront pas servis — ni moins parce qu'une offre gratuite les précédait, ni plus parce
qu'une offre gratuite les suivait.

## Delta à produire

- Migration `2026_10_18_210000_create_property_boost_tranches_table` : table
  `property_boost_tranches` (boost, rang, prix, durée, offerte), unique `(property_boost_id,
  position)`, CHECK sur les valeurs ; `down()` la supprime.
- Modèle `App\Models\PropertyBoostTranche`, fabrique `PropertyBoostTrancheFactory`, relation
  `PropertyBoost::tranches()` (par rang).
- `BoostPurchaseService::featured()` : une Vedette neuve naît avec sa tranche ; une prolongation en
  ajoute une au rang suivant, après avoir écrit la tranche de reprise si la Vedette n'en avait pas.
  La ligne garde le cumul (ressource, console super-admin inchangées).
- `BoostLifecycle::refundableCredits()` : les jours pleins restants sont pris du dernier rang au
  premier, chacun au prix de sa tranche (`intdiv(prix × jours, durée)`) ; un boost sans tranche est
  sa tranche unique.
- `docs/models-spec.md` § 93 et § 100 (neuf), table des unicités ; ADR-0061 : ligne « Application »
  de l'amendement.

**Reprise des Vedettes déjà prolongées** : aucune ligne n'est écrite par la migration. Un boost sans
tranche est sa propre tranche unique, au prix et à la durée cumulés de sa ligne — il se rembourse
donc exactement comme avant ; s'il est prolongé après ce changement, la tranche de reprise est écrite
d'abord, puis la nouvelle. Un remplissage par la migration n'aurait pas suffi : le seeder
`OfferedFeaturedSeeder` (`LegacyFeaturedConversion`) écrit encore des Vedettes sans tranche, et les
Badges n'en ont pas. Aucune donnée de production n'existe (l'API n'a jamais servi en production).

## Critères d'acceptation

- [x] **AC1** — Offerte 30 j (0), puis achetée 7 j (20), bien loué au 25ᵉ jour : les 7 jours payés
      restants rendent **20** crédits (et non 6), solde revenu à 500. *Mesuré :
      `test_offerte_puis_achetee_rend_les_jours_payes_restants_en_entier` — rouge avant correctif
      (`Failed asserting that 6 is identical to 20`), vert après. Même résultat quand le bien est
      loué pendant une pause (`…_en_pause_…`, rouge 6 → vert 20).*
- [x] **AC2** — Achetée 7 j (20), puis offerte 30 j : ne rend jamais plus que les jours payés
      restants. Au 1ᵉʳ jour, **17** (= floor(20 × 6 / 7)) et non 19 ; au 31ᵉ jour, seuls des jours
      offerts restent : **0**, boost `ended` et non `refunded`. *Mesuré :
      `test_achetee_puis_offerte_ne_rend_que_les_jours_payes_restants` (rouge 19 → vert 17) et
      `…_ne_rend_rien_quand_seuls_les_jours_offerts_restent` (rouge : `refunded` → vert : `ended`, 0).*
- [x] **AC3** — Une Vedette non prolongée se rembourse comme avant : 7 j à 20, louée à 4 j 21 h
      restants → 11, avec une tranche. *Mesuré : `test_une_vedette_non_prolongee_se_rembourse_comme_avant`
      vert ; `tests/Feature/Boost/BoostPauseAndRefundTest.php` inchangé et vert.*
- [x] **AC4** — Chaque achat ou offre ajoute une tranche au rang suivant sans réécrire la
      précédente, et la ligne garde le cumul (20 / 37). *Mesuré :
      `test_chaque_achat_ou_offre_ajoute_une_tranche_sans_reecrire_la_precedente` : rangs `[1, 2]`,
      prix `[0, 20]`, durées `[30, 7]`, offertes `[true, false]`.*
- [x] **AC5** — Reprise : une Vedette prolongée avant les tranches (ligne 20 / 37, sans tranche) rend
      6 au 25ᵉ jour, comme avant ; prolongée ensuite, elle porte `[1, 20, 37]` puis `[2, 20, 7]`.
      *Mesuré : `test_une_vedette_prolongee_avant_les_tranches_est_une_tranche_unique` et
      `test_prolonger_une_vedette_sans_tranche_ecrit_d_abord_sa_tranche_de_reprise`, verts.*
- [x] **AC5 bis** — Le rang fait l'ordre des tranches, jamais l'id ni l'ordre d'insertion : la
      tranche achetée (rang 2) écrite avant l'offerte (rang 1) rend quand même ses 7 jours au 25ᵉ
      jour (20). *Mesuré : `test_le_rang_fait_l_ordre_des_tranches_pas_l_ordre_d_insertion` vert ;
      sans `orderBy('position')` dans `PropertyBoost::tranches()`, rouge (`0 ≠ 20`).*
- [x] **AC6** — La migration se joue, se défait et se rejoue sur PostgreSQL 17. *Mesuré sur une base
      jetable `takussan_vedette_scratch` (`--locale=C`) : `migrate` → DONE, `migrate:rollback
      --step=1` → table absente, `migrate` → table présente ; base supprimée ensuite.*
- [x] **AC7** — `docs/models-spec.md` décrit le modèle, et `scripts/check-models-spec.mjs` reste
      vert. *Mesuré : `node scripts/check-models-spec.mjs` → sortie 0.*

## Hors périmètre

- Afficher les tranches (journal des crédits, console super-admin) : la ressource et la console
  lisent toujours la ligne cumulée.
- Remontée et Badge : ils ne se prolongent pas, n'ont pas de tranche, et leur remboursement (annulation
  par la plateforme) est inchangé.
- La répartition par lot d'origine (ADR-0061 § 4) : inchangée, elle reçoit le montant calculé.

## Notes d'implémentation

- **Re-mesure du constat (2026-10-18)** : `BoostPurchaseService::featured()` cumulait toujours prix
  et durée sur la ligne ; `refundableCredits()` rendait `intdiv(price_credits × jours pleins,
  duration_days)`. Les mouvements de crédits ne permettent pas de reconstituer les tranches : un
  `spend` porte un montant et une date, ni durée ni offre (`credit_movements`, migration
  `2026_10_12_500200`), et une tranche offerte n'écrit aucun mouvement (`debit()` ne fait rien à
  prix 0). D'où la table neuve. L'amendement d'ADR-0061 existait déjà (écrit lors de la validation
  du 2026-10-18) ; seule la ligne « Application » y est ajoutée.
- **Ablations** (copie dans le bloc-notes du lot, restauration par `cp`, md5 identique) :
  1. `refundableCredits()` ramené au prorata cumulé → 4 rouges (`6 ≠ 20` ×2, `19 ≠ 17`, `ended`
     attendu) ; restauré, 9 verts.
  2. `addTranche()` vidé → 7 rouges (les remboursements retombent sur la ligne cumulée, aucune
     tranche) ; restauré, 9 verts.
  3. Tranche de reprise retirée → 1 rouge (`test_prolonger_une_vedette_sans_tranche_…`) ; restauré.
  4. (Vérification adverse) `orderBy('position')` retiré de `PropertyBoost::tranches()` → 1 rouge
     (`test_le_rang_fait_l_ordre_…`, `0 ≠ 20`) ; restauré par `cp`, md5 identique, 10 verts.
- Le rang suivant se calcule par `max(position)` sous le verrou de la ligne du boost, que
  `featured()` tient déjà (`lockForUpdate()` sur la Vedette vivante, ou ligne tout juste créée sous
  le verrou du bien) ; l'unicité `(property_boost_id, position)` refuserait un doublon.
