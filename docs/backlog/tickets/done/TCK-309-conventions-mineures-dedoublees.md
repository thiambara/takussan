---
id: TCK-309
title: "Trois conventions dédoublées : classes de base de test, préfixes de commandes, namespaces d'auth"
status: done
phase: P3
family: technique
estimate: M
wave: 39
created: 2026-08-16
updated: 2026-08-17
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

- [x] **Tests** — trancher le rôle de chacune des trois classes de base, fusionner ou supprimer les
      redondantes, migrer les tests concernés, écrire la règle
- [x] **Commandes** — chercher les appelants de `takussan:create-super-admin` hors du code, puis
      converger vers `platform:` avec un alias déprécié si des appelants existent
- [x] **Namespaces** — trancher le partage `Auth/` ↔ `Api/Auth/`, déplacer, et vérifier que **aucun
      chemin d'URL** n'a changé
- [x] Garde CI pour chacune des trois : classe de base non canonique, préfixe de commande hors
      `platform:`, contrôleur d'auth hors du namespace retenu
- [x] Prouver chaque garde **par mutation**

## Critères d'acceptation

- [x] AC1 — une seule classe de base de test par usage, et la règle est écrite dans
      `takussan-api/CLAUDE.md`
- [x] AC2 — une seule commande de création de super-admin, et ses appelants hors code ont été
      inventoriés avant suppression
- [x] AC3 — les contrôleurs d'authentification vivent sous un seul namespace
- [x] AC4 — la table des routes exposées est **identique** avant et après — vérifiée par
      comparaison de `php artisan route:list`, pas par lecture
- [ ] AC5 — la suite backend reste verte, sans assertion assouplie
- [x] AC6 — chacune des trois gardes échoue si l'on réintroduit la convention supprimée

## Hors périmètre

- Le comportement de l'authentification, qui ne change pas.
- Les autres dettes de convention backend — TCK-304 à TCK-308.

## Notes d'implémentation

Trois commits sur `wave2/back-conventions-b` : `5093672d` (tests), `4fab5f6c` (commandes),
`d5e6e965` (namespaces). **Démarré sur consigne explicite de la session déléguante malgré
`depends_on: [TCK-279]`** : le backend de TCK-279 est mergé depuis la PR #176, seule l'UI restait
(PR #197), et elle ne touche ni les classes de base de test, ni les commandes, ni les namespaces
d'auth. Le frontmatter de TCK-279 n'a pas été modifié.

**1 — Les trois classes de base n'étaient pas trois concurrentes, mais une CHAÎNE** :
`Tests\TestCase` → `Tests\BaseTestCase` → `Tests\ApiTestCase`. Le maillon du milieu n'avait pas
d'usage propre — ses helpers ne servaient rien de particulier aux tests non-API — donc le partage
49/38 ne suivait aucune règle, seulement l'ordre d'écriture. Fondu et supprimé.

Il en reste **trois, et c'est délibéré** : les 10 tests unitaires purs qui étendent
`PHPUnit\Framework\TestCase` ne démarrent pas l'application, et c'est tout leur intérêt. « Une seule
classe de base **par usage** » (AC1) est donc satisfait à trois, pas à deux. La garde refuse en
revanche `Illuminate\Foundation\Testing\TestCase` en direct : il contourne la coupure de
synchronisation Scout de `Tests\TestCase::setUp()`, **et ce contournement est muet** — le test passe,
c'est la suite entière qui bascule plus tard (D-44).

**2 — L'ancien nom de commande SURVIT en alias, et ce n'est pas de la timidité.** L'inventaire des
appelants hors du code a rendu `docs/features.md:352` (§2.1) et son dérivé
`docs/features-by-actor.md:471` — deux documents qu'un ticket d'implémentation n'a pas le droit de
modifier. Rien dans `routes/console.php`, `scripts/`, `dev.sh`, `docker/`, `.github/`,
`docs/configuration.md` ni `docs/infra/`. Supprimer sec aurait laissé la spec prescrire une commande
inexistante pour le jour de l'installation d'un environnement.

L'alias est déclaré par `protected $aliases` et **avertit à chaque invocation**, en lisant
`$_SERVER['argv'][1]` — le seul endroit où Symfony expose le nom réellement tapé. Il n'avertit donc
pas sous `$this->artisan()` en test, où `argv[1]` est un argument de PHPUnit ; c'est sans
conséquence, et le test d'alias vérifie la RÉSOLUTION, pas l'avertissement.

Les deux commandes ne faisaient d'ailleurs **pas** le même travail, contrairement à ce qu'écrit D-38 :
`create` provisionne l'opérateur (user + 2FA + 8 codes de secours), `grant` promeut un user existant.
Ce qui était dédoublé, c'est le PRÉFIXE, pas la fonction — les deux restent.

**3 — La garde de namespace contrôle les DEUX bouts, et le second n'est pas redondant.** « Aucun
namespace `…\Auth` ailleurs » ne peut pas voir un contrôleur d'auth posé à la racine sous un nom
comme `LoginController` ; « tout ce que câble `routes/api/auth.php` vit sous `Api\Auth\` » l'attrape.
Une exception nommée : `Api\UserAdminController` sert `DELETE api/auth/account` — c'est du cycle de
vie utilisateur, et une route ne déplace pas un contrôleur.

**Déclencheur CI manquant, corrigé au passage** : `repo-ci.yml` n'avait aucun `paths` sur
`takussan-api/tests/**` (seulement `tests/impact-map.json`). Une PR n'ajoutant qu'une quatrième
classe de base n'aurait réveillé aucune ligne — le défaut exact que l'en-tête de ce fichier
documente.

**Ce qui reste** : cf. § *Reste sur dev*.

## Reste sur dev

Le ticket est en `review`, pas en `done`, et pour deux raisons précises.

**AC5 n'est pas prouvé par cet agent.** La suite backend entière n'a pas été lancée ici — c'est la
règle du dépôt (`CLAUDE.md` § *Qui lance quoi*) : la session déléguante la joue une fois, à la fin.
Ce qui A été lancé, machine partagée avec d'autres agents :

| Commande | Résultat |
|---|---|
| `php artisan test tests/Feature/Api/Admin tests/Feature/Invitation tests/Feature/Onboarding tests/Feature/Agency tests/Feature/Middleware tests/Feature/Team` | 295 passés, 1272 assertions, 54,7 s |
| `php artisan test tests/Feature/Auth` | 153 passés, 491 assertions, 24,3 s |
| `php artisan test tests/Feature/Console/CreateSuperAdminTest.php tests/Feature/Console/GrantSuperAdminCommandTest.php` | 16 passés, 67 assertions |
| `php artisan test tests/Feature/Testing/TestCaseHelpersTest.php tests/Unit/Testing/ImpactSelectorTest.php tests/Feature/Testing/TestSeederTest.php` | 35 passés, 75 assertions |
| `php artisan test tests/Feature/PropertyModerationTest.php` + 5 autres migrés | 47 passés, 200 assertions |
| `./vendor/bin/pint --test app routes tests` | `passed` |
| les 16 `scripts/check-*.mjs` | 16 verts |

Aucune assertion n'a été assouplie : les 49 fichiers migrés ne changent que leur `use` et leur
`extends`.

**`docs/ardoise.md` n'a pas été touché**, alors que ce ticket solde D-37, D-38 et D-40. C'est
délibéré : plusieurs agents travaillent en parallèle sur les dettes voisines (TCK-304 à TCK-308) et
trois branches qui réécrivent le même tableau se conflictent au merge. **À faire au centre, après
merge** — les trois lignes portent désormais un correctif, pas un constat.

**Deux points hors périmètre, à ne pas oublier :**

1. `docs/features.md` §2.1 prescrit toujours `takussan:create-super-admin`. Tant que c'est vrai,
   l'alias déprécié doit rester : `scripts/check-command-prefixes.mjs` rougit si on le retire sans
   avoir vidé `ALIAS_DEPRECIES_TOLERES`. La mise à jour de la spec relève d'une passe `/sync-specs`,
   pas de ce ticket.
2. `docs/superpowers/specs/2026-05-10-onboarding-discovery-design.md:448` cite aussi l'ancien nom.
   C'est une archive de conception datée — un fait d'histoire, pas une prescription vivante.

**`node docs/backlog/gen-index.mjs --check` sort en 1 sur cette branche** : `INDEX.md` est généré et
maintenu au centre, ce worktree ne le régénère pas.
