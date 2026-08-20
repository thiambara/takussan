---
id: TCK-320
title: "Sélection des tests par impact — 42 % de la suite est du plancher de harnais, et rien à optimiser dans les tests"
status: done
phase: P2
family: technique
estimate: M
wave: 41
created: 2026-08-17
updated: 2026-08-20
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

| Classes sélectionnées | Part | Temps plancher estimé |
|---|---|---|
| **1-5** | **81 %** | **≈ 5 s** |
| 6-20 | 10 % | ≈ 5-13 s |
| 21-100 | 4 % | ≈ 13-70 s |
| 101-350 | 6 % | ≈ 70-256 s |

Médiane 2 classes, p75 3, p90 13. **70 des 482 fichiers ne sont couverts par aucun test** — pour
eux, la bonne réponse est « rien à lancer », pas « lance tout ».

> **Mesuré de bout en bout une seule fois, le 2026-08-17** (ablation : une ligne vide ajoutée dans
> `app/Services/Search/PropertySearchService.php`, `load average` 5,2-5,8 sur 8 cœurs) : **4 classes
> sélectionnées, 26 tests, 16,7 s d'horloge** — ×2,8 le plancher **estimé** ci-dessus pour cette
> tranche, et un gain réel d'environ **×13** (contre 204-235 s pour la suite entière au repos), pas
> ~120×. Détail et raisonnement :
> [`docs/plans/2026-08-17-temps-d-execution-des-tests.md`](../../plans/2026-08-17-temps-d-execution-des-tests.md).

**Par commit mergé** — fin de ticket, sur 172 commits touchant `takussan-api/` : **102 / 172 (59 %)
retombent sur la suite entière** (97/172 avant le durcissement du sélecteur imposé par la revue
finale — cinq commits de plus pour fermer un quatrième chemin de faux vert). C'est correct, et c'est bien placé : le repli tombe au moment où
le rituel de fin de branche exige déjà la suite entière.

## Critères d'acceptation

- **AC1** — `php bin/impacted-tests.php` affiche la sélection, son motif, et l'âge de la carte.
  `--run` l'exécute. Une sélection silencieuse est une sélection qu'on ne peut pas mettre en doute.
- **AC2** — Un fichier `app/` **couvert** sélectionne ses classes ; **scanné mais non couvert**
  sélectionne **rien** ; **absent de la carte** impose la **suite entière**. Ces trois cas sont
  distincts et testés.
- **AC3** — `database/migrations/`, `database/factories/`, `database/seeders/`, `bootstrap/`,
  `config/`, `composer.lock`, `composer.json`, `phpunit.xml`, `tests/bootstrap.php` et
  `tests/TestCase.php` imposent la suite entière. Un seul suffit.
- **AC3bis** — **Le défaut de la boucle est d'ESCALADER, pas d'ignorer.** Tout chemin sous
  `takussan-api/` qui n'entre dans aucune règle impose la suite entière, sauf s'il figure dans une
  liste explicite de chemins inertes. Un fichier de `tests/` qui n'est pas une classe de test
  (`BaseTestCase`, `ApiTestCase`, les concerns, `tests/Support/`) escalade.

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
- **AC7** — ❌ **NON TENU — correction datée du 2026-08-17, le soir ; complétée le 2026-08-20.**
  La CI régénère la carte **sur push vers `dev` uniquement**, avec `[skip ci]` pour ne pas boucler.
  `dev` n'est pas protégée (vérifié le 2026-08-17).

  > **Complément du 2026-08-20 — la chaîne a désormais TOURNÉ, et l'AC reste NON TENU.** Les deux
  > phrases ne se contredisent pas, et la distinction est tout le sujet de cet AC.
  >
  > Ce qui a tourné : la cause de l'échec est corrigée ([TCK-331](TCK-331-coverage-php-en-double-casse-le-cliquet.md)),
  > et la session principale a joué la chaîne entière en local — suite complète sous couverture,
  > `2589 tests, 8210 assertions, 0 échec`, puis `Total: 86.6 %`, `✓ cliquet tenu`, puis
  > `carte écrite : 357 classes de test · 801 fichiers couverts`. La carte, gelée depuis le
  > 2026-08-17, est passée de **667 à 801 fichiers couverts** (+143, −9).
  >
  > Ce qui n'a toujours pas tourné : **le step de CI lui-même, et son commit automatique sur `dev`.**
  > Une exécution locale de la même commande n'est pas une exécution de CI — c'est très exactement
  > la substitution qui a fait cocher cet AC à tort la première fois. Aggravant, mesuré : aucun run
  > GitHub Actions n'est créé pour ce dépôt depuis le **2026-08-18T00:28Z**, donc la preuve exigée
  > n'est pas seulement absente, elle est présentement **inaccessible**.
  >
  > *La dérive mesurée confirme en revanche ce que la correction du 2026-08-17 avançait sans
  > preuve : la carte gelée s'émousse sans mentir. Un fichier absent de la carte fait retomber
  > `bin/impacted-tests.php` sur la suite entière — coûteux, jamais faux.*

  > **Cet AC a été coché le 2026-08-17 après-midi sur une LECTURE du workflow**, pas sur une
  > exécution : la condition `if: github.event_name == 'push' && github.ref == 'refs/heads/dev'`, le
  > `[skip ci]`, l'ordre `git add` avant `git diff --cached`. Tout cela est juste. **Rien de tout
  > cela n'avait jamais tourné.**
  >
  > `--coverage-php` et ce step sont arrivés sur `origin` avec le commit `656d6645`, poussé le
  > 2026-08-17 à 15h2x. Le dernier run vert d'API CI qui le précède (32014693898, sha `4eee25aa`)
  > ne contenait ni l'un ni l'autre — vérifié : `git show 4eee25aa:.github/workflows/api-ci.yml |
  > grep -c build-impact-map` rend **0**, et sa liste de steps s'arrête à 13.
  >
  > **Inventaire complet des exécutions ayant jamais produit `cov.php` :**
  >
  > | exécution | résultat |
  > |---|---|
  > | push `4bd5aa71` | morte AVANT, sur un 429 à l'installation Composer |
  > | PR #199, 1ʳᵉ | **rouge** — suite verte, sortie 1 sans un mot |
  > | PR #199, 2ᵈᵉ | `--coverage-php` retiré sur PR → verte |
  > | push `d7132beb` | **rouge** — 2552 tests passés, sortie 1 sans un mot |
  >
  > **Deux exécutions, deux échecs, zéro succès.** La cause est trouvée et porte son propre
  > ticket, [TCK-331](TCK-331-coverage-php-en-double-casse-le-cliquet.md) : `artisan test --coverage` passe DÉJÀ `--coverage-php` à PHPUnit en
  > interne — c'est ainsi qu'il construit sa table et évalue `--min`. Le passer une seconde fois le
  > fait écarter (`WARN Option --coverage-php cannot be used more than once`), le rapport d'artisan
  > ne se matérialise jamais, `--min` n'a rien à évaluer, et la commande sort en 1.
  >
  > **Conséquence, et c'est elle qui compte** : `takussan-api/tests/impact-map.json` n'a **jamais**
  > été régénérée automatiquement. Elle date de son unique construction manuelle (`eafab606`) et
  > vieillit depuis.
  >
  > **Ce que la carte gelée fait, et ne fait pas.** Elle s'émousse, elle ne ment pas : un fichier
  > de `app/` absent de la carte impose la **suite entière** (AC2/AC3bis) et la réparation de
  > péremption ajoute d'office toute classe de test modifiée depuis le commit de la carte (AC4) —
  > un ensemble qui grossit à mesure qu'elle vieillit. La sélection devient donc plus large et plus
  > lente, **jamais plus permissive**. Elle ne fabriquera pas de faux vert.
  >
  > *Pourquoi cette correction plutôt qu'une réécriture de l'AC :* ce ticket a coché un critère en
  > confondant « la configuration dit que » et « cela s'est produit » — la faute exacte que
  > `CLAUDE.md` documente sur le moteur de base de données et sur la chaîne de déploiement. Effacer
  > la trace effacerait aussi la leçon.
  >
  > ─────────────────────────────────────────────────────────────────────────────────────
  >
  > **ADDENDUM DU 2026-08-20 — la CAUSE est corrigée, l'AC RESTE non tenu.** Les deux choses
  > sont distinctes, et les confondre serait refaire la faute d'origine un cran plus loin.
  >
  > Ce qui a changé ([TCK-331](TCK-331-coverage-php-en-double-casse-le-cliquet.md)) : le step
  > de test n'appelle plus `artisan test --coverage`, mais **PHPUnit directement** — la seule
  > invocation qui accepte les trois sorties de couverture à la fois — et le cliquet est
  > évalué par `bin/coverage-gate.php` **sur le clover**. Le step « Régénérer la carte
  > d'impact » est réactivé. La chaîne entière a été jouée en local, de bout en bout, et
  > l'ablation refait revenir la sortie 1 muette.
  >
  > Ce qui n'a PAS changé : **aucune exécution de CI n'a encore régénéré la carte.** Il n'y a
  > toujours, à cette date, aucun commit `chore(tests): régénérer la carte d'impact` dans
  > l'historique, et `takussan-api/tests/impact-map.json` est toujours celle de `eafab606`.
  > Un correctif prouvé en local est un correctif prouvé en local ; cet AC porte sur un
  > comportement de la CI, et il ne se cochera que sur une exécution observée — pas sur la
  > lecture du workflow corrigé, pas davantage que sur celle du workflow d'origine.
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

> ✅ **Déposée en [TCK-325](TCK-325-garde-des-declencheurs-durs-du-selecteur.md) le 2026-08-17**, au
> moment de solder celui-ci. Le paragraphe ci-dessus était la seule trace de cette suite dans tout le
> dépôt : passer ce ticket `done` sans la déposer l'aurait effacée avec lui — et ce ticket aurait
> alors commis exactement la faute qu'il décrit. TCK-325 couvre les **trois** constantes, pas deux :
> `INERT_PREFIXES` est celle dont l'oubli fabrique un faux vert.

---

## Vérifié le 2026-08-17, avant de passer `done`

Aucun AC basculé sur la foi du plan — **sauf AC7, et c'est le sujet de sa correction datée
ci-dessus** : lui a été « vérifié » en lisant le workflow, sur un step qui n'avait jamais été
exécuté. Les huit autres ont été éprouvés sur l'état de `dev`, deux d'entre eux par ablation.

| AC | Vérification | Résultat |
|---|---|---|
| AC1 | `php bin/impacted-tests.php` | affiche la carte (`eafab606`), son âge, le nombre de commits de retard, le motif, puis la commande |
| AC2 | `ImpactSelectorTest` | les trois cas sont des tests distincts : *covered → ses classes*, *scanné non couvert → rien*, *absent → escalade* |
| AC3 | idem | **17 jeux de données** « global files escalate » |
| AC3bis | idem | `genuinely inert paths still select nothing`, `files outside the api are ignored`, défaut à l'escalade |
| AC4 | **ablation** : `commit` de la carte remplacé par 40 zéros | escalade, message explicite « le commit de la carte est introuvable […] → suite entière ». Carte restaurée, `git diff` vide |
| AC5 | `ls tests/Support/` · `grep -rl ImpactSelector app/` | `ImpactMap`, `ImpactSelection`, `ImpactSelector` sous `tests/Support/` · **0** fichier dans `app/` |
| AC6 | **ablation dans les deux sens**, code de sortie relevé hors tuyau | indice de classe hors bornes → **sortie 1** avec le nom du fichier et la borne ; carte saine → **sortie 0**. La péremption, elle, n'avertit que (`⚠`, sortie 0) |
| AC7 | ❌ **la vérification était une LECTURE, pas une exécution** — cf. l'encadré daté sous l'AC7 ci-dessus | `.github/workflows/api-ci.yml:256-297` est juste ligne à ligne, et n'avait **jamais tourné**. Deux exécutions l'ont depuis atteint, deux échecs. Cause et suite : [TCK-331](TCK-331-coverage-php-en-double-casse-le-cliquet.md) |
| AC8 | `CLAUDE.md` racine + `takussan-api/CLAUDE.md` | 6 et 4 occurrences, chacune portant la limite : *« un vert ici ne dit RIEN de la suite »* |
| AC9 | corps de ce ticket | 4 classes, 26 tests, **16,7 s** à `load average` 5,2-5,8 sur **8 cœurs** — mesuré par ablation, avec son contexte de charge |

Tests du sélecteur rejoués : **33 passés, 52 assertions**. Suite entière rejouée le même jour dans le
cadre de TCK-319 : **2441 passés, 2 ignorés, 7540 assertions, sortie 0**.

> Le code de sortie d'AC6 a d'abord été relevé **à travers un `| tail`**, qui rendait 0 : c'est le
> code de `tail`, pas celui de la garde. Repris sans tuyau. *Une vérification qui mesure son propre
> tuyau ne vérifie rien* — et cet AC porte précisément sur la capacité de la garde à faire rougir
> la CI.
