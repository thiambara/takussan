---
id: TCK-2506
title: Annuaire public : les propriétaires particuliers n'y paraissent que s'ils l'ont choisi
status: todo
phase: P1
family: full
estimate: M
wave: 84
created: 2026-11-08
updated: 2026-11-08
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models:
    - "docs/models-spec.md#1-user"
tags: [back, front, directory, privacy, audit-ux]
---

## Objectif utilisateur

Un particulier qui confie son bien à une agence n'est pas exposé dans un annuaire public sans l'avoir voulu ; s'il le souhaite, il peut y paraître.

## Contrat de données

- Colonne `users.listed_in_public_directory` (boolean, défaut `false`, cf. `spec_refs.models`).
- `PublicAgentController::index` : un compte dont le `public_role` est `owner` n'est listé que si `listed_in_public_directory` est vrai. Un agent en exercice reste listé.
- `PublicAgencyController` (« L'équipe » d'une fiche d'agence) : ne liste que ses agents ; les compteurs du bandeau restent justes.
- La fiche `/agents/{slug}` d'un propriétaire non listé reste servie quand une de ses annonces publiques y mène, en `noindex`, absente du sitemap.
- `PATCH /api/me` (ou l'endpoint de préférences du profil existant) : la préférence est modifiable par le compte lui-même.

## Direction UX / Artistique

- Dans le profil du compte (console) : une bascule « Paraître dans l'annuaire public des propriétaires », avec une phrase sur ce qui devient public (nom, biens publiés).

## Contraintes strictes (métier)

- Défaut `false` pour **tous** les comptes existants : la migration n'en liste aucun d'office.
- Le sitemap et les données structurées `Person` suivent la même règle que l'annuaire.
- Seul le compte lui-même change sa préférence ; ni l'agence, ni la plateforme.

## Delta à produire

- [ ] Migration `add_listed_in_public_directory_to_users_table`.
- [ ] Filtre dans `PublicAgentController::index`, `PublicAgencyController` (équipe), sitemap.
- [ ] `noindex` sur la fiche d'un propriétaire non listé.
- [ ] Préférence modifiable par le compte (API + bascule du profil).
- [ ] Tests : `PublicDirectoryOwnerOptInTest` (non listé par défaut, listé après choix, agent toujours listé), `PublicAgencyTeamAgentsOnlyTest`, `SitemapOwnerOptInTest` ; test front de la bascule.

## Critères d'acceptation

- [ ] AC1 — Sur la base de démo, `/fr/agents` ne liste plus aucun propriétaire particulier tant qu'aucun ne l'a choisi.
- [ ] AC2 — « L'équipe » d'une agence ne liste que ses agents, et son compte correspond au bandeau.
- [ ] AC3 — Un propriétaire qui active la préférence apparaît dans l'annuaire et au sitemap.
- [ ] AC4 — La fiche d'un propriétaire non listé, ouverte depuis son annonce, répond 200 avec `noindex`.

## Hors périmètre

- La refonte visuelle de l'annuaire et des fiches d'agence (maquettes du lot suivant).

## Notes d'implémentation

_(à remplir par implementing-specs)_
