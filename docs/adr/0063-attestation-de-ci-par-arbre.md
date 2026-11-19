# ADR-0063 — Une suite verte s'atteste par l'arbre qu'elle a éprouvé, et un arbre déjà attesté ne se rejoue pas ; la carte d'impact se régénère la nuit

- **Statut** : Accepté
- **Date** : 2026-10-13
- **Tickets** : [TCK-636](../backlog/tickets/done/TCK-636-ci-attestation-par-arbre.md) ·
  amendement §1 : [TCK-638](../backlog/tickets/done/TCK-638-ci-api-ignore-markdown.md) ·
  amendement §4 : [TCK-637](../backlog/tickets/done/TCK-637-ci-parallele-couverture-decouplee.md) ·
  amendement §5 : [TCK-2950](../backlog/tickets/doing/TCK-2950-ci-front-vitest-en-shards.md)

## Contexte

Le 2026-10-13, le porteur : *« quand on finit une fonctionnalité dans une branche, ça peut prendre
jusqu'à des heures pour qu'elle soit disponible, à cause des CI — et la plupart, c'est la même
chose qu'on exécute sur la PR vers `dev`, puis après le merge, puis sur la PR vers `preview`. »*

Mesuré sur les dernières livraisons (TCK-633, TCK-635) :

| Étape | Durée | Ce qui tourne |
|---|---|---|
| PR → `dev` | 17 à 23 min | api-ci, web-ci, repo-ci, filtrés par chemins |
| push sur `dev` (le merge) | 19 à 24 min | les mêmes, sur l'arbre que la PR vient d'éprouver |
| PR `dev` → `preview` | 28 à 42 min | `promotion-ci` : les trois **sans filtre** (TCK-524) |
| `images.yml` sur `preview` | 4 à 5 min | construction, poussée, déploiement |

**La même suite, sur le même arbre, trois fois.** Une PR vers `dev` est éprouvée sur son commit de
fusion (`refs/pull/N/merge`) ; fusionnée par `--merge` sur un `dev` qui n'a pas bougé, elle donne à
`dev` **exactement cet arbre**. `preview` étant un ancêtre de `dev`, la promotion éprouve à son tour
le commit de fusion `preview` + `dev`, dont l'arbre est **celui de `dev`**. Rien n'a changé entre
les trois exécutions, sauf un fichier, et c'est le second constat.

**Le commit du bot invalide l'arbre.** Le push sur `dev` régénère `takussan-api/tests/impact-map.json`
et le repousse (`[carte-impact]`, TCK-479) : la tête de `dev` — donc la promotion — porte un arbre
qu'aucune suite n'a éprouvé. Ce fichier n'est pas inerte : `tests/Support/ImpactMap.php`,
`TranslationUsage.php` et `bin/impacted-tests.php` le lisent.

**Les `paths:` des workflows ne disent pas ce qu'une suite lit.** Mesuré le 2026-10-13 : deux tests
du front lisent des fichiers de l'API que les `paths` de web-ci ne couvrent pas —
`booking-quote.concordance.test.ts` (`takussan-api/tests/fixtures/booking-quote.json`) et
`Alerts.test.tsx` (`app/Domain/Alerts/AlertableEvents.php`). Dans l'autre sens,
`SearchWolofReviewSheetTest` lit `takussan-web/src/messages/wo.json`. Aujourd'hui ces trous sont
rattrapés par la promotion, qui rejoue tout sans filtre. **Une clé calquée sur les `paths` les
ferait disparaître en silence.**

## Décision

### 1. Une suite verte dépose une attestation nommée par l'arbre qu'elle a éprouvé

Les deux jobs lourds — `lint-and-test` d'api-ci, `quality` de web-ci — sont précédés d'un job
`attestation` (`scripts/ci-attestation.mjs`). Il calcule une **clé** : le SHA-256 de
`git ls-tree -r HEAD` restreint au **périmètre de lecture** de la suite, plus le fichier du workflow
et le script lui-même. Un `ls-tree` porte le hachage de chaque blob : deux arbres de même clé ont le
même contenu, octet pour octet, sur ce périmètre.

| Suite | Périmètre de la clé |
|---|---|
| API | `takussan-api/`, `takussan-web/src/messages/` (mesuré : seule lecture hors de son dossier), `api-ci.yml`, le script |
| Front | `takussan-web/`, **tout** `takussan-api/` (ses tests lisent l'API à plusieurs endroits, dont deux hors `paths`), `web-ci.yml`, le script |

**Amendement du 2026-10-13 (TCK-638) — la documentation qu'aucune suite ne lit sort de la clé ET du
déclencheur d'api-ci** : `HORS_CLE` = `takussan-api/*.md` et `takussan-api/docs/**`. Sans lui,
retoucher `takussan-api/CLAUDE.md` rejouait la suite backend entière (PR #372). Mesuré : aucun test
PHP ni vitest ne lit ces fichiers. ⚠ **Pas « tous les `.md` »** : `CourtierAbsentTest` lit tous les
fichiers d'`app/`, `config/`, `routes/` et `database/` quelle que soit l'extension, et une fixture
`.md` vit sous `tests/fixtures/` — ces `.md`-là restent dans la clé. `git ls-tree` refusant
`:(exclude)`, le filtre s'applique à sa sortie ; `check-ci-attestation.mjs` exige que les négations
`'!…'` d'`api-ci.yml` soient exactement `HORS_CLE`, et qu'aucun motif n'atteigne un dossier de code.

Quand la suite est verte, son **dernier step** dépose l'artefact `ci-vert-<suite>-<clé>`
(conservé 7 jours).

### 2. Un arbre déjà attesté ne rejoue pas la suite

Le job `attestation` cherche cet artefact (`GET /repos/…/actions/artifacts?name=…`). Il retient une
attestation **non expirée**, déposée par un run **de ce dépôt** (ni fork : `head_repository_id`
égal au dépôt) et d'un des trois workflows qui la produisent (`api-ci`, `web-ci`, `promotion-ci`).
S'il la trouve, le job lourd est **sauté par son `if:`**, et le résumé du run nomme le run qui a
attesté. Un job sauté par `if:` compte comme **réussi** pour un check requis (documentation GitHub) :
la protection de `preview` est satisfaite sans rejouer.

**Toute incertitude rejoue.** Une erreur réseau, un 403, une réponse illisible → `deja-vert=false`,
avec un avertissement. Le job lourd porte `!cancelled()` : un job `attestation` en échec le laisse
tourner au lieu de le sauter. *Le seul défaut que ce mécanisme ne doit jamais avoir est de sauter
une suite qu'il n'a pas vue verte.*

**Ce qui tourne toujours** : les images (~2 min, ce sont elles que `preview` déploie),
`migrations-pgsql` (36 s) et les gardes de repo-ci (34 s). Leur coût ne justifie pas un mécanisme.

### 3. La carte d'impact se régénère la nuit, plus à chaque push

api-ci gagne `schedule` (02:30 UTC) et `workflow_dispatch`. Le `cov.php` et le step « Régénérer la
carte d'impact » passent du `push` sur `dev` à ces deux événements, sur `dev` seulement. Un push sur
`dev` redevient une exécution ordinaire — **sautée** quand la PR fusionnée a déjà attesté son arbre.
La nuit, la suite ne se saute **jamais** par attestation (elle doit produire `cov.php`) ; elle se
saute si **aucun fichier de l'API n'a changé** depuis le dernier commit de carte.

L'anti-boucle `[carte-impact]` reste en place, aux deux endroits : le commit du bot déclenche
toujours un `push` sur `dev`. `dev` reste **non protégée** (le bot y pousse avec `GITHUB_TOKEN`).

**Coût accepté** : une promotion dont la tête est le commit de carte de la nuit, sans fusion
après lui, rejoue la suite de l'API en entier (l'arbre a changé d'un fichier que les tests lisent).
Exclure la carte de la clé l'éviterait, au prix d'une attestation fausse sur ce qu'elle a éprouvé.

### 4. `--parallel` en CI : plus tard, dans un ticket à part (TCK-637)

Le gain mesuré est ×2,48, mais une seule exécution porte tests **et** couverture, et PCOV agrège
mal entre processus. Le découplage est un chantier distinct ; il ne conditionne pas celui-ci.

#### Amendement du 2026-11-16 (TCK-637) — deux jobs : les tests en `--parallel` jugent, la couverture séquentielle mesure, à côté

**Contexte.** Relevé le 2026-11-16 : `lint-and-test` dure **54 à 90 min** par PR (runs 43674090498,
43734501786, 43799491209), contre 17-23 min au moment de cet ADR — la suite a grossi (~16 300 tests).
Trois options étaient ouvertes : (a) deux jobs, (b) une couverture fusionnée par `phpcov merge`,
(c) la couverture sortie de la PR (nuit sur `dev`). **Décision du porteur : (a).**

- **`lint-and-test`** joue la suite par `php artisan test --parallel --processes="$(nproc)"`, sans
  pilote de couverture (`coverage: none`). Il porte aussi Pint et la garde Spatie. C'est lui qui
  **juge** les tests, et il dépose l'attestation `ci-vert-api-<clé>` comme avant : même nom, même
  clé, même sens — *les tests sont verts sur cet arbre*. Il ne dit plus rien du cliquet.
- **`couverture`** rejoue la suite **en un seul processus sous PCOV** — la seule forme qui donne un
  clover complet sans fusion, croyait-on : *démenti par la mesure, cf. l'amendement TCK-2951 ci-dessous* —, applique `bin/coverage-gate.php storage/coverage/clover.xml --min=92`
  sur chaque PR vers `dev`, publie le clover (et le HTML sur un rouge), produit `cov.php` la nuit ou
  à la demande sur `dev`, et pousse la carte d'impact (`contents: write` a suivi ce step ;
  `lint-and-test` redescend à `contents: read`).
- **Les deux jobs ne dépendent que d'`attestation`** : ils tournent **en même temps**, jamais l'un
  après l'autre.

**L'attestation : une par job, pas une pour les deux.** Le job `attestation` lance
`ci-attestation.mjs` deux fois — `api` et `api-couverture` — et expose deux jeux de sorties
(`deja-vert` / `artefact`, `deja-vert-couverture` / `artefact-couverture`). Chaque job lourd n'est
sauté que sur **son** artefact et ne dépose que le sien, en dernier step.

- *Pourquoi pas une seule attestation déposée par les tests* : un arbre aux tests verts et au
  cliquet rouge serait attesté ; le push sur `dev` et la promotion sauteraient alors `couverture`,
  et un job sauté passe un check requis. Le cliquet ne garderait plus que la première PR.
- *Pourquoi pas un troisième job qui attesterait « les deux verts »* : le porteur veut que le job qui
  juge les tests reste celui qui atteste (TCK-636), et un arbre aux tests verts n'a pas à rejouer ses
  tests parce que sa couverture a rougi.
- *La clé* : `api-couverture` a **le même périmètre de lecture** qu'`api` (c'est la même suite) ;
  le nom de suite entrant dans le hachage, les deux clés diffèrent, les deux artefacts aussi
  (`ci-vert-api-couverture-<clé>`). Le cliquet (`bin/coverage-gate.php`, le `--min` d'`api-ci.yml`)
  est dans ce périmètre : changer le seuil change la clé.
- *La nuit et à la demande* : `api-couverture` tourne quelle que soit l'attestation (il produit
  `cov.php`), `web` aussi (inchangé) ; `api` — les tests seuls — se saute comme ailleurs sur un arbre
  déjà attesté. `carte-courante` saute les deux volets de l'API.
- *Une fois* : `api-ci.yml` et `ci-attestation.mjs` sont dans les clés de toutes les suites — ce
  changement invalide toutes les attestations existantes, celles du front comprises. C'est voulu :
  une ancienne `ci-vert-api-…` disait « tests **et** cliquet » et ne doit pas servir sous le nouveau sens.

`scripts/check-ci-attestation.mjs` tient la forme pour les **trois** volets (needs, `!cancelled()`,
`deja-vert<suffixe>` du bon volet, dépôt de **son** artefact après sa preuve : `php artisan test
--parallel` pour les tests, `bin/coverage-gate.php` pour la couverture).

**Check requis.** `API / couverture` doit rejoindre les checks requis de `preview` et `master`, et
`promotion-ci.yml` le rejoue déjà (il appelle `api-ci.yml` en entier). La protection vit chez GitHub :
[action de déploiement](../deploiement/actions/2026-11-16-exiger-le-check-de-couverture.md).

**Conséquence assumée, et elle borne le gain.** `lint-and-test` rend son verdict bien plus tôt, mais
« tous les checks verts » attend `couverture`, **qui reste le chemin critique** de la PR — c'est ce
que J-12 disait déjà. Le gain mesurable est (1) le verdict des tests, (2) la durée de `couverture`,
allégée de Pint et des gardes, contre l'ancien job. Le temps total d'une PR ne baisse franchement
qu'avec (b) ou (c) ; ce sont les leviers suivants si la mesure le demande. **AC1 se mesure donc sur
les deux jobs et sur leur maximum**, trois exécutions avant, trois après.

**Risque à mesurer en CI** : `nproc` processus contre un seul service Meilisearch n'a été éprouvé
qu'en local (J-11). Une `MeilisearchNotIdleException` sur les premières exécutions se lit comme ce
risque, pas comme un défaut applicatif.

#### Amendement du 2026-11-16 (TCK-2951) — `couverture` passe en `--parallel` lui aussi

**Contexte.** L'amendement précédent gardait `couverture` en un seul processus parce que « PCOV agrège
mal entre processus » (J-12). Cette affirmation n'avait **jamais été mesurée**. Mesurée le 2026-11-16,
même arbre (`5b5e5c98f`), PCOV 1.0.12, runner `ubuntu-latest` à `nproc` 4, une seule variable — la
commande :

| `couverture` | run | durée du job | `Total:` |
|---|---|---|---|
| `php vendor/phpunit/phpunit/phpunit` (séquentiel) | 43942819541 | **77 min** | `96.9 % (74260 / 76633 lignes exécutables)` |
| `php artisan test --parallel --processes="$(nproc)"` | 43956403876 | **42,5 min** (step 2506 s) | `96.9 % (74265 / 76633)` · 17 498 tests |

Les deux clovers, comparés ligne par ligne : mêmes 2 175 fichiers, mêmes lignes exécutables ; le
parallèle couvre **toutes** les lignes du séquentiel, plus 5 (`SearchVerifyIndexes.php:90,94`,
`HealthcheckService.php:331,332,335`) — des branches qui dépendent de l'état d'un Meilisearch partagé
par 4 processus, donc un non-déterminisme de chemin, pas une erreur de fusion (0,007 %). ParaTest
fusionne lui-même les couvertures de ses workers (`CoverageMerger`) et écrit clover, HTML et PHP depuis
l'objet fusionné. En local (Xdebug, 8 processus, `tests/Feature/Auth`, 586 tests) : 169 s → 58 s,
0 ligne couverte différente, et `cov.php` ne perd **aucun** test par ligne pour la carte d'impact (il
en attribue davantage sur 133 lignes jouées une fois par worker : la carte relance un sur-ensemble).
**Décision du porteur (2026-11-16) : oui.**

- **`couverture`** joue `php artisan test --parallel --processes="$processus" [--coverage-php=…]
  --coverage-clover=… --coverage-html=…`, `processus=$(nproc)` imprimé dans le journal. Sorties, code
  de sortie, remontée des avertissements du lanceur, cliquet `--min=92` et attestation
  `ci-vert-api-couverture-<clé>` : inchangés.
- **`--parallel` en premier**, et **jamais** le drapeau `--coverage` de Collision : Collision arrête
  son analyse à la première option inconnue (`ignoreValidationErrors()`), et `--coverage` ajoute un
  second `--coverage-php` — les deux pièges de TCK-331. Le reste de la ligne passe tel quel à ParaTest,
  qui refuse une option inconnue. `scripts/check-ci-attestation.mjs` tient la forme : la commande qui
  écrit le clover doit être `php artisan test --parallel --processes=…`, aucun PHPUnit ni ParaTest
  direct dans le job, pas de `--coverage`.
- **Les deux jobs restent deux** (la structure de l'amendement TCK-637 tient) : `lint-and-test` juge
  sans pilote de couverture et rend son verdict plus tôt (18-20 min), `couverture` reste le chemin
  critique du « tout vert », ramené de ~77 à ~42 min.
- *Une fois* : `api-ci.yml` est dans la clé de l'API — ce changement invalide les deux attestations
  de l'API. `scripts/ci-attestation.mjs`, dans la clé des **deux** suites, n'est **pas** modifié (son
  commentaire « PCOV séquentiel » est donc périmé, et c'est ce paragraphe qui fait foi) : le toucher
  rejouerait aussi le front pour un commentaire.

**Reste à observer en CI** (TCK-2951, AC4) : l'écriture de `cov.php` en `--parallel` sur la suite
entière, la nuit sur `dev`. La fusion des workers est déjà éprouvée par le run 43956403876 (ParaTest
fusionne une fois, puis écrit **tous** les rapports demandés depuis l'objet fusionné, `WrapperRunner::
generateCodeCoverageReports()`) ; seul l'écrivain PHP, ~100 Mo sous `memory_limit=8G`, n'y a pas
tourné. Un échec y est bruyant (le step rougit, la carte n'est pas poussée), jamais une carte
silencieusement fausse.

#### Amendement du 2026-11-18 (TCK-2951, AC4) — `cov.php` revient au séquentiel, dans son propre step, la nuit

**Ce qui restait à observer a été observé, et c'est un échec.** L'écriture de `cov.php` depuis la
couverture fusionnée de ParaTest dépasse `memory_limit=8G` sur la suite entière : les deux nuits qui ont
suivi la fusion (runs 44069411083 et 44285658502) meurent dans `Report/PHP.php` (« tried to allocate
1823035392 bytes ») après une suite verte, sortie 255 — cliquet non évalué, carte d'impact non
régénérée. Le séquentiel tenait sous la même limite (dernière nuit verte : 16 novembre).

**Décision du porteur (2026-11-18)** : le step « Run tests » de `couverture` ne produit plus jamais
`cov.php` ; il ne porte que le clover, le HTML et le cliquet, en `--parallel`, à la même heure chaque
nuit. Un step **séquentiel** à part, « Produire cov.php », ne tourne que la nuit ou à la demande sur
`dev`, avant « Régénérer la carte d'impact » : `php artisan test --coverage-php=…`, sans `--parallel`
ni `--coverage` (la forme que `check-ci-attestation.mjs` laisse passer). Prix : une seconde exécution
de la suite, la nuit seulement. Écartés : 12 Go (repousse une limite qui grandit avec la suite), et
laisser la carte vieillir.

### 5. Le front : Vitest en shards, un agrégateur qui juge et atteste

#### Amendement du 2026-11-16 (TCK-2950) — quatre shards et un job statique en parallèle, le check requis devient l'agrégateur

**Contexte.** Relevé le 2026-11-16 (runs `web-ci.yml` 43921607586, 43916471402, 43915535384) : le job
unique `quality` dure ~30 min, dont **Vitest 18-26 min** — 1 919 fichiers, 17 076 tests,
`Duration 1575s (import 1520s, environment 1373s, tests 1260s)` sur un runner à 4 cœurs. Le coût est la
mise en place de chaque fichier (jsdom, imports), pas les tests : il se divise par le nombre de runners.
Le dépôt est public, les minutes de runners standards sont gratuites. **Décision du porteur : oui.**

- **`statique`** joue ESLint, `tsc --noEmit`, les gardes `check:*`, le build et le poids des routes.
- **`tests`** joue Vitest en matrice `shard: [1, 2, 3, 4]`, chaque shard sur son runner, par
  `npx vitest run --shard=${{ matrix.shard }}/${{ strategy.job-total }}` — le dénominateur se lit sur la
  matrice, il ne se recopie pas ; `fail-fast: false`, un shard rouge ne masque pas les autres.
- Les deux ne dépendent que d'`attestation` et sont sautés sur `deja-vert` : ils tournent **en même temps**.
- **`quality`**, l'**agrégateur**, garde **au caractère près** le nom du check requis de `preview` et
  `master` (`Front / Web (ESLint + tsc + Vitest + build)`) : la protection n'est pas touchée.
  `needs: [attestation, statique, tests]`, `if: ${{ !cancelled() }}`, et un step de verdict qui ne sort
  en 0 que si les deux `result` valent `success`, ou si une attestation a été trouvée **et** les deux
  valent `skipped`. Tout autre cas sort en 1.

**Pourquoi l'agrégateur tourne sous `!cancelled()` et juge lui-même.** Un job dont une dépendance a
échoué est *skipped*, et un *skipped* passe un check requis : sous le `if:` par défaut (`success()`),
un shard rouge rendrait le check requis… vert. L'agrégateur ne lit pas non plus `deja-vert` dans son
`if:` : il tourne toujours, c'est lui qui constate le saut.

**Une seule attestation, déposée par l'agrégateur — et pourquoi ce n'est pas le refus de §4.** Pour
l'API, l'amendement TCK-637 a écarté un troisième job qui attesterait « les deux verts » : les deux jobs
y rendent **deux verdicts distincts** (les tests, requis ; le cliquet, dont l'exigence attend son
[action de déploiement](../deploiement/actions/2026-11-16-exiger-le-check-de-couverture.md)), et un arbre aux
tests verts n'avait pas à rejouer ses tests parce que sa couverture rougissait. Ici, il n'y a **qu'un**
check requis, donc **un** verdict et **une** clé (`ci-vert-web-<clé>`, périmètre inchangé) : le job qui
juge, c'est l'agrégateur, et c'est lui qui atteste. Un shard vert n'atteste pas l'arbre — il n'en a vu
qu'un quart. Rejouer seulement le shard rouge est déjà offert par « Re-run failed jobs ».

- Le dépôt s'abstient sur le chemin déjà attesté (`deja-vert != 'true'`) : redéposer à chaque saut
  prolongerait sans fin la validité de 7 jours qui borne la dérive (§ « Ce que l'attestation ne garde pas »).
- `scripts/ci-attestation.mjs` **n'est pas modifié** : il est dans la clé de l'API, et le toucher
  invaliderait les deux attestations de l'API (≈ 77 min de `couverture` rejouées). `web-ci.yml`, lui,
  est dans la clé du front : ce changement invalide les attestations du front existantes, ce qui est voulu.

**Ce que §5 remplace pour le front.** Là où §1, §2 et la puce « Garde » des Conséquences disent « le
job lourd `quality` de web-ci » — sauté sur l'attestation, et qui dépose —, lire désormais : les jobs
lourds du front sont `statique` et `tests`, sautés et sans dépôt ; `quality` **n'est jamais sauté**, il
constate le saut ou juge, et dépose seul.

`scripts/check-ci-attestation.mjs` tient la forme : `statique` et `tests` sautés sur l'attestation et
sans dépôt ; aucun job autre que l'agrégateur ne dépose ; matrice exactement `[1..N]` et
dénominateur `strategy.job-total` (ou `N`) ; agrégateur nommé comme le check requis, sous
`!cancelled()` (ou `always()`), sans `deja-vert` dans son `if:`, avec un verdict qui lit les deux
`result` **avant** un dépôt qui ne tourne ni sur `always()`/`failure()` ni sur un arbre déjà attesté.

**Équilibrage.** Le découpage de Vitest trie les fichiers par SHA-1 de leur chemin et les coupe en
parts égales : 480/480/480/479 fichiers au 2026-11-16 ; rapporté aux durées par fichier du run
43921607586, le temps de tests par shard va de 284 à 335 s (écart max/moyenne ≈ 6 %). La mise en place,
qui domine, suit le nombre de fichiers. Le chemin critique attendu est `statique` (~8-9 min), non un
shard. **À mesurer en CI (TCK-2950, AC1)**, et cette mesure tranche, pas ce paragraphe.

## Conséquences

- **Le parcours attendu** : PR → `dev` complète (17-23 min) ; push sur `dev` en ~3 min (attestation,
  migrations, gardes) ; promotion en ~4 min (attestation, images, migrations, gardes). **À
  mesurer sur la première promotion qui l'emprunte**, et cette mesure tranche, pas ce tableau.
- Deux PR fusionnées à la suite : la seconde produit sur `dev` un arbre que ni l'une ni l'autre
  n'a éprouvé. Il n'a pas d'attestation, la suite tourne au push — c'est le cas où le push sur `dev`
  sert, et il reste servi.
- Une PR qui ne touche que l'API ne lance pas web-ci (filtre de chemins) ; l'arbre suivant n'a donc
  pas d'attestation du front, et la promotion rejoue le front. **C'est voulu** : c'est exactement
  ce qui rattrape les `paths` incomplets mesurés plus haut.
- **Garde** : `scripts/check-ci-attestation.mjs` tient la forme (job `attestation` en tête des deux
  workflows, `needs` + `!cancelled()` + sortie `deja-vert` sur le job lourd — sur les **deux** jobs
  lourds de l'API depuis TCK-637, chacun son volet —, dépôt de l'artefact au
  nom de la clé, `actions: read` accordé par `promotion-ci` à **chaque** appel — sans bloc
  `permissions`, le réglage du dépôt borne le jeton à `contents` et `packages`, et le run de
  promotion échoue au démarrage : mesuré sur #369, le 2026-10-13) et le périmètre de
  l'API : toute référence à `takussan-web/` dans le code de l'API doit tomber dans sa clé.

### Ce que l'attestation ne garde pas

- **Un collaborateur en écriture peut forger un artefact** — il peut aussi pousser. Le dépôt n'a
  qu'un porteur ; le filtre de dépôt écarte les forks, seul vecteur extérieur.
- **Un test qui dépend d'autre chose que l'arbre** — l'heure, une image de runner, un service
  externe — peut rougir sur une exécution que l'attestation a sautée. La validité de 7 jours borne
  cette dérive, sans l'annuler.
- **Une lecture hors périmètre qu'aucune garde ne voit** : un test du front qui lirait `docs/` ou
  `scripts/` à la racine échapperait à la clé. Relevé le 2026-10-13 : aucune lecture de ce genre,
  seulement des mentions en commentaire.
