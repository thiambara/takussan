---
id: TCK-2062
title: "Le locataire note l'agent de son bail et les collaborateurs du bien, jamais le bailleur comme « agent »"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#111-avis--réputation"
  models: []
  adr:
    - "docs/adr/0043-avis-cible-eligibilite-moderation-et-verrou-plateforme.md#amendement-du-2026-10-23--qui-le-locataire-peut-noter-comme-agent"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-160--propertiesuser_id-lu-comme-le-bailleur-dans-une-décision-métier"
tags: [api, avis, migration, pistes]
---

## Contexte

Réf : **P160.05** du fichier de pistes (🟠, `validé`). Pour un bail ou une réservation,
`ReviewEligibility` prenait `properties.user_id` comme sujet « agent » : sur le bien d'un bailleur,
le locataire était invité à noter son bailleur comme agent (`forAgent(client, bailleur)` → le bail),
et ne pouvait pas noter l'agent du bail (`forAgent(client, agent du bail)` → `null`).

**Décision du porteur** : validé — validation du porteur (2026-10-23) : ADR-0043, amendement du 2026-10-23 : sujets « agent » = l'agent du bail, les collaborateurs acceptés `agent`/`manager` encore du personnel, le créateur s'il est du personnel ; jamais le bailleur (hôte d'une agence `individual` compris) ; l'index `reviews_author_context_uniq` s'élargit au sujet noté, sans perte de données ; les avis déjà déposés restent tels quels

## Objectif utilisateur

Le locataire note les agents qui l'ont réellement servi, et son bailleur n'est jamais présenté
comme un agent.

## Contraintes strictes (métier)

- Les règles sont celles de l'amendement d'ADR-0043 du 2026-10-23, points 1 à 4.
- « Encore du personnel » : `PersonnelDeLAgence::estPersonnel` (joignable et `isStaffAt`), jugé au
  dépôt.
- Aucun avis existant n'est touché ; l'unicité « une fois par auteur et par agent » reste.

## Delta à produire

- [x] `ReviewEligibility::agentSubjectIds()` (privée) : agent du bail, collaborateurs acceptés
  `agent`/`manager` encore personnel, créateur s'il est personnel ; moins `leases.landlord_id` et
  tout titulaire d'un profil propriétaire de l'agence du bien. Lue par `forAgent` et
  `opportunities` ; docblock de la classe aligné.
- [x] Migration `2026_10_24_040000_widen_reviews_author_context_unique_index` : crée
  `reviews_author_subject_context_uniq (author_id, reviewable_type, reviewable_id, context_type,
  context_id) WHERE context_id IS NOT NULL`, puis retire l'ancien ; son `down()` refuse, en le
  disant, si deux sujets ont été notés sur une même preuve.
- [x] Deux commentaires de `ReviewController` qui nommaient l'ancien index.
- [x] `tests/Feature/Api/SujetsAgentDUnAvisTest.php`.

## Critères d'acceptation

- [x] AC1 — bien d'un bailleur, bail avec agent : l'agent du bail et le collaborateur accepté sont
  proposés, pas le bailleur ; `forAgent(client, bailleur)` = `null`, `forAgent(client, agent du
  bail)` = le bail.
- [x] AC2 — collaborateur `agent` au profil suspendu : ni proposé ni notable.
- [x] AC3 — réservation sans bail : ses collaborateurs sont proposés.
- [x] AC4 — l'hôte d'une agence `individual` n'est pas proposé.
- [x] AC5 — agent du bail puis collaborateur, même preuve : 201 et 201 ; second avis sur le même
  agent : 422 ; le bailleur : 403.
- [x] AC6 — la migration passe sur des avis existants ; son `down()` refuse sans rien supprimer.

## Hors périmètre

- Les avis déjà déposés sur un bailleur comme « agent » restent tels quels (décision du porteur).
- La ligne du § 3 d'ADR-0043 qui décrit l'ancien index : l'amendement le dit déjà, et `docs/adr/`
  est fermé à l'implémenteur.

## Notes d'implémentation

- Hypothèse : le profil propriétaire écarte **quel que soit son statut** (plus étroit que
  `PersonnelDeLAgence::estBailleur`, qui ne lit que l'actif), comme `BailleurDuBien::est`. Un bien
  sans agence n'a pas de personnel : seul l'agent du bail y est un sujet.
- Ablation : `ReviewEligibility.php` rendu à `pre-dev` → les 6 tests rouges ; migration retirée →
  AC5 (le second avis heurte l'ancien index) et AC6 rouges, les 4 autres verts ; tout remis → 6
  verts.
