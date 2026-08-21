---
id: TCK-338
title: "Une recherche à plusieurs mots doit les exiger tous"
status: todo
phase: P1
family: applicatif
estimate: M
wave: 42
created: 2026-08-21
updated: 2026-08-21
depends_on: [TCK-335]
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#24-recherche--filtres
  models:
    - docs/models-spec.md#3-property
tags: [back, search, meilisearch, adr]
---

## Objectif utilisateur

Un visiteur qui cherche « villa Saly » ne reçoit pas des villas de Dakar.

## Contrat de données

Sorti de [TCK-335](TCK-335-recherche-navigation-defauts-mesures.md) parce que c'est une **décision
structurelle** : passer le moteur public en conjonction change le contrat de la recherche pour tout
le site. Le dépôt exige un ADR **avant** l'implémentation.

Mesure fondatrice ([audit](../../qa/audit-recherche-navigation-2026-08-21.md) §1.1) : `q=villa Saly`
rend **exactement les mêmes 63 résultats, dans le même ordre**, que `q=villa`. Meilisearch applique
sa règle `words` — il retire les termes qui ne matchent pas plutôt que d'exclure les documents.

## Contraintes strictes (métier)

- **`matchingStrategy: 'all'` seul est un piège, et c'est mesuré** : `villa a louer a Dakar` → **0**,
  `a vendre` → **0**. Les trois leviers — mots vides, champ dérivé de vocabulaire (TCK-335 étape 8)
  et `all` — **ne se valident qu'ensemble** (mesuré : **47** avec les trois, **0** avec `all` seul).
- Il faut un **repli produit** : rejouer en `last` et exposer les termes relâchés. Sans lui, on
  remplace un mensonge par un cul-de-sac.

## Delta à produire

- [ ] **ADR** frère d'ADR-0008, écrit et fusionné avant tout code
- [ ] `matchingStrategy` conjonctive sur la recherche publique + repli explicite
- [ ] La réponse nomme les termes relâchés quand le repli joue

## Critères d'acceptation

- [ ] AC1 — `q=villa Saly` rend 0 **et** la réponse nomme le terme relâché
- [ ] AC2 — `q=villa à louer à Dakar` rend un compte non nul **strictement inférieur** à `q=villa`
      (sans AC2, AC1 se satisfait en cassant le service)

## Hors périmètre

- L'analyse d'intention (transformer un terme en valeur de filtre) : encore un cran plus loin.

## Notes d'implémentation

_(à remplir par implementing-specs)_
