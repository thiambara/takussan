# `--parallel` en CI — plan d'implémentation (phase 2)

> **Pour un agent :** ce plan s'exécute tâche par tâche. Les étapes sont des cases à cocher.

**Conception :** [`docs/plans/2026-08-17-temps-d-execution-des-tests.md`](2026-08-17-temps-d-execution-des-tests.md),
section « Phase 2 ». Historique du refus : ardoise **D-30**.

**But :** faire passer la suite de 204-235 s à 66-83 s **en CI et au rituel de fin de branche**, sans
réintroduire la panne que D-44 a soldée.

**Indépendant de la phase 1.** Aucune des deux ne dépend de l'autre.

**Pile :** `brianium/paratest` (à installer), Laravel `ParallelTesting`, `Tests\Support\TestProcessToken`.

## Contraintes globales

- **Critère de bascule, non négociable (D-30) :** gain de temps net **ET** **cinq exécutions
  consécutives à 0 échec**. Une seule rouge sur cinq refuse. Un rouge Meilisearch se relance
  **seul** avant d'être compté (D-44).
- **`uptime` et `sysctl -n hw.ncpu` relevés à côté de chaque chiffre.** Sans eux, un temps de suite
  ne dit rien : le facteur mesuré entre repos et saturation est de **×11**.
- **`--parallel` ne devient PAS le défaut local.** La suite occupe 0,73 cœur sur 8 ; `--parallel` la
  fait passer à 8. Deux agents qui parallélisent simultanément demandent 16 cœurs à une machine qui
  en a 8.
- Français, préfixe conventionnel, ticket cité. `./vendor/bin/pint` avant chaque commit.

---

### Task 1 : solder la dette documentaire de D-30

**Files:**
- Modify: `docs/ardoise.md` — entrée D-30, section « Volet parallélisation ».

**Motif.** D-30 pose deux conditions de réouverture. **La première est remplie depuis le
2026-08-16** — TCK-314 est `done` et mergé (PR #192, commit `4929df7f`) — et l'ardoise l'ignore
encore. *Une condition levée qu'un document continue de présenter comme bloquante bloque pour de
bon.* C'est exactement le défaut que l'ardoise existe pour attraper ailleurs.

- [ ] **Step 1 : vérifier plutôt que croire ce plan**

```bash
cd /Users/aminethiam/Documents/perso/takussan
grep -n '^status:' docs/backlog/tickets/TCK-314-test-recherche-dependant-de-l-ordre.md
git log --oneline --grep='TCK-314' -3
```

Attendu : `status: done`, et le commit `4929df7f` présent sur `dev`.

- [ ] **Step 2 : corriger la ligne de condition**

Dans `docs/ardoise.md`, remplacer :

```
silence. Condition de réouverture : **TCK-314 soldé**, puis la question des deux gardes de
```

par :

```
silence. Condition de réouverture : ~~TCK-314 soldé~~ — **fait le 2026-08-16** (PR #192,
`4929df7f`) — puis la question des deux gardes de
```

- [ ] **Step 3 : corriger la formulation de la seconde condition**

Toujours dans D-30, après le paragraphe « Décision : `--parallel` n'est PAS activé », insérer :

```markdown
> **La seconde condition était MAL FORMULÉE, et la corriger change le travail à faire.** « Décider
> lequel des deux jetons gouverne » suppose qu'ils répondent à la même question. Ils n'y répondent
> pas : `ParallelTesting::token()` (`1`, `2`… `N`) isole les **workers entre eux** ;
> `Tests\Support\TestProcessToken` (pid + aléa) isole les **exécutions simultanées entre elles** —
> le cas de deux agents. Choisir le premier réintroduit exactement la panne que D-44 a soldée :
> deux agents en `--parallel` obtiennent tous deux `public_test_1`. Il faut les **composer**,
> pas en élire un.
```

- [ ] **Step 4 : commit**

```bash
git add docs/ardoise.md
git commit -m "docs(ardoise): D-30 — TCK-314 est soldé depuis six semaines, et la seconde condition était mal posée (TCK-321)"
```

---

### Task 2 : composer les deux jetons

**Files:**
- Modify: `takussan-api/tests/Support/TestProcessToken.php`
- Modify: `takussan-api/tests/Support/TestFilesystemIsolation.php`
- Test: `takussan-api/tests/Unit/Testing/FakeDiskIsolationTest.php`

**Interfaces:**
- Produit : `TestProcessToken::value(): string` rend `<pid+aléa>` hors mode parallèle et
  `<pid+aléa>_<index worker>` en mode parallèle.

- [ ] **Step 1 : lire l'existant avant de le modifier**

```bash
cd takussan-api
cat tests/Support/TestProcessToken.php
cat tests/Support/TestFilesystemIsolation.php
cat tests/Unit/Testing/FakeDiskIsolationTest.php
```

- [ ] **Step 2 : écrire les tests qui échouent**

Réécrire `takussan-api/tests/Unit/Testing/FakeDiskIsolationTest.php`. Les deux gardes existantes
affirment aujourd'hui ce que `--parallel` rend faux ; la nouvelle version affirme la propriété
**qui doit tenir dans les deux modes** — que la racine du disque factice est unique par
*(exécution, worker)*.

```php
<?php

namespace Tests\Unit\Testing;

use Illuminate\Support\Facades\Storage;
use Tests\Support\TestProcessToken;
use Tests\TestCase;

/**
 * La SECONDE cause de non-déterminisme, découverte en rejouant l'épreuve des deux
 * suites parallèles une fois la course Meilisearch supprimée (D-44).
 *
 * `Storage::fake('public')` enracine le disque factice dans
 * `storage/framework/testing/disks/public` — un chemin PARTAGÉ par tous les
 * processus de la machine — et commence par VIDER ce répertoire. Deux suites
 * simultanées s'arrachaient les fichiers l'une sous l'autre.
 *
 * ⚠ CE QUI A CHANGÉ EN PHASE 2, et pourquoi les anciennes assertions ont disparu.
 * Elles affirmaient que le jeton vaut EXACTEMENT `TestProcessToken::value()` et que
 * `LARAVEL_PARALLEL_TESTING` est absent — deux affirmations que `--parallel` rend
 * fausses par construction. Or les deux jetons ne répondent pas à la même question :
 *
 *   · `ParallelTesting::token()` (1, 2… N) isole les WORKERS ENTRE EUX ;
 *   · `TestProcessToken` (pid + aléa) isole les EXÉCUTIONS SIMULTANÉES entre elles.
 *
 * Élire le premier, c'est redonner `public_test_1` à deux agents à la fois — la
 * panne d'origine. Ils sont donc COMPOSÉS, et ce que ces tests gardent désormais est
 * la propriété qui compte réellement : la racine est unique par (exécution, worker),
 * dans les DEUX modes.
 */
class FakeDiskIsolationTest extends TestCase
{
    public function test_faked_disks_are_rooted_in_a_per_process_directory(): void
    {
        $root = rtrim(Storage::fake('public')->path(''), DIRECTORY_SEPARATOR);

        $this->assertStringEndsWith(
            'disks'.DIRECTORY_SEPARATOR.'public_test_'.TestProcessToken::value(),
            $root,
        );
    }

    public function test_the_token_always_carries_the_per_run_discriminant(): void
    {
        $this->assertStringStartsWith(
            TestProcessToken::runDiscriminant(),
            TestProcessToken::value(),
            'le discriminant PAR EXÉCUTION doit survivre au mode parallèle : sans lui, '
            .'deux agents obtiennent le même jeton et se détruisent mutuellement',
        );
    }

    public function test_the_worker_index_is_appended_only_in_parallel_mode(): void
    {
        $inParallel = isset($_SERVER['LARAVEL_PARALLEL_TESTING']);

        $this->assertSame(
            $inParallel,
            str_contains(TestProcessToken::value(), '_'),
            $inParallel
                ? 'en mode parallèle, l\'index du worker doit être présent'
                : 'hors mode parallèle, il n\'y a pas de worker à distinguer',
        );
    }
}
```

- [ ] **Step 3 : lancer les tests pour vérifier qu'ils échouent**

```bash
cd takussan-api && php artisan test tests/Unit/Testing/FakeDiskIsolationTest.php
```

Attendu : ÉCHEC sur `TestProcessToken::runDiscriminant()` (méthode inexistante).

- [ ] **Step 4 : composer les jetons**

Réécrire `takussan-api/tests/Support/TestProcessToken.php` :

```php
<?php

namespace Tests\Support;

/**
 * Le jeton qui identifie CE processus de test.
 *
 * Deux ressources partagées par machine se détruisaient mutuellement quand deux
 * exécutions de la suite se chevauchaient — les index Meilisearch
 * (cf. {@see TestSearchIndex}) et la racine des disques `Storage::fake()`
 * (cf. {@see TestFilesystemIsolation}). Les deux se règlent par le même moyen, un
 * discriminant par processus : il n'existe donc qu'ici, et une seule fois.
 *
 * pid ET aléa : le pid seul est réutilisé par le système, et deux exécutions
 * successives se marcheraient dessus si la première a été tuée avant son nettoyage.
 * Format hexadécimal, sans séparateur, pour rester un identifiant valide partout
 * (nom d'index Meilisearch, nom de répertoire).
 *
 * ⚠ DEUX ÉTAGES, ET IL FAUT LES DEUX (phase 2, TCK-321). En `--parallel`, Laravel
 * pose son propre jeton — `1`, `2`… `N` — qui isole les WORKERS ENTRE EUX mais PAS
 * les exécutions entre elles : deux agents qui parallélisent obtiendraient tous deux
 * `public_test_1`, soit exactement la panne que D-44 a soldée. Les deux jetons ne
 * répondent donc pas à la même question, et on les COMPOSE :
 *
 *     hors parallèle :  <pid+aléa>
 *     en parallèle   :  <pid+aléa>_<index worker>
 *
 * Le discriminant par exécution est en TÊTE : c'est lui qui survit, et c'est lui que
 * `FakeDiskIsolationTest` garde.
 */
final class TestProcessToken
{
    private static ?string $run = null;

    private static ?string $worker = null;

    private static bool $workerResolved = false;

    /** Le discriminant PAR EXÉCUTION — stable dans un processus, unique entre exécutions. */
    public static function runDiscriminant(): string
    {
        return self::$run ??= dechex(getmypid() ?: 0).bin2hex(random_bytes(3));
    }

    /**
     * Le jeton complet : discriminant d'exécution, plus l'index du worker quand
     * Laravel tourne en mode parallèle.
     *
     * `LARAVEL_PARALLEL_TESTING` et `TEST_TOKEN` sont posés par `artisan test
     * --parallel` dans l'ENVIRONNEMENT du processus fils : ils existent donc dès
     * son démarrage, avant `tests/bootstrap.php`. C'est ce qui rend la capture de
     * {@see self::workerIndex()} sûre au premier appel.
     */
    public static function value(): string
    {
        $worker = self::workerIndex();

        return $worker === null
            ? self::runDiscriminant()
            : self::runDiscriminant().'_'.$worker;
    }

    /**
     * L'index du worker que ParaTest a posé, ou `null` hors mode parallèle.
     *
     * ⚠ CAPTURÉ AU PREMIER APPEL, ET MÉMORISÉ. `TestFilesystemIsolation` écrit dans
     * `TEST_TOKEN` : sans mémorisation, un appel postérieur à cette écriture relirait
     * NOTRE valeur comme si elle venait de ParaTest, et la composerait une seconde
     * fois. La mémorisation supprime aussi toute dépendance à l'ordre des deux
     * `install()` de `tests/bootstrap.php` — ordre qu'il ne faut pas avoir à connaître
     * pour lire ce fichier.
     */
    private static function workerIndex(): ?string
    {
        if (! self::$workerResolved) {
            self::$workerResolved = true;

            if (isset($_SERVER['LARAVEL_PARALLEL_TESTING'], $_SERVER['TEST_TOKEN'])) {
                self::$worker = (string) $_SERVER['TEST_TOKEN'];
            }
        }

        return self::$worker;
    }
}
```

- [ ] **Step 5 : faire composer `TestFilesystemIsolation` au lieu de renoncer**

**Le fichier ne fait pas ce que la tâche supposait, et c'est le vrai défaut à corriger.**
`TestFilesystemIsolation::install()` **sort par le haut** quand `TEST_TOKEN` est déjà posé :

```php
        // `php artisan test --parallel` (ParaTest) pose son propre jeton par
        // worker : on ne l'écrase pas, sous peine de faire diverger la racine
        // des disques de la base de données du worker.
        if (isset($_SERVER['TEST_TOKEN'])) {
            return;
        }
```

Conséquence, à vérifier avant de corriger : **en `--parallel`, l'isolation par exécution ne
s'applique pas du tout au système de fichiers** — la racine vaut `public_test_1`, identique pour
deux agents. C'est précisément la panne de D-44, et elle est déjà là, en sommeil, parce que
personne ne lance `--parallel`.

Remplacer ce bloc par une composition :

```php
        // ParaTest pose son propre jeton par worker dans TEST_TOKEN. On ne le jette
        // PAS — il isole les workers entre eux — mais on ne s'en contente pas non
        // plus : lui seul redonnerait `public_test_1` à deux agents simultanés, soit
        // exactement la panne que D-44 a soldée. `TestProcessToken::value()` le lit
        // (il l'a capturé au premier appel) et le compose avec le discriminant
        // d'exécution. Un seul écrivain, une seule valeur.
        $token = TestProcessToken::value();
```

**Ne pas toucher** au bloc `⚠ On ne pose PAS LARAVEL_PARALLEL_TESTING` du docblock : il reste vrai
et il reste la raison pour laquelle `TestDatabases`/`TestCaches` restent inactifs hors `--parallel`.

- [ ] **Step 5bis : vérifier que le renommage de la racine ne casse rien en parallèle**

Le commentaire supprimé avançait un risque — *« faire diverger la racine des disques de la base de
données du worker »* — qui n'a jamais été mesuré. Il faut le trancher, pas le reconduire.

```bash
cd takussan-api && grep -rn 'DB_CONNECTION\|DB_DATABASE' phpunit.xml
```

Attendu : `DB_CONNECTION=sqlite`, `DB_DATABASE=:memory:`. Une base en mémoire n'a pas de nom à
suffixer : `TestDatabases` n'a rien à faire diverger. **Si la valeur a changé depuis**, ce step
devient bloquant et le risque doit être mesuré avant de poursuivre.

- [ ] **Step 6 : lancer les tests pour vérifier qu'ils passent, dans les DEUX modes**

```bash
cd takussan-api
php artisan test tests/Unit/Testing/FakeDiskIsolationTest.php
```

Attendu : `Tests: 3 passed`.

Le mode parallèle se vérifie à la tâche 3, une fois ParaTest installé.

- [ ] **Step 7 : Pint, puis commit**

```bash
cd takussan-api && ./vendor/bin/pint tests/Support/ tests/Unit/Testing/FakeDiskIsolationTest.php
cd .. && git add takussan-api/tests/Support/TestProcessToken.php takussan-api/tests/Support/TestFilesystemIsolation.php takussan-api/tests/Unit/Testing/FakeDiskIsolationTest.php
git commit -m "fix(tests): composer les deux jetons d'isolation au lieu d'en élire un (TCK-321)"
```

---

### Task 3 : installer ParaTest et rejouer l'épreuve des cinq exécutions

**Files:**
- Modify: `takussan-api/composer.json`, `takussan-api/composer.lock`

**Motif.** D-30 refusait d'installer `brianium/paratest` tant que l'option n'était pas retenue —
*« une dépendance installée pour une option non retenue est une décision prise en silence »*. Elle
est retenue ici **sous condition**, et l'épreuve tranche.

- [ ] **Step 1 : installer**

```bash
cd takussan-api && composer require --dev brianium/paratest
```

- [ ] **Step 2 : vérifier le jeton composé en mode parallèle**

```bash
cd takussan-api && php artisan test --parallel tests/Unit/Testing/FakeDiskIsolationTest.php
```

Attendu : `3 passed`. **Si `test_the_worker_index_is_appended_only_in_parallel_mode` échoue**, c'est
que `PARATEST_TOKEN` n'est pas alimenté : reprendre le step 5 de la tâche 2 avant d'aller plus loin.
Ne pas relâcher l'assertion pour faire passer le test — *c'est elle qui garde la propriété.*

- [ ] **Step 3 : l'épreuve des cinq exécutions**

⚠ **Machine au repos.** C'est une condition de la mesure, pas une formule de style.

```bash
cd takussan-api
uptime; sysctl -n hw.ncpu
for i in 1 2 3 4 5; do
  echo "=== exécution $i ==="
  /usr/bin/time -p php artisan test --parallel 2>&1 | tail -4
  uptime
done
```

**Critère (D-30), les deux ensemble :** gain de temps net **ET** cinq exécutions à **0 échec**.
Une seule rouge sur cinq refuse. Un rouge Meilisearch se relance **seul** avant d'être compté.

- [ ] **Step 4 : si une exécution rougit**

Ne pas relancer jusqu'au vert — *c'est la réponse humaine connue à ce signal, et à partir de là la
suite ne garde plus rien* (D-44). Isoler le ou les tests rouges, les relancer seuls, et **ouvrir un
ticket** pour chacun avant de poursuivre. Si le rouge est un test dépendant de l'ordre, c'est la
même famille que TCK-314 : la course révèle un défaut que le déterminisme masquait, et c'est une
trouvaille, pas un obstacle.

- [ ] **Step 5 : commit (seulement si les cinq sont vertes)**

```bash
cd /Users/aminethiam/Documents/perso/takussan
git add takussan-api/composer.json takussan-api/composer.lock
git commit -m "feat(tests): installer ParaTest — les cinq exécutions d'épreuve sont vertes (TCK-321)"
```

---

### Task 4 : activer `--parallel` en CI, et nulle part ailleurs

**Files:**
- Modify: `.github/workflows/api-ci.yml`
- Modify: `CLAUDE.md`
- Modify: `docs/ardoise.md` — solder le volet parallélisation de D-30.

- [ ] **Step 1 : décider où `--parallel` s'applique**

**Il ne s'applique PAS au step de couverture.** Deux raisons, et la première est bloquante : PCOV
agrège mal entre processus, et le cliquet `--min=86` deviendrait faux — ce qui casserait une garde
existante pour en gagner une autre. La seconde est qu'un runner GitHub a 2 à 4 cœurs : le gain
mesuré de 2,6× l'a été sur 8.

**Conséquence à écrire noir sur blanc dans le ticket :** en CI, `--parallel` ne rend probablement
pas grand-chose. Le vrai bénéficiaire est le **rituel de fin de branche** en local, sur 8 cœurs,
machine au repos. *Si l'épreuve du step 3 ci-dessous ne montre aucun gain en CI, ne pas l'y
activer — et le dire.*

- [ ] **Step 2 : mesurer sur le runner avant de décider**

Ouvrir une PR de mesure qui ajoute un step **temporaire**, sans toucher au step de couverture :

```yaml
      - name: Mesure — la suite en parallèle (temporaire, TCK-321)
        env:
          DB_CONNECTION: sqlite
          DB_DATABASE: ':memory:'
          SCOUT_DRIVER: meilisearch
          MEILISEARCH_HOST: http://127.0.0.1:7700
          MEILISEARCH_KEY: masterKey
        run: |
          nproc
          debut=$(date +%s)
          php artisan test --parallel
          echo "Durée en parallèle : $(( $(date +%s) - debut )) s"
```

Comparer à la durée que le step de couverture affiche déjà. **Reporter les deux chiffres et le
`nproc` dans le ticket**, puis supprimer le step de mesure.

- [ ] **Step 3 : trancher, et écrire la décision**

Deux issues, et **les deux sont des résultats** :

- **Gain net sur le runner** → remplacer le step de couverture par deux steps (couverture
  séquentielle avec le cliquet, puis rien de plus) n'a pas de sens ; ajouter à la place un job
  `tests-paralleles` distinct, sans couverture, qui rend le retour rapide, le job de couverture
  restant la garde. Le documenter.
- **Aucun gain sur le runner** → ne pas l'activer en CI. Documenter `--parallel` comme **commande du
  rituel de fin de branche en local**, et rien d'autre.

- [ ] **Step 4 : documenter dans `CLAUDE.md`**

Dans le bloc `takussan-api/`, après `php artisan test` :

```bash
php artisan test --parallel          # ~2,6× (204 s → 66-83 s, mesuré le 2026-08-16 sur 8 cœurs).
                                     #   ⚠ POUR LE RITUEL DE FIN DE BRANCHE, machine au repos.
                                     #   PAS pour la boucle quotidienne : la suite séquentielle
                                     #   n'occupe que 0,73 cœur sur 8 (mesuré le 2026-08-17), et
                                     #   deux agents qui parallélisent demandent 16 cœurs à une
                                     #   machine qui en a 8. Pour le quotidien :
                                     #   php bin/impacted-tests.php --run
```

- [ ] **Step 5 : solder D-30 dans l'ardoise**

Remplacer la décision « `--parallel` n'est PAS activé » par le compte rendu de l'épreuve : les cinq
durées, les cinq comptes d'échecs, `uptime` et `hw.ncpu`, la décision retenue et son motif. **Ne pas
recopier les chiffres de ce plan** — ceux de l'épreuve.

- [ ] **Step 6 : commit**

```bash
git add .github/workflows/api-ci.yml CLAUDE.md docs/ardoise.md
git commit -m "feat(tests): trancher --parallel sur mesure, et solder le volet parallélisation de D-30 (TCK-321)"
```

---

## Ce que ce plan ne fait pas

- **Il ne fait pas de `--parallel` le défaut local.** C'est la conclusion de la mesure « 0,73 cœur
  sur 8 », pas une précaution.
- **Il ne touche pas au cliquet de couverture.** PCOV agrège mal entre processus ; casser une garde
  existante pour en gagner une autre n'est pas un gain.
- **Il ne dépend pas de la phase 1**, et la phase 1 ne dépend pas de lui.

## Vérification finale

- [ ] `php artisan test --parallel tests/Unit/Testing/FakeDiskIsolationTest.php` → 3 passés
- [ ] Cinq exécutions `php artisan test --parallel` → **0 échec** aux cinq, `uptime` et `hw.ncpu` relevés
- [ ] Deux exécutions **simultanées** de `php artisan test --parallel` (le cas de deux agents) →
      0 échec des deux côtés. *C'est la propriété que la composition des jetons existe pour tenir ;
      ne pas la déclarer acquise sans l'avoir jouée.*
- [ ] `./vendor/bin/pint --test` → propre
- [ ] `for g in scripts/check-*.mjs; do node "$g" || echo "✗ $g"; done` → aucun `✗`
- [ ] D-30 dit ce que l'épreuve a rendu, avec ses conditions de mesure
