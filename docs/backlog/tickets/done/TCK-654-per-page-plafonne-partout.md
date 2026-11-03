---
id: TCK-654
title: "`per_page` plafonné sur toutes les listes paginées par le contrôleur"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-15
updated: 2026-10-15
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#112-agence--équipe
  conventions:
    - docs/spatie-query-builder.md#pagination
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-2--performances-des-requêtes
tags: [back, performance, pagination, garde, pistes]
---

## Objectif utilisateur

Aucun client, authentifié ou non, ne fait rendre à l'API une page de taille arbitraire
(`per_page=10000`) : chaque liste paginée par le contrôleur plafonne la taille de page comme les
listes construites sur `HasQueryBuilder`.

## Contrat de données

Aucun endpoint neuf, aucune clé de réponse changée. Sur les routes concernées, `meta.per_page`
vaut désormais `min(per_page, 100)` ; un `per_page` absent, non numérique ou inférieur à 1 rend le
défaut de la route (20 le plus souvent, 50 pour le journal d'audit et les rôles, 15 pour la
modération des agences).

Réf : **P02.02** du fichier de pistes (classement A1 et A5 : le plafond attendu est écrit,
`HasQueryBuilder::PER_PAGE_MAX = 100`, et la garde ne resserre aucun seuil existant).

## Contraintes strictes (métier)

- Le plafond est celui de `HasQueryBuilder::PER_PAGE_MAX` (100), sauf là où le contrôleur en
  portait déjà un autre : l'audit transverse garde 200.
- Les lectures déjà bornées sur place (une vingtaine, dont les routes publiques à 48 et le
  sitemap) gardent leur comportement exact, `per_page=0` → 1 compris : des tests l'épinglent.
- Les `per_page` lus par `validated()` ne sont pas visés : leur FormRequest les borne par `max:`.

## Delta à produire

- [x] `Base\Controller::tailleDePage(Request, $défaut = 20, $max = PER_PAGE_MAX)` : la taille demandée
      bornée à `[1, $max]`, `$défaut` si elle est absente, non numérique ou < 1 (même règle que
      `HasQueryBuilder::getPerPage()`).
- [x] Les 28 lectures non bornées de `per_page` : 26, dans 26 contrôleurs, passent par ce helper ;
      les deux qui se bornaient à la ligne suivante (sitemap public, onboarding locataire) sont
      ramenées sur une ligne, à l'identique, `per_page=0` → 1 compris.
- [x] `tests/Unit/Architecture/PerPageBorneTest.php` : garde qui refuse, dans
      `app/Http/Controllers`, une lecture `$request->…('per_page'…)` sans `min(` sur la même ligne,
      hors du helper ; plancher de plausibilité du balayage.
- [x] `tests/Feature/Api/PerPagePlafondTest.php` : plafond effectif sur les membres d'agence et
      les annonces d'administration.

## Critères d'acceptation

- [x] AC1 — `GET /api/agencies/{id}/members?per_page=1000` rend `meta.per_page` = 100.
- [x] AC2 — `per_page=7` est honoré ; absent, `abc`, `0` ou `-3` rendent le défaut (20).
- [x] AC3 — `GET /api/admin/announcements?per_page=1000` rend `meta.per_page` = 100.
- [x] AC4 — la garde est rouge tant qu'une lecture non bornée subsiste, verte ensuite.

## Hors périmètre

- Ramener les lectures déjà bornées sur place vers le helper : refactorisation sans défaut.
- Une garde `scripts/check-*.mjs` : la CI ne joue que les gardes qu'elle nomme, et
  `.github/workflows/repo-ci.yml` n'est pas modifiable par ce ticket ; la garde est donc un test
  PHPUnit, que la suite de l'API joue.
- Les tailles de page lues hors des contrôleurs (`IndexPublicProfilesRequest::tailleDePage()`,
  déjà bornée).

## Notes d'implémentation

- Rouge avant correctif : `per_page=1000` → `meta.per_page` = 1000 sur les deux routes testées ;
  `per_page=abc` rendait 15 (défaut du modèle par `paginate(0)`) et non le défaut de la route.
- Ablation 1, contrôleurs remis à l'état d'avant (helper gardé) : 4 rouges sur 5. Ablation 2,
  `min()` retiré du helper seul : AC1 et AC3 rouges (1000 au lieu de 100).
- Piège : le premier nom, `perPage()`, est refusé par `scripts/check-pagination-envelope.mjs`
  (méthode de paginateur réservée, règle B). D'où `tailleDePage()`, le nom de
  `IndexPublicProfilesRequest`.
- Changement de bord assumé : sur les 26 routes, un `per_page` non numérique ou < 1 rend le défaut
  de la route, au lieu de `paginate(0)` → défaut du modèle (15). L'audit transverse et la
  modération des agences avaient déjà cette règle.
