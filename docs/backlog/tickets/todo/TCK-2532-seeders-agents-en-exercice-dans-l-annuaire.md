---
id: TCK-2532
title: "Seeders : des biens publics rattachés à des agents en exercice, pour que la démo montre un annuaire d'agents"
status: todo
phase: P1
family: back
estimate: S
wave: 85
created: 2026-11-09
updated: 2026-11-09
depends_on: [TCK-2506]
blocks: [TCK-2521]
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
tags: [back, seeders, directory, demo, audit-ux]
---

## Objectif utilisateur

Quiconque ouvre la démo (préproduction, poste de développement après `migrate:fresh --seed`) voit sur
`/fr/agents` un annuaire **d'agents en exercice**, comme la maquette de TCK-2521 le montre, et non une
page vide.

## Constat (mesuré le 2026-11-09, base de dev seedée, arbre de la vague 1)

- **L'annuaire est vide depuis TCK-2506** : `GET /api/public/agents?per_page=48` → `total 0`. Avant
  TCK-2506, il listait 44 lignes, **toutes de rôle `owner`** et aucune `agent`.
- La raison est dans le seeder qui pose le titulaire des biens :
  [`PropertySeeder.php:40`](../../../../takussan-api/database/seeders/Catalog/PropertySeeder.php)
  tire `$owners = $this->ctx->usersWithProfile(OwnerProfile::class, $agency->id)`, puis `:60`
  `$ownerIds`, `:70` `$ownerId = Tirage::un($ownerIds)` et `:175` `'user_id' => $ownerId`. **Tout bien a
  pour `properties.user_id` un titulaire d'`OwnerProfile`**, jamais un agent.
- [`PropertyCollaboratorSeeder.php:24-52`](../../../../takussan-api/database/seeders/Catalog/PropertyCollaboratorSeeder.php)
  rattache bien des agents (`AgentProfile`) à environ 40 % des biens, mais **en collaborateurs**
  (`property_collaborators`), que l'annuaire ne lit pas. `PublicAgentController::index` exige
  `whereHas('properties', publicPortfolio())`, c'est-à-dire `properties.user_id`.
- Comptes : 20 agents actifs (`AgentProfile` actif), 6 admins d'agence `standard` actifs, 247 biens
  du portefeuille public. **0** de ces biens a pour `user_id` un agent actif. Les 20 agents
  collaborent tous sur au moins un bien public.

## Contrat

- Les seeders produisent, pour chaque agence `standard` qui a des agents, des biens du portefeuille
  public dont `properties.user_id` est un agent **en exercice** (`AgentProfile` actif, agence active).
  Ordre de grandeur : la majorité des agents actifs, avec plusieurs biens chacun, pour que
  l'annuaire de TCK-2521 ait de quoi trier et paginer.
- Les propriétaires gardent leurs biens. Une partie d'entre eux reste **non listée** (défaut de
  TCK-2506), et quelques-uns ont `listed_in_public_directory = true`, pour que la démo montre aussi
  le cas « propriétaire qui l'a choisi ».
- Aucun changement de code applicatif : seulement les seeders (`database/seeders/`). Le tirage
  reste déterministe (`Tirage`).

## Critères d'acceptation

- [ ] Après `php artisan migrate:fresh --seed`, `GET /api/public/agents` rend un `total` non nul, et
      chaque ligne de rôle `agent` correspond à un `AgentProfile` actif d'une agence active.
- [ ] `/fr/agents` affiche des agents en exercice sur la démo, au téléphone et au bureau.
- [ ] Au moins un propriétaire `listed_in_public_directory = true` paraît dans l'annuaire, et les
      propriétaires non listés n'y paraissent pas (la règle de TCK-2506 tient sur les données seedées).
- [ ] Une recette d'API (test de seeder ou de feature) garde le compte non nul d'agents dans
      l'annuaire après le seed, vérifiée par ablation : retirer le rattachement aux agents la fait
      rougir.

## Hors périmètre / à trancher avant d'implémenter

- **Une alternative de produit, pas de seeder** : faire lire à l'annuaire les biens dont un agent est
  **collaborateur** (`property_collaborators`), et non seulement ceux dont il est titulaire. Les 20
  agents de la démo y apparaîtraient sans toucher aux seeders. Mais c'est un changement de règle
  publique, qui touche `PublicAgentController`, le sitemap et les compteurs de TCK-2518. Ce ticket ne
  le fait pas ; s'il est retenu, il faut un ticket à part et une mise à jour de
  `docs/features.md#12`.
- Le sens de `properties.user_id` (le bailleur, depuis TCK-142) ne change pas : un agent titulaire
  d'un bien de démo est un agent qui met **son propre** bien en annonce, ce qui est un cas réel.

## Notes d'implémentation

*(à remplir)*
