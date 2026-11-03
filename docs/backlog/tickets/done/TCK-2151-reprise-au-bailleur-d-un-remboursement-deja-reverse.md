---
id: TCK-2151
title: "Un remboursement d'une pièce déjà reversée crée une reprise au bailleur, imputée au reversement suivant ; le relevé lit le reversement versé par sa copie"
status: done
phase: P1
family: applicatif
estimate: M
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: [TCK-2017]
blocks: []
spec_refs:
  adr:
    - "docs/adr/0039-les-sorties-d-argent.md#amendement-du-2026-10-24--la-reprise-au-bailleur-le-relevé-lu-par-la-copie-la-pénalité-de-retard-reversée"
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-177--relevés-de-gérance-dune-période-close-recalculés-à-chaque-lecture"
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-205--pièces-déjà-reversées-au-bailleur-puis-remboursées--aucune-reprise"
tags: [api, payouts, relevé, reprise, migration, pistes]
---

## Objectif utilisateur

Quand une pièce déjà reversée au bailleur est remboursée, le bailleur rend ce qu'il en a reçu :
la reprise baisse son reversement suivant. Son relevé et son accueil gardent le mois versé tel
qu'il a été versé, et montrent la reprise au mois du remboursement.

## Contexte

Réfs : **P177.01**, **P205.01**, **P205.03** du fichier de pistes (même ticket, décision du
porteur). La règle est écrite dans ADR-0039, amendement du 2026-10-24, points 1 à 4.

## Décision du porteur

P177.01 :

> validé — validation du porteur (2026-10-24) : ADR-0039, amendement du 2026-10-24 : le relevé lit un reversement versé par la copie de son pivot (TCK-2017), au mois de chaque pièce ; un remboursement postérieur y figure par sa seule reprise (P205.01), datée du remboursement ; le `Payout` constaté reste hors du relevé ; même ticket que P205.01

P205.01 :

> validé — validation du porteur (2026-10-24) : ADR-0039, amendement du 2026-10-24 : un remboursement d'une part déjà reversée, déclaré ou par webhook, crée une reprise au net de commission (`payout_clawbacks`), datée du remboursement, imputée au reversement suivant du même bailleur avec report du reliquat ; `net_negative` ne juge que le net avant reprise ; un reversement absorbé en entier est créé à zéro et passe les trois gestes ; une reprise sans reversement suivant reste due et se solde à la main ; avis à l'agence et au bailleur ; pas de reprise pour un pivot sans copie

P205.03 :

> validé — validation du porteur (2026-10-24) : ADR-0039, amendement du 2026-10-24 : l'accueil du bailleur montre la reprise comme un versé négatif daté de son mois, le reversement qui l'impute comptant au versé avant reprise ; même ticket que P205.01

## Hypothèses (mode sans humain)

- **Pas de modèle Eloquent `PayoutClawback`.** Un modèle de premier niveau neuf doit figurer dans
  `docs/models-spec.md` (`scripts/check-models-spec.mjs`), que l'implémenteur ne touche pas. Les
  deux tables se lisent par `App\Services\Payout\PayoutClawbacks`, sur `DB::table()`. Le modèle
  viendra avec la mise à jour de la spec (`/sync-specs`).
- **Le schéma est celui de l'amendement, sans les colonnes de pénalité** (`lease_payments.late_fee_*`) :
  elles appartiennent à P206.01 et P206.04, autres pistes. `part` vaut toujours `payment` ici.
- **La base d'une reprise** est la part neuve du remboursement, bornée par le montant copié du
  pivot moins ce que les reprises précédentes de la même pièce en ont déjà repris.
- **Le relevé lit une pièce par sa copie** seulement quand son reversement est `completed` ; un
  reversement en cours garde la lecture du jour (TCK-1158 le bloque de toute façon).
- Le `Payout` constaté (TCK-2052) naît comme avant et reste hors du relevé (il est `tenant`).

## Delta livré

- [x] Migration additive `2026_10_24_050000_create_payout_clawbacks_tables` : `payout_clawbacks`
      (avec les colonnes du solde à la main, nullables), `payout_clawback_imputations`,
      `payouts.clawback_amount` ; `down()` rend l'état d'avant.
- [x] `PayoutClawbacks::recordRefund()` appelé dans la transaction des deux chemins de
      remboursement (`BookingPaymentService::refund`, webhook de `PaymentGatewayService`), après
      la ligne de la pièce, le reversement porteur relu sous verrou.
- [x] `PayoutService::createLocked()` : reprises dues verrouillées après les pièces et avant la
      ligne agence ; `net_negative` sur le net avant reprise ; imputation jusqu'à ce net,
      `clawback_amount` posé, `net_amount` = argent parti ; reliquat reporté.
- [x] `detachItems()` rend les imputations d'un reversement `cancelled` ou `failed`.
- [x] Relevé : pièces d'un reversement versé lues par la copie, quel que soit leur statut ; ligne
      `lines.clawbacks` au mois du remboursement ; `totals.net` et `totals.paid_out` diminués de
      la reprise ; versé = Σ (`net_amount` + reprise imputée) − reprises du mois ; `clawback`
      au total et `clawback_amount` sur chaque reversement listé.
- [x] `PortfolioMetrics::netPaidOutByMonth()` : même règle (P205.03).

## Reste à faire

Laissé de côté par ce ticket (la précision de P205.01 le demande, il n'est pas fait) :

- le reversement absorbé en entier (`net_amount = 0`) naît bien et impute, mais son paiement exige
  encore moyen et référence, et appelle le pilote de décaissement (point 2.6, ligne 13 du tableau) ;
- le solde à la main d'une reprise due, sa route et la liste des reprises en cours de l'agence
  (point 2.9, ligne 14) — les colonnes existent ;
- les avis à l'agence et au bailleur, par un code neuf (point 2.8) ;
- l'affichage des reprises : préparation (ligne 2), `PayoutResource` (ligne 8), export (ligne 9),
  PDF et CSV du relevé, écran du front.

## Tests

`tests/Feature/Api/PayoutClawbackTest.php` (4 tests) : le scénario de P177.01 (septembre inchangé
après le remboursement, octobre à − 45 000, novembre à 180 000 pour 135 000 partis, l'année à
333 000, et `netPaidOutByMonth` 198 000 / − 45 000 / 180 000) ; deux pièces remboursées en entier
(le reversement reste au relevé de septembre) ; un acompte reversé puis remboursé par le geste
déclaré, reporté sur deux reversements (18 000 puis 27 000, le premier à net 0) ; un reversement
annulé rend son imputation, et une pièce jamais reversée ne donne aucune reprise.

## Notes d'implémentation

- **Ablation**, une par mécanisme, chacune restaurée ensuite → 4/4 vert :
  création de la reprise coupée → 4 rouges ; imputation coupée → 3 rouges ; `release()` coupé →
  1 rouge ; lecture par la copie coupée au relevé → 1 rouge ; reprise retirée de
  `netPaidOutByMonth` → 1 rouge.
- Nom d'index explicite sur `nullableMorphs` : l'auto-généré fait 64 caractères, que PostgreSQL
  tronquerait (piège n° 3).
- Le scénario d'acompte demande une agence à 10 % : l'acompte de séjour prend toujours le taux
  d'agence, et `moneyAgency()` est à 8 % par défaut.
