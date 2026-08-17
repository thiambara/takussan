---
id: TCK-320
title: "Sélection des tests par impact — 42 % de la suite est du plancher de harnais, et rien à optimiser dans les tests"
status: doing
phase: P2
family: technique
estimate: M
wave: 41
created: 2026-08-17
updated: 2026-08-17
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [back, tests, outillage, performance, ci]
---

## Objectif utilisateur

Qu'un agent qui modifie un fichier backend obtienne un retour de test en quelques secondes, au lieu
d'attendre 204 à 235 s la suite entière — sans qu'un vert de cette commande puisse jamais être
confondu avec un vert de la suite.

## Contrat de données

Aucune donnée applicative. Un fichier dérivé, `takussan-api/tests/impact-map.json` — **0,12 Mo
mesuré le 2026-08-17** sur 346 classes et 667 fichiers couverts sur 796 scannés :

```json
{ "version": 1, "commit": "…", "generated_at": "…",
  "classes": ["Tests\\Feature\\Api\\PropertyCrudTest", "…"],
  "scanned": ["app/Models/Property.php", "…"],
  "files":   { "app/Models/Property.php": [0, 12, 47] } }
```

**Dérivé, jamais édité à la main** — même règle que `docs/backlog/INDEX.md`.

## Contexte — ce que la mesure a dit, et ce qu'elle a démenti

Tout mesuré le **2026-08-17**, machine à **8 cœurs**, `load average` relevé à côté de chaque chiffre.
Détail complet et commandes : [`docs/plans/2026-08-17-temps-d-execution-des-tests.md`](../../plans/2026-08-17-temps-d-execution-des-tests.md).

**Deux hypothèses évidentes se sont révélées fausses**, et c'est ce qui justifiait de mesurer :

- **Il n'y a AUCUN point chaud.** La classe la plus lourde pèse 4,7 % ; 80 % du temps est réparti sur
  **175 classes sur 350**. Ramener à zéro les 25 classes les plus lourdes rendrait ~10 %.
- **Les 131 migrations coûtent ~1 s, une seule fois.** `RefreshDatabase` migre une fois par processus
  puis transige. Le « 131 × 2408 » qu'on aurait pu supposer n'existe pas.

**Ce qui coûte réellement** : le plancher du harnais. Pente mesurée entre deux sondes de 10 et
200 tests ne contenant que `assertTrue(true)` : **105,5 ms par test**, ordonnée à l'origine 3,2 s.
× 2408 = **254 s, soit 42 % de la suite**, pour des tests qui n'exécutent rien. C'est Laravel qui
reconstruit son conteneur (22 fichiers de config, 22 service providers) à chaque test.

**Il n'y a donc rien à optimiser dans les tests ; il n'y a qu'à en lancer moins.**

`config:cache` a été mesuré et **écarté** : 6 % de gain, contre la neutralisation des surcharges
d'environnement que `phpunit.xml` pose délibérément.

## Sélectivité mesurée — les deux bornes

PHPUnit conserve sous `--coverage-php` l'association *ligne de code → test*. **Vérifié, pas déduit** :
sur `PropertyCrudTest`, 20 tests → 20 identifiants distincts de la forme
`Tests\Feature\Api\PropertyCrudTest::test_requires_auth`. Carte complète produite en 891,8 s sous
Xdebug (`load average` 2,6 → 9,9) : 95 Mo bruts, **0,12 Mo** réduits à la granularité classe.

> Le premier jet de ce ticket annonçait 0,08 Mo. C'était une estimation prise sur une carte
> antérieure ; la carte réellement livrée en fait 0,12. *Un ordre de grandeur estimé n'est pas une
> mesure, et il vieillit dès qu'on ajoute des tests.*

**Par fichier modifié** — l'agent qui itère, sur les 482 fichiers `app/` réellement modifiés en
400 commits :

| Classes sélectionnées | Part | Temps plancher |
|---|---|---|
| **1-5** | **81 %** | **≈ 5 s** |
| 6-20 | 10 % | ≈ 5-13 s |
| 21-100 | 4 % | ≈ 13-70 s |
| 101-350 | 6 % | ≈ 70-256 s |

Médiane 2 classes, p75 3, p90 13. **70 des 482 fichiers ne sont couverts par aucun test** — pour
eux, la bonne réponse est « rien à lancer », pas « lance tout ».

**Par commit mergé** — fin de ticket, sur 172 commits touchant `takussan-api/` : **97 / 172 (56 %)
retombent sur la suite entière**. C'est correct, et c'est bien placé : le repli tombe au moment où
le rituel de fin de branche exige déjà la suite entière.

## Critères d'acceptation

- **AC1** — `php bin/impacted-tests.php` affiche la sélection, son motif, et l'âge de la carte.
  `--run` l'exécute. Une sélection silencieuse est une sélection qu'on ne peut pas mettre en doute.
- **AC2** — Un fichier `app/` **couvert** sélectionne ses classes ; **scanné mais non couvert**
  sélectionne **rien** ; **absent de la carte** impose la **suite entière**. Ces trois cas sont
  distincts et testés.
- **AC3** — `database/migrations/`, `database/factories/`, `database/seeders/`, `bootstrap/`,
  `composer.lock`, `composer.json`, `phpunit.xml`, `tests/bootstrap.php` et `tests/TestCase.php`
  imposent la suite entière. Un seul suffit.

  > `database/factories/` et `database/seeders/` **manquaient à la première rédaction de cet AC**,
  > et une revue de code l'a trouvé le 2026-08-17 : une factory est consommée par un nombre inconnu
  > de tests, donc la modifier rendait « rien à lancer » — **un vert sans qu'aucun test n'ait
  > tourné**. C'est la panne exacte que ce ticket existe pour rendre impossible.
- **AC4** — Les classes de test ajoutées ou modifiées **depuis le commit de la carte** sont ajoutées
  d'office. Si ce commit est introuvable (clone superficiel), la commande **escalade** au lieu de
  présumer la réparation faite.
- **AC5** — La logique vit sous `tests/Support/`, **jamais sous `app/`** : le cliquet `--min=86`
  n'a que 0,3 point de marge (~74 lignes), et un outil de développement n'a pas à la dépenser.
- **AC6** — `scripts/check-impact-map.mjs` échoue sur un défaut **structurel** (index hors bornes,
  clé de `files` absente de `scanned`, version inattendue) et **avertit** sur la péremption.
  Vérifié par ablation dans les deux sens.
- **AC7** — La CI régénère la carte **sur push vers `dev` uniquement**, avec `[skip ci]` pour ne pas
  boucler. `dev` n'est pas protégée (vérifié le 2026-08-17).
- **AC8** — `takussan-api/CLAUDE.md` et le `CLAUDE.md` racine documentent la commande **et sa
  limite** : un vert ici ne dit rien de la suite.
- **AC9** — Le gain réel est **mesuré et reporté dans ce ticket**, avec `uptime` et `hw.ncpu` à côté
  du chiffre.

## Ce que ce ticket ne fait pas

- Il ne réduit pas le plancher de 105 ms — le seul levier mesuré rend 6 % et est écarté.
- Il ne touche pas `--parallel` : c'est [TCK-321](TCK-321-parallel-en-ci.md), indépendant.
- Il ne touche pas la suite frontend ni aucune garde existante.

## Plan d'implémentation

[`docs/plans/2026-08-17-selection-par-impact-phase-1.md`](../../plans/2026-08-17-selection-par-impact-phase-1.md)
— sept tâches, TDD, code complet.

## Suites — trouvé à l'exécution, non fait ici

**La liste des déclencheurs durs est recopiée à la main dans `takussan-api/CLAUDE.md`, et rien ne
la garde.** Elle avait déjà dérivé du code **le jour où elle a été écrite** — `composer.json` y
manquait — et c'est une revue qui l'a vu, pas une garde. C'est exactement la famille de défaut que
les douze `scripts/check-*.mjs` de ce dépôt existent pour attraper : *un document dérivé qui cesse
de suivre sa source.*

Une garde qui compare `ImpactSelector::HARD_PREFIXES` / `::HARD_FILES` à ce que la documentation
énumère reste à écrire. Elle n'est pas dans le périmètre de ce ticket, et le laisser non dit
reviendrait à reproduire, un étage plus bas, le défaut que ce ticket corrige.
