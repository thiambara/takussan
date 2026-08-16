---
id: TCK-309
title: "Trois conventions dédoublées : classes de base de test, préfixes de commandes, namespaces d'auth"
status: todo
phase: P3
family: technique
estimate: M
wave: 39
created: 2026-08-16
updated: 2026-08-16
depends_on: [TCK-279]
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
  models: []
tags: [back, convention, tests, commandes, namespace, refactor, dette]
---

## Objectif utilisateur

Qu'un développeur qui écrit un test, une commande ou un contrôleur d'authentification n'ait pas à
choisir entre deux emplacements également plausibles — parce qu'il n'en restera qu'un.

## Contrat de données

Aucun modèle nouveau. Trois dettes de la même famille, toutes confirmées le 2026-08-16 :

**1 — Trois classes de base de test (ardoise D-37).** `tests/TestCase.php`, `tests/BaseTestCase.php`
et `tests/ApiTestCase.php` coexistent sans règle écrite. `takussan-api/CLAUDE.md` tranche pour le
code neuf : `ApiTestCase` pour l'API.

**2 — Deux préfixes de commandes plateforme (ardoise D-38).** `takussan:create-super-admin`
(`app/Console/Commands/CreateSuperAdmin.php:26`, posée par TCK-263) et `platform:grant-super-admin`
(`app/Console/Commands/GrantSuperAdminCommand.php:19`) font le même travail. `CLAUDE.md` tranche
pour `platform:`.

**3 — Namespaces de contrôleurs d'authentification dédoublés (ardoise D-40).** L'authentification
est éclatée entre `app/Http/Controllers/Auth/` (**8** fichiers) et
`app/Http/Controllers/Api/Auth/` (**5**). Aucune règle n'a jamais été écrite pour ce partage.

## Contraintes strictes (métier)

- **Les trois se traitent ensemble parce qu'elles sont de même nature, pas parce qu'elles se
  touchent.** Chacune se livre en commit séparé et lisible.
- **La suppression d'une commande est une rupture d'interface opérateur.** `takussan:create-super-admin`
  est peut-être documentée dans un guide de déploiement ou dans un runbook : chercher ses appelants
  hors du code — documentation, scripts, `docs/infra/` — avant de la retirer.
- Le déplacement d'un contrôleur d'authentification change son namespace, donc potentiellement les
  noms de routes et les références de tests. Les routes exposées, elles, ne doivent pas bouger : un
  chemin d'URL qui change est une rupture pour le front.
- La règle retenue pour les classes de base de test s'écrit dans `takussan-api/CLAUDE.md`, sinon la
  convergence ne tient pas au premier test suivant.

## Delta à produire

- [ ] **Tests** — trancher le rôle de chacune des trois classes de base, fusionner ou supprimer les
      redondantes, migrer les tests concernés, écrire la règle
- [ ] **Commandes** — chercher les appelants de `takussan:create-super-admin` hors du code, puis
      converger vers `platform:` avec un alias déprécié si des appelants existent
- [ ] **Namespaces** — trancher le partage `Auth/` ↔ `Api/Auth/`, déplacer, et vérifier que **aucun
      chemin d'URL** n'a changé
- [ ] Garde CI pour chacune des trois : classe de base non canonique, préfixe de commande hors
      `platform:`, contrôleur d'auth hors du namespace retenu
- [ ] Prouver chaque garde **par mutation**

## Critères d'acceptation

- [ ] AC1 — une seule classe de base de test par usage, et la règle est écrite dans
      `takussan-api/CLAUDE.md`
- [ ] AC2 — une seule commande de création de super-admin, et ses appelants hors code ont été
      inventoriés avant suppression
- [ ] AC3 — les contrôleurs d'authentification vivent sous un seul namespace
- [ ] AC4 — la table des routes exposées est **identique** avant et après — vérifiée par
      comparaison de `php artisan route:list`, pas par lecture
- [ ] AC5 — la suite backend reste verte, sans assertion assouplie
- [ ] AC6 — chacune des trois gardes échoue si l'on réintroduit la convention supprimée

## Hors périmètre

- Le comportement de l'authentification, qui ne change pas.
- Les autres dettes de convention backend — TCK-304 à TCK-308.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
