---
id: TCK-2519
title: Fiche de personne : URL au nom (`/agents/sokhna-gueye`), l'ancienne adresse redirigée
status: todo
phase: P1
family: full
estimate: M
wave: 85
created: 2026-11-09
updated: 2026-11-09
depends_on: []
blocks: [TCK-2523]
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models:
    - "docs/models-spec.md#1-user"
tags: [back, front, directory, seo, audit-ux]
---

## Objectif utilisateur

L'adresse d'une fiche dit qui l'on va voir (`/agents/sokhna-gueye`), pas le rôle ni l'agence (`/agents/dakar-immo-owner-4`) ; un lien déjà partagé continue de marcher.

## Contrat de données

- `users.public_slug` string(120) unique nullable (cf. `spec_refs.models`) : dérivé du nom affiché, translittéré, suffixé en cas de collision ; posé à la première fiche publique, recalculé au changement de nom ; les précédents dans `metadata.previous_public_slugs`.
- `GET /api/public/agents/{slug}` résout `public_slug`, puis un ancien `public_slug`, puis `username` ; pour les deux derniers, la réponse porte `canonical_slug` et le front redirige en **301**.
- Tout ce qui émet `owner.slug` / `agent.slug` (`PropertyResource::buildOwner()`, annuaire, équipe d'une agence, sitemap, données structurées `Person`) émet `public_slug` quand il existe.
- Commande de remplissage pour les fiches existantes (idempotente).

## Direction UX / Artistique

Sans objet. Maquette : `p=agent&a=d` (barre d'adresse des écrans bureau).

## Contraintes strictes (métier)

- Un slug ne révèle rien qu'une fiche ne montre déjà : le propriétaire sur option (1b) a un nom **abrégé** sur sa fiche, son slug l'est aussi (`awa-d`).
- Unicité sous la collation déterministe de la base (pas de doublon par la casse : slug en minuscules ASCII).
- Une ancienne adresse ne redirige jamais vers une fiche qui n'est plus publique : 404.

## Delta à produire

- [ ] Migration + calcul du slug (service unique) + remplissage.
- [ ] Résolution à trois niveaux et `canonical_slug`.
- [ ] Émetteurs de slug alignés ; sitemap.
- [ ] Front : redirection 301 sur `canonical_slug` (page `agents/[slug]`).
- [ ] Tests (collision, abréviation du propriétaire, redirection, ancien slug d'une fiche devenue privée → 404).

## Critères d'acceptation

- [ ] AC1 — `/fr/agents/dakar-immo-owner-4` répond 301 vers `/fr/agents/<slug au nom>`.
- [ ] AC2 — Deux « Awa Diop » obtiennent `awa-diop` et `awa-diop-2`.
- [ ] AC3 — Après changement de nom, l'ancien slug redirige vers le nouveau.
- [ ] AC4 — Aucun émetteur ne sert encore `username` quand `public_slug` existe (balayage des ressources).

## Hors périmètre

- Le slug des agences (déjà au nom).

## Notes d'implémentation

_(à remplir par implementing-specs)_
