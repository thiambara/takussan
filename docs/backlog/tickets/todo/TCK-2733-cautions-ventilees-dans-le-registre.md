---
id: TCK-2733
title: "Le registre des encaissements dit la part des cautions dans ses totaux"
status: todo
phase: P1
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
    - "docs/models-spec.md#15-leasepayment-"
tags: [full, argent, encaissements, cautions, totaux, suivi-lot-1, decision-porteur]
---

## Objectif utilisateur

L'admin d'agence qui compare le total du registre des encaissements à la tuile « Encaissé en <mois> » comprend d'où
vient l'écart : le registre lui dit, sous son total, combien sont des cautions.

## Contexte

Reste de TCK-2659, mesuré par terrain-5 sur la démo (2026-11-11) :

- le registre d'« Argent » (`GET /api/payments/history`, borné par `paid_at` via `filter[paid_from]` / `filter[paid_to]`)
  liste **toutes** les lignes de bail payées dans la période, **cautions comprises** (`LeasePaymentType::Deposit`) ;
- la tuile « Encaissé » les **exclut** : elle somme `CollectedPayments::leaseIncome()`, dont les types sont
  `LEASE_INCOME_TYPES` = loyer, charges, régularisation, pénalité ;
- sur la démo, **7 cautions pour 24 615 000 F en octobre** et **6 pour 10 255 000 F en novembre** : le total du
  registre dépasse la tuile d'autant, sans que l'écran le dise.

`meta.totals` (`PaymentController::history`) vaut aujourd'hui `{count, amount, paid_amount, remaining_amount}`, sommés sur
toute la sélection (avant la page) ; chaque ligne de bail porte déjà `payment_type`.

## Décision

**Décision de session (2026-11-11), à confirmer par le porteur ; si refusée → `obsolete`.**

- **a) (retenu)** garder les cautions dans le registre, et le dire : l'API ventile la part des cautions dans
  `meta.totals`, le front écrit « dont cautions ».
- b) retirer les cautions du registre pour l'aligner sur la tuile.

## Contrat de données

- `GET /api/payments/history`, `meta.totals` : deux clés neuves, sur la même sélection que les autres totaux (filtres,
  cloisonnement, troncature comprise) :
  - `deposits_count` — nombre de lignes de bail de type `deposit` ;
  - `deposits_amount` — somme de leur `paid_amount`.
- Les clés existantes et leurs valeurs ne changent pas. Une sélection sans caution rend `0` et `0`.

## Direction UX / Artistique

Sous la cellule de total du registre (bureau) et dans le récapitulatif du téléphone : « dont cautions 24 615 000 F
(7) », seulement quand `deposits_amount > 0`. Ton secondaire, la même typographie que le détail des autres cellules.

## Contraintes strictes (métier)

- Une seule définition de « caution » : le type `LeasePaymentType::Deposit`, lu par la constante de `CollectedPayments`
  (ou une voisine), pas par une chaîne recopiée.
- Le remboursement de caution (`deposit_refund`) n'est **pas** compté dans `deposits_amount`.
- Calculé sur `$merged` avant la page, comme les autres totaux : il ne dépend ni de `page` ni de `per_page`.
- Clés i18n neuves coordonnées avec qui édite les dictionnaires ; wo = texte français (wolof en pause).

## Delta à produire

- [ ] `PaymentController::history` : `deposits_count`, `deposits_amount` dans `$totals`.
- [ ] Front, registre des encaissements (`EncaissementsAgence`) : la mention « dont cautions » ; type de `meta.totals`
      dans `lib/queries/payments.ts`.
- [ ] Tests : `PaymentHistoryDepositsTotalsTest` (API) ; test de la cellule de total (front).
- [ ] `/sync-specs` : `docs/features.md` § 1.5 si les totaux du registre y sont décrits.

## Critères d'acceptation

- [ ] AC1 — Agence dont octobre compte 3 loyers payés (300 000 F) et 2 cautions payées (450 000 F), sans pénalité ni
      réservation : `meta.totals.paid_amount = 750000`, `deposits_count = 2`, `deposits_amount = 450000`, et
      `paid_amount − deposits_amount` égale le montant de la tuile « Encaissé en octobre » de `finance/summary`.
- [ ] AC2 — Même décor, `per_page=1` : `deposits_*` identiques (calculés sur toute la sélection).
- [ ] AC3 — Un remboursement de caution payé dans le mois n'entre pas dans `deposits_amount`.
- [ ] AC4 — `filter[entity_type]=lease&filter[entity_id]=<bail sans caution>` : `deposits_count = 0`,
      `deposits_amount = 0`.
- [ ] AC5 — Front : sur la réponse de AC1, la cellule de total affiche « dont cautions » avec 450 000 F ; sur une réponse à
      `deposits_amount = 0`, la mention est absente.

## Hors périmètre

- La tuile « Encaissé » (inchangée : elle reste hors cautions).
- Le classement des remboursements de caution dans le registre.
- L'export du registre (TCK-2721), qui pourra reprendre ces totaux.

## Notes d'implémentation

_(à remplir par implementing-specs)_
