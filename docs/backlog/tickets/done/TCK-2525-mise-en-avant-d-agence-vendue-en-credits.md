---
id: TCK-2525
title: Mise en avant d'une agence dans l'annuaire, achetée en crédits par l'agence
status: done
phase: P1
family: full
estimate: M
wave: 85
created: 2026-11-09
updated: 2026-11-16
depends_on: [TCK-2520]
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
    - "docs/features.md#29-administration--configuration"
  models:
    - "docs/models-spec.md#124-agencyspotlight-"
tags: [back, front, credits, boost, directory]
---

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : bloqué sur une décision du porteur.** Rien n'est livré ; la dépendance TCK-2520 est levée
(`done`).

- Existe : la table `agency_spotlights` (migration `2026_11_09_110100_…`, contraintes `EXCLUDE USING
  gist` : une vitrine par ville et par instant, déjà garantie en base) et la place offerte par le
  super-admin (`routes/api/admin-credits.php:31-33`).
- Absent : colonne de référence au mouvement de crédits, route d'achat par l'agence, capacité dédiée
  (seule `Capability::BoostSpend`, `boost.spend`, existe), amendement d'ADR-0061 (aucun sur la mise en
  avant d'agence).
- Reste : amendement d'ADR-0061 ; migration (référence au mouvement de crédits, réglages prix/durée) ;
  achat API sous verrou de l'agence, débit + place dans une transaction ; écran de console (fr/en,
  wo = fr) ; statistiques super-admin.

**Décision attendue du porteur** (l'amendement d'ADR-0061) : prix et durée de la place ; place prise
→ **(a)** refus ou **(b)** file d'attente ; remboursement à la suspension de l'agence ; sort d'une
place offerte qui chevauche ; capacité : **(a)** réutiliser `boost.spend` ou **(b)** en décliner une.

## Décision du porteur (2026-11-16)

« Fais comme si c'était ton app ; TOUS les paramètres de cette section doivent être totalement
configurables. » Chaque paramètre est un réglage de plateforme (catégorie `boost`, console du
super-admin), défaut choisi par l'implémenteur : prix (100 crédits), durée (7 jours), horizon de
réservation (60 jours), place prise (`refuse` par défaut, ou `next_free` : file d'attente au premier
créneau libre), remboursement à la suspension (`prorata` par défaut, `full`, `none`), place offerte
qui chevauche (`blocks` par défaut, ou `yields`), vente ouverte, vente de l'annuaire sans ville
(fermée par défaut). Capacité : **`boost.spend` réutilisée**. Écrit dans
[l'amendement du 2026-11-16 d'ADR-0061](../../../adr/0061-credits-d-espace-et-boost-des-annonces.md#amendement-du-2026-11-16-tck-2525--la-mise-en-avant-dune-agence-se-vend-en-crédits).

## Objectif utilisateur

Une agence achète elle-même, avec ses crédits, la vitrine de l'annuaire d'une ville pour une période, sans passer par l'équipe Takussan.

## Contrat de données

Prolonge TCK-2520, qui livre la place **offerte** par la plateforme (table `agency_spotlights`, unicité par ville et période, `spotlight` dans l'annuaire public).

1. **Avant tout code : un amendement d'[ADR-0061](../../../adr/0061-credits-d-espace-et-boost-des-annonces.md)** qui étend la mise en avant d'un bien à une agence — prix et durée de la place (réglages de la plateforme, à côté de ceux du boost), ville, file d'attente ou refus quand la place est prise, remboursement quand la place se perd (agence suspendue), et ce qu'il advient d'une place offerte qui chevauche.
2. Achat par l'agence (capacité de mise en avant du catalogue des capacités, TCK-633 lot F — existe :
   `Capability::BoostSpend`, `boost.spend`, `Capability.php:122`, à réutiliser ou à décliner, à trancher
   dans l'amendement) : débit du portefeuille de l'espace dans la même transaction que la création de la place ; refus lisible si les crédits manquent ou si la place est prise sur la période.
3. Une place achetée porte son origine (`granted_by_id` nul, référence au mouvement de crédits — colonne
   absente d'`agency_spotlights` : c'est une **migration**) ; les statistiques des boosts du super-admin la comptent.

## Direction UX / Artistique

- Dans la console de l'agence, à côté des boosts de biens : « Mettre l'agence en avant » — ville, période, prix en crédits, solde après achat.
- Aucune maquette dédiée : la place publique est celle de TCK-2521 (`/fr/playground/maquettes?p=annuaire&a=d`).

## Contraintes strictes (métier)

- Une seule vitrine par ville et par instant, achetée ou offerte (la contrainte de TCK-2520 tient).
- Aucun débit sans place créée, aucune place sans débit (même transaction).
- La place ne change pas l'ordre de l'annuaire (décision 1a du 2026-11-09).

## Delta à produire

- [x] Amendement d'ADR-0061, accepté par le porteur.
- [x] Spec : ligne de `docs/features.md` § 2.9 et § 1.12 mise à jour, colonnes de `agency_spotlights` si l'amendement en ajoute.
- [x] Achat (API) + débit + refus.
- [x] Écran d'achat dans la console de l'agence.
- [x] Tests (débit et place atomiques, place prise, crédits insuffisants, statistiques).

## Critères d'acceptation

- [x] AC1 — Un achat qui échoue sur la contrainte de place ne débite rien. (2026-11-16 : la contrainte
      `EXCLUDE … gist` existe déjà en base ; une violation PostgreSQL abandonne la transaction, donc le
      refus se juge **avant** l'insert, sous le verrou de la ligne de l'agence — ADR-0061 « Concurrence ».)
- [x] AC2 — Deux achats simultanés de la même place : un seul réussit, un seul débit.
- [x] AC3 — Crédits insuffisants : refus avant toute écriture, message lisible.

## Hors périmètre

- La place offerte et son affichage (TCK-2520, TCK-2521).

## Notes d'implémentation

_(à remplir par implementing-specs)_

## Livré (2026-11-16)

- **Huit réglages de plateforme** (catégorie `boost`, console super-admin générique, options de liste traduites) :
  `spotlight.sale_enabled` (oui), `price_credits` (100), `duration_days` (7), `max_advance_days` (60),
  `when_taken` (`refuse` | `next_free`), `refund_on_suspension` (`prorata` | `full` | `none`),
  `offered_overlap` (`blocks` | `yields`), `sell_directory_wide` (non). La **file d'attente est livrée**
  (`next_free` : premier créneau libre dans l'horizon, annoncé par le devis avant la confirmation).
- **Le mouvement désigne la place** (`credit_movements.agency_spotlight_id`, protégé par le trigger d'insertion
  seule), pas l'inverse : une dépense écrit un mouvement par lot, et le remboursement en a besoin. La place
  porte `origin`, `price_credits`, `purchased_by_id`, `cancelled_at`, `refunded_credits` ; les contraintes
  d'exclusion ne portent plus que sur les places non libérées. Migration `2026_11_16_200100`.
- **Ordre de l'achat** : verrou de l'agence → verrou consultatif de la ville (pris aussi par l'offre du
  super-admin) → éligibilité (filtre de l'annuaire, composé) → période → solde → place dans un point de
  reprise → débit en dernier. Clé d'idempotence comme TCK-822. Capacité `boost.spend` réutilisée.
- **Suspension** : observateur de l'agence + rattrapage par `boosts:tick`, idempotent (réclamation
  `WHERE cancelled_at IS NULL`). Le retrait par le super-admin d'une place achetée la libère et la
  rembourse au prorata (au lieu de la supprimer). Statistiques : `spotlights` dans `GET /api/admin/boost-stats`.
- AC1 — `AgencySpotlightPurchaseTest::test_ac1_…` (place concurrente posée juste avant l'insertion : 422, solde
  intact) ; ablation « débit hors transaction » → rouge (400 ≠ 500).
- AC2 — `AgencySpotlightConcurrentPurchaseTest` (deux connexions, deux agences) ; ablation du verrou de la
  ville seul → vert (la contrainte attend et tranche), ablation verrou + traduction du 23P01 → rouge (500).
- AC3 — `test_ac3_…` (aucune écriture sur les tables du registre ni des places, relevée par `DB::listen`) ;
  ablation du contrôle de solde → rouge. Ablations aussi : prorata (100 ≠ 57), idempotence du
  remboursement (514 ≠ 457), garde `boost.spend` (201 ≠ 403), garde de solde du dialogue (front).
- **Affichage (front, 2026-11-16)** — les trois lectures servies par l'API sont affichées (formes fixes,
  sans `fields[...]` : `forme()` du contrôleur des places, `CreditController::show`, `AdminBoostStatsController`) :
  - console super-admin des places (`AdminAgencySpotlights`) : colonne « Origine » (offerte par X, ou achetée —
    prix en crédits et acheteur), état « Libérée le … » avec les crédits rendus (0 compris), plus de bouton
    « Retirer » sur une place libérée, et le dialogue de retrait d'une place achetée annonce le remboursement au prorata ;
  - statistiques du boost (`AdminBoostStats`) : bloc « Mise en avant des agences » (achetées, offertes, crédits
    dépensés et remboursés), hors de l'état vide des emplacements ;
  - journal `/app/credits` (`useLectureDesCredits`) : « Mise en avant — <ville | Tout l'annuaire>, du … au … »
    pour une dépense ou un remboursement de place, période écrite comme la carte de la même page.
  Tests : `AdminAgencySpotlights.test.tsx` (cas TCK-2525), `AdminBoostStats.mise-en-avant.tck-2525.test.tsx`,
  `credits/__tests__/journal-mise-en-avant.tck-2525.test.tsx` ; ablations → rouge : état libéré ignoré, colonne
  d'origine sans la branche « achetée », bloc des places soumis à l'état vide, branche `spotlight` du libellé.

