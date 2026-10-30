---
id: TCK-2434
title: "Radar : compteurs anonymes de marché au-delà de la rétention (agrégats, k-anonymat, avis juridique)"
status: todo
phase: P3
family: back
estimate: M
wave: 80
created: 2026-10-30
updated: 2026-10-30
depends_on: [TCK-2392, TCK-2393]
blocks: []
spec_refs:
  features:
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, radar, observatoire, confidentialite, adr-0077, adr-0080]
---

## Décision du porteur (2026-10-30)

**`RADAR_NATURE_COUNTS` reste éteint jusqu'à l'avis juridique** (le drapeau `radar.nature_counts.enabled`, éteint par
défaut, arrive avec TCK-2431).

## Objectif utilisateur

L'observatoire garde une mémoire du marché (prix par quartier, type et nombre de chambres) au-delà
des 90 jours de rétention des annonces, sans rien garder qui permette de remonter à une annonce ni
à un annonceur.

## Contexte

Depuis [ADR-0080](../../adr/0080-la-collecte-automatique-du-radar.md) § 4, **toute purge supprime
les instantanés de l'annonce** (STOP, révocation, `do_not_contact` ou 90 jours). Le détachement d'une
ligne a été écarté après trois vérifications adverses : une ligne détachée se rejoignait encore à sa
fiche purgée, par l'instant de la purge, par le passage et la seconde de création, puis par le rang
des `id` et par les dates de la fiche. Une ligne individuelle, même sans lien, n'est pas anonyme.

ADR-0077 § 9 ne laisse subsister que « des compteurs anonymes ». Ce ticket les définit : des
**agrégats**, jamais une ligne par annonce.

## Delta à produire

- [ ] Une table d'agrégats (par exemple : période, quartier du référentiel ou ville, contrat, type,
      tranche de chambres → nombre, médiane et quartiles du prix), alimentée **avant** la purge, par
      cellule, jamais par annonce.
- [ ] Un seuil de **k-anonymat** : une cellule de moins de k annonces n'est pas écrite (ou est fondue
      dans la cellule parente). k à fixer avec l'avis juridique.
- [ ] Aucune colonne qui relie une cellule à une annonce, un passage, un annonceur ou un instant plus
      fin que la période.
- [ ] La ligne correspondante de `privacy.ts` § 6 et `VERSION_DOCUMENTS`, si l'avis le demande.

## Critères d'acceptation

- [ ] AC1 — Une cellule sous le seuil k n'est jamais écrite.
- [ ] AC2 — Après la purge, aucune jointure ne relie une cellule à une annonce purgée ni à un
      annonceur (test qui tente les jointures du banc de TCK-2392).
- [ ] AC3 — L'observatoire (TCK-2393) lit les agrégats au-delà de la rétention, et les instantanés en
      deçà.

## Menaces

- **La différence entre deux périodes** (relevée par la vérification adverse de TCK-2431, 2026-10-30, reproduite sur
  `radar_nature_counts`). Un annonceur dit STOP le jour J ; sa ligne reste avec `do_not_contact_at` et l'empreinte HMAC,
  ses annonces sont purgées. Le compte de J l'incluait, celui de J+1 non : la différence rend ce qui le décrivait (sa
  nature pour TCK-2431 ; pour ce ticket, le quartier, le type, la tranche de prix de ses annonces), et `do_not_contact_at`
  donne le jour exact. Même recoupement pour un annonceur lié à un compte, par les dates des fiches purgées. D'autres
  mouvements le même jour brouillent le calcul ; un jour calme le rend exact.
  - **Un seuil k ne la ferme pas** : la vérification l'a reproduite sur des cellules de 3.
  - **Remèdes à trancher avec l'avis juridique** : un grain plus gros (la semaine, le mois), un arrondi ou un bruit sur
    les comptes. Effacer `do_not_contact_at` jusqu'au jour seul ne suffit pas.
  - Les compteurs par nature de TCK-2431 sont **éteints par défaut** (`RADAR_NATURE_COUNTS`) jusqu'à cet avis ; le même
    avis dit s'ils peuvent être allumés, et sous quel remède.

## Prérequis hors code

- **Avis juridique** (avocat, CDP) sur la qualification d'anonymat des agrégats, sur la valeur de k, et sur le remède à
  la différence entre deux périodes (§ Menaces), qui vaut aussi pour les compteurs par nature de TCK-2431.

## Hors périmètre

- Garder des instantanés individuels au-delà de la rétention, même détachés : écarté par ADR-0080 § 4.

## Notes d'implémentation

_(à remplir par implementing-specs)_
