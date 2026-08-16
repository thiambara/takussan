---
id: TCK-302
title: "Aucune mesure de couverture, aucune parallélisation — ~2050 tests en 313 s et pas de garde-fou"
status: review
phase: P2
family: technique
estimate: M
wave: 38
created: 2026-08-16
updated: 2026-08-16
depends_on: [TCK-285]
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [back, tests, ci, couverture, performance, dette]
---

## Objectif utilisateur

Qu'une baisse de couverture se voie au moment où elle est introduite — et qu'attendre la suite ne
soit plus la raison pour laquelle on ne la lance pas.

## Contrat de données

Aucune donnée applicative. Mesuré le 2026-08-16 :

- `.github/workflows/api-ci.yml` passe `coverage: none` **deux fois** (lignes 42 et 192).
- Le bloc `<source>` de `phpunit.xml` n'alimente aucun rapport : ni seuil, ni tendance, ni
  garde-fou contre l'érosion.
- `--parallel` n'est configuré nulle part.
- Temps mesurés : **313 s machine au repos** (2026-08-15), 616 s sous contention (2026-08-12).

## Contraintes strictes (métier)

- **La suite est instable sous charge, et c'est une contrainte de conception pour ce ticket.**
  `waitForMeilisearch()` lève désormais au lieu d'abandonner en silence, et chaque processus a son
  préfixe d'index (ardoise D-44, correctif mergé en `a9524604`). La parallélisation doit être
  éprouvée contre ce défaut précis : plusieurs processus qui indexent en même temps sont exactement
  la condition qui a produit 14 échecs sur un ensemble différent à chaque exécution.
- **Un seuil de couverture posé au niveau courant est un cliquet, pas un objectif.** Le poser
  au-dessus de la mesure du jour casse la CI sans rien améliorer ; le poser en dessous ne garde
  rien. Mesurer d'abord, poser le seuil ensuite.
- La couverture n'est pas une preuve de qualité de test : TCK-285 a trouvé quatre défauts en
  **écrivant** les tests, pas en mesurant leur couverture. Le seuil garde contre l'érosion, il ne
  remplace pas la revue.

## Delta à produire

- [x] Mesurer la couverture réelle (lignes et méthodes) une première fois, et consigner le chiffre
      avec sa date
- [x] Activer la couverture en CI sur au moins un job, avec un seuil posé au niveau mesuré
- [x] Publier le rapport en artefact de build pour que la tendance soit consultable
- [x] Évaluer `--parallel` (`brianium/paratest`) : mesurer le gain réel, et le taux d'échec sur
      **cinq exécutions consécutives** avant de conclure — **fait : gain ~2,6× (204 s → 66-83 s),
      mais 5 exécutions sur 5 rouges. REFUSÉ**, cf. Notes d'implémentation
- [x] Si la parallélisation est retenue : vérifier l'isolation Meilisearch, base de données et
      cache entre processus — **vérifiée, et c'est justement là que ça casse** : Laravel supplante
      le jeton du dépôt en mode parallèle. La parallélisation n'est **pas** retenue
- [x] Documenter le temps de suite mesuré, au repos, dans `CLAUDE.md`

## Critères d'acceptation

- [x] AC1 — la CI produit un rapport de couverture consultable, et une baisse sous le seuil fait
      échouer le build → artefacts `couverture-api-clover` (`if: always()`) et `couverture-api-html`
      (`if: failure()`), plus le tableau par dossier dans le journal du job. Le franchissement du
      seuil a été **éprouvé localement** : `--min` au-dessus de la couverture rend
      `FAIL Code coverage below expected` et **sort en 1**
- [x] AC2 — le seuil est justifié par une mesure datée, pas par une valeur ronde choisie a priori
      → 86,16 % de lignes mesurés en local le 2026-08-16, **86,3 % confirmés en CI** (PR #176) ; seuil resserré de 85 à **86**
- [x] AC3 — si la parallélisation est activée, cinq exécutions consécutives rendent 0 échec ; sinon
      la décision de ne pas paralléliser est écrite avec sa raison → **elle n'est pas activée** :
      **5 exécutions sur 5 rouges**, dont un intermittent (3/5) qui a révélé [TCK-314](TCK-314-test-recherche-dependant-de-l-ordre.md)
- [x] AC4 — l'ajout de la couverture n'allonge pas le job de plus de 50 % du temps mesuré au repos,
      ou l'écart est justifié → **+36 %** (83 s → 113 s, comparaison appariée machine quasi au
      repos), donc **sous** la limite. Le step affiche sa durée à chaque exécution pour que cette
      mesure ne vieillisse pas en silence

## Hors périmètre

- L'écriture de nouveaux tests pour combler la couverture — TCK-285 pour les services et policies.
- L'instabilité Meilisearch elle-même, corrigée (D-44).

## Notes d'implémentation

### Toutes les mesures, avec leurs conditions

Chaque ligne porte son `etat` — la discipline de `docs/infra/versions.json` (TCK-298), appliquée ici
en prose parce que ce fichier n'était pas encore sur `dev` au moment du travail. **8 cœurs**
(`sysctl -n hw.ncpu`), `load average` relevé à l'`uptime` au départ de chaque exécution.

| Mesure | Valeur | `etat` | Conditions |
|---|---|---|---|
| Couverture de **lignes** d'`app/` | **86,16 %** (21 148 / 24 544) | `mesure` | suite complète, PCOV 1.0.12, 2026-08-16 |
| Couverture de **méthodes** | 66,87 % (1 821 / 2 723) | `mesure` | idem |
| Couverture de **classes** | 43,81 % (301 / 687) | `mesure` | idem |
| Suite complète, `artisan test` | **204 s**, 2313 tests, 7136 assertions, 2 ignorés, **0 échec** | `mesure` | load 8-29, Xdebug chargé |
| Suite complète, PHPUnit nu sans Xdebug | **83 s**, **0 échec** | `mesure` | load 8 |
| Suite complète, PHPUnit + PCOV + clover + HTML | **113 s**, **0 échec** | `mesure` | load 4-8 |
| **La même** commande PCOV, sous forte contention | **1240 s**, **0 échec** | `mesure` | load 20-258 → **×11** |
| Suite complète, `--parallel` ×5 | 66-83 s, **5/5 rouges** | `mesure` | load 11-27, Xdebug chargé |
| Surcoût de PCOV | **+36 %** (83 s → 113 s) | `mesure` | comparaison appariée, Xdebug coupé des deux côtés |

Le seuil `--min=86` est la couverture de **lignes** arrondie vers le bas. Il valait 85 à la
livraison, avec une marge qui couvrait le doute sur l'écart entre le PCOV compilé à la main et celui
de `setup-php` ; la CI ayant rendu **86,3 %**, ce doute est levé et le seuil est resserré comme
prévu.
C'est ce nombre-là que `collision` compare (`Coverage::report()` rend
`percentageOfExecutedLines()`) — vérifié dans `vendor/nunomaduro/collision/src/Coverage.php:105`.
Les chiffres du clover et ceux du rapport texte de PHPUnit concordent : ce n'est pas une source lue
deux fois.

### `--parallel` : mesuré, puis REFUSÉ — et le refus a payé

Le gain est réel : **204 s → 66-83 s, soit ~2,6×**, et il est même sous-estimé (contention
résiduelle sur les cœurs que la parallélisation veut justement utiliser). Ce n'est pas la raison du
refus.

La raison est que **les cinq exécutions sont rouges**, en deux familles distinctes :

| Test | Fréquence | Nature |
|---|---|---|
| `FakeDiskIsolationTest::test_faked_disks_are_rooted_in_a_per_process_directory` | **5/5** | déterministe, **par construction** |
| `FakeDiskIsolationTest::test_the_token_does_not_switch_laravel_into_parallel_mode` | **5/5** | déterministe, **par construction** |
| `PropertyIsTestExclusionTest::test_public_search_excludes_is_test_properties` | **3/5** | **intermittent** |

**Les deux premiers sont des gardes de D-44 qui affirment exactement ce que `--parallel` rend faux.**
En mode parallèle Laravel pose son propre jeton — racine observée `disks/public_test_5`,
`disks/public_test_3` au lieu de `disks/public_test_<pid+aléa>` — et **supplante** le quatrième
mécanisme de D-44. L'isolation reste assurée, mais par Laravel et non plus par le dépôt, et le
mécanisme du dépôt est court-circuité en silence. Activer `--parallel` n'est donc pas un
basculement de drapeau : il faut d'abord **décider** lequel des deux jetons gouverne, puis réécrire
ces deux gardes. Les supprimer pour faire passer la CI serait retirer la garde plutôt que la
question.

**Le troisième est un vrai trou, et c'est ce que la course a payé.** Relancé **seul**, comme l'exige
la règle du dépôt avant de conclure d'un rouge Meilisearch, il échoue de façon **déterministe** —
alors qu'il **passe** dans la suite complète séquentielle (vérifié sur deux exécutions
indépendantes). Le test ne passait donc que grâce à l'**ordre** de la suite, et ParaTest casse cet
ordre accidentel. `/api/public/properties/search` lit l'index Meilisearch sans repli
(`PropertySearchService::search()` → `Property::search(...)->raw()`) tandis que ce test ne porte pas
`InteractsWithMeilisearch` : il ne devrait jamais passer. Tant qu'il était vert, la règle métier
TCK-163 — *un bien `is_test` n'atteint jamais la surface publique* — n'était vérifiée par personne.
Ticket : **TCK-314**. Le mécanisme exact n'a pas été identifié, et c'est délibérément laissé au
ticket : le nommer avant de corriger, sinon on déplace la dépendance au lieu de la supprimer.

**`brianium/paratest` n'est PAS ajouté à `composer.json`** — il a servi à mesurer, puis a été
retiré (`git checkout composer.json composer.lock`). Une dépendance installée pour une option non
retenue est une décision prise en silence.

### Ce qui a été éprouvé et qui TIENT

Le risque attendu était Meilisearch : N workers indexant dans **une seule** instance qui traite ses
tâches en série, face à une barrière plafonnée à 10 s d'horloge qui **lève** désormais. Il ne s'est
pas produit. Les **15 classes** portant `InteractsWithMeilisearch`, jouées sur **4 processus,
5 fois de suite** : **106 tests, 319 assertions, 0 échec à chaque fois**, 28-36 s par exécution.
*Savoir où le blocage n'est pas vaut la mesure qui l'établit.*

L'isolation des quatre ressources partagées a par ailleurs été vérifiée dans le code :

| Ressource | Mécanisme | Vaut par worker ? |
|---|---|---|
| Base de données | `DB_DATABASE=:memory:` ; `TestDatabases::whenNotUsingInMemoryDatabase()` court-circuite le clonage | oui, par construction |
| Cache | `CACHE_STORE=array` | oui, par construction |
| Index Meilisearch | `TestSearchIndex` → `testing_<pid+aléa>_` | oui — engendré dans `tests/bootstrap.php` |
| Racine `Storage::fake()` | `TestFilesystemIsolation`, même jeton | **non en mode parallèle** — Laravel le supplante (cf. ci-dessus) |

### Le premier chiffre de ce ticket a été mesuré dans de mauvaises conditions, et ça se voit

La première exécution — celle qui a produit le chiffre de couverture — a été jouée sous `load
average` **200 à 258** (vitest et ESLint d'agents voisins, plus le langage server PHP de l'IDE à
~230 % de CPU) : **1240 s**. **La même commande, aux mêmes options**, rejouée deux heures plus tard à
load 4-8 : **113 s**. Soit **×11** — et cette fois la comparaison est propre, puisque seule la charge
diffère. Un test individuel passait de ~0,1 s à 2-3 s. Aucune mesure de **temps** n'était exploitable
dans cet état ; toutes ont été reprises une fois la machine retombée.

Deux choses, en revanche, **ne dépendent pas de la charge** — et cette exécution-là les a données :
le **pourcentage** de couverture, et le **nombre d'échecs**. Ce dernier vaut d'être retenu :
**0 échec sur 2313 tests à load 258**, c'est-à-dire dans les conditions exactes qui produisaient les
12 puis 4 échecs de D-44 sur un ensemble différent à chaque exécution. C'est une preuve **plus
forte** qu'une exécution au repos, pas une preuve dégradée : au repos, l'ancienne version passait
aussi.

### Décisions de mise en œuvre

- **PCOV et pas Xdebug** en CI (`coverage: pcov`) : Xdebug instrumente chaque opcode, PCOV se
  contente des lignes exécutables. Le job compte des lignes, il ne fait pas de pas-à-pas.
- **`pcov.directory` pointe sur `app/`** : sans lui PCOV collecte aussi `vendor/`, pour un résultat
  que le `<source>` de `phpunit.xml` filtre de toute façon à l'arrivée. Si ce chemin devenait faux,
  la couverture s'effondrerait et `--min` ferait **rougir** la CI — le mode de panne va dans le bon
  sens, ce qui est la raison de ne pas ajouter de garde supplémentaire.
- **Le second `coverage: none` est CONSERVÉ.** Le ticket en signalait deux ; ils ne sont pas le même
  défaut. Le job `migrations-mysql` n'exécute aucun test — il joue du DDL. Un pilote de couverture y
  coûterait son installation pour ne rien mesurer. Un commentaire le dit sur place, sinon la
  prochaine relecture le « corrigera par symétrie ».
- **DEUX artefacts, et la coupure est mesurée** : le clover pèse 1,9 Mo, le HTML **150 Mo
  décompressés** (768 fichiers, mesuré). Le clover part à **chaque** exécution — une tendance a
  besoin de tous ses points, y compris ceux des builds rouges. Le HTML part `if: failure()`
  seulement : c'est le détail à la ligne, ce qu'on ouvre le jour où le cliquet a sauté, et le
  publier partout reviendrait à payer 150 Mo par build pour un rapport ouvert quelques fois par an.
  PHPUnit écrit ses rapports même quand des tests rougissent, donc il existe bien à ce moment-là.
- **Le journal du job ne suffit pas, et c'est ce qui justifie les artefacts.** `collision` n'affiche
  son tableau par dossier — et **n'évalue `--min`** — que si la suite est VERTE
  (`vendor/nunomaduro/collision/src/Adapters/Laravel/Commands/TestCommand.php:130`). Sur une suite
  rouge, le journal est muet sur la couverture ; les fichiers, eux, sont écrits par PHPUnit
  directement puisque `--coverage-clover` et `--coverage-html` lui sont passés en direct.
- **`if-no-files-found: warn` et non `error`** : un échec ANTÉRIEUR du job (Pint, par exemple)
  laisserait le répertoire vide, et un second rouge masquerait le premier. Le garde-fou contre une
  couverture silencieusement cassée, c'est `--min`, pas ce step.
- **`set +e` autour de la commande de test** : le shell d'un step est `bash -e`, qui interromprait
  avant l'affichage de la durée — donc exactement sur l'exécution dont on veut connaître le temps.
- **`XDEBUG_MODE=coverage`, pas `-d xdebug.mode=coverage`**, pour la mesure locale : `artisan test`
  relance PHPUnit dans un **sous-processus**, où un `-d` posé sur l'artisan ne se propage pas. Le
  piège coûte un « Code coverage driver not available » trompeur ; il est écrit dans `CLAUDE.md`.
- **`/storage/coverage/` ajouté au `.gitignore`** : un rapport de couverture est une mesure datée ;
  commité, il devient une affirmation périmée sur l'état du dépôt.

### Rejeu

```bash
# couverture (le chiffre du cliquet)
XDEBUG_MODE=coverage php artisan test --coverage --min=86

# parallélisation — À NE REJOUER QU'APRÈS TCK-314 et l'arbitrage des gardes de FakeDiskIsolationTest
composer require --dev brianium/paratest
for i in 1 2 3 4 5; do /usr/bin/time -p php artisan test --parallel; done
uptime; sysctl -n hw.ncpu     # à relever À CÔTÉ du chiffre, sinon il ne dit rien
```

**Critère de réouverture, les deux conditions ensemble** : gain de temps net (acquis : ~2,6×) **et**
cinq exécutions à **0 échec** (aujourd'hui : 0/5). Une seule rouge sur cinq refuse.
