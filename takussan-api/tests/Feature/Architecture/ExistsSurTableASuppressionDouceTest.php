<?php

namespace Tests\Feature\Architecture;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use ReflectionClass;
use Tests\TestCase;

/**
 * P96.04 (TCK-1340) — une règle `exists:` sur une table à suppression douce accepte une ligne
 * supprimée, que le contrôleur relit ensuite par `findOrFail()` sous la portée `SoftDeletes` : 404
 * au lieu de 422 sur le champ (P96.02), ou une écriture rattachée à une ligne supprimée (P96.03).
 *
 * Cette garde exige, sur ces tables, que la règle écarte les lignes supprimées :
 * `Rule::exists(…)->withoutTrashed()`, `->whereNull('deleted_at')`, ou la forme chaîne
 * `exists:<table>,<col>,deleted_at,NULL`. Les règles qui ne le font pas encore sont FIGÉES ci-dessous,
 * chacune avec son motif : aucune neuve ne s'y ajoute, et une exception qui n'a plus la forme fait
 * rougir, pour qu'on la retire. Même cliquet que `ExistsSurRouteOuverteTest`.
 *
 * Les tables se lisent sur les modèles (`getTable()` des classes qui utilisent `SoftDeletes`), pas
 * dans une liste écrite à la main.
 */
class ExistsSurTableASuppressionDouceTest extends TestCase
{
    /**
     * `<fichier relatif à app/Http/Requests>#<table>` → motif. Le compte d'occurrences n'y est pas :
     * une seconde règle non bornée sur la même table, dans le même fichier, passerait. C'est la
     * granularité de `ExistsSurRouteOuverteTest`.
     */
    private const EXCEPTIONS = [
        // Légitime : le registre RGPD vise aussi un compte déjà effacé.
        'Api/Admin/StorePrivacyRequestRequest.php#users' => 'légitime (registre RGPD)',
        // P96.02, reste : refuser le bailleur effacé décide si un reversement dû reste réglable (V1).
        'Api/PreparePayoutRequest.php#users' => 'P96.02 (reste, au porteur)',
        'Api/StorePayoutRequest.php#users' => 'P96.02 (reste, au porteur)',
        'Api/PreparePayoutRequest.php#agencies' => 'P96.02 (reste, au porteur)',
        'Api/StorePayoutRequest.php#agencies' => 'P96.02 (reste, au porteur)',
        // Clôture d'une période de reversement de la plateforme : 404 par `findOrFail()`, argent (V1).
        'Api/Admin/ClosePlatformPayoutPeriodRequest.php#agencies' => 'P96.03 (lu au constat, hors de ses sept requêtes)',
        // L'appelant rend déjà 422 sur le champ pour une ligne supprimée (P96.02, constat).
        'Agency/StoreAgentHandoverRequest.php#users' => 'déjà 422 : `find()` puis erreur sur le champ',
        'Api/SetPrimaryContactCustomerRequest.php#users' => 'déjà 422 : règle de l\'appelant',
        'Api/UpdateTaskRequest.php#users' => 'déjà 422 : `TaskController::authorizeAssignee`',
    ];

    public function test_aucune_regle_exists_neuve_n_accepte_une_ligne_supprimee(): void
    {
        $nouveaux = array_diff_key($this->balayer(), self::EXCEPTIONS);

        $this->assertSame([], array_keys($nouveaux), "Ces règles d'existence visent une table à suppression douce sans écarter les lignes supprimées :\n"
            .implode("\n", array_map(fn ($c) => "  - {$c}", array_keys($nouveaux)))
            ."\nÉcrire `Rule::exists(…)->withoutTrashed()` : une ligne supprimée doit suivre le chemin de l'identifiant absent (422 sur le champ, P96.02).");
    }

    public function test_une_exception_qui_n_a_plus_la_forme_se_retire(): void
    {
        $perimees = array_diff_key(self::EXCEPTIONS, $this->balayer());

        $this->assertSame([], array_keys($perimees), "Ces exceptions n'ont plus la forme (corrigées ou disparues) : les retirer de EXCEPTIONS.\n"
            .implode("\n", array_map(fn ($c) => "  - {$c}", array_keys($perimees))));
    }

    public function test_la_detection_lit_les_trois_formes_et_ignore_les_commentaires(): void
    {
        $tables = ['users', 'agencies'];
        $source = static fn (string $regles) => "<?php\nclass X\n{\n    public function rules(): array\n    {\n        return [{$regles}];\n    }\n}\n";

        $this->assertSame(['users'], $this->analyser($source("'u' => ['exists:users,id'],"), $tables));
        $this->assertSame(['agencies'], $this->analyser($source("'a' => [Rule::exists('agencies', 'id')],"), $tables));
        $this->assertSame([], $this->analyser($source("'u' => [Rule::exists('users', 'id')->withoutTrashed()],"), $tables));
        $this->assertSame([], $this->analyser($source("'u' => [Rule::exists('users', 'id')->where('x', 1)->whereNull('deleted_at')],"), $tables));
        $this->assertSame([], $this->analyser($source("'u' => ['exists:users,id,deleted_at,NULL'],"), $tables));
        $this->assertSame([], $this->analyser($source("'t' => ['exists:tags,id'],"), $tables), 'table sans suppression douce');
        $this->assertSame([], $this->analyser($source("\n            // plus de `exists:users,id` ici\n            'u' => ['integer'],"), $tables));
        $this->assertSame(
            ['users'],
            $this->analyser($source("'a' => [Rule::exists('users', 'id')->withoutTrashed()], 'b' => [Rule::exists('users', 'id')->where('x', 1)],"), $tables),
            'une règle bornée ne couvre pas sa voisine',
        );
    }

    public function test_les_tables_a_suppression_douce_se_lisent_sur_les_modeles(): void
    {
        $tables = $this->tablesASuppressionDouce();

        // Une garde qui ne connaît aucune table est verte : elle doit en avoir trouvé.
        $this->assertGreaterThan(20, count($tables));
        foreach (['users', 'agencies', 'customers', 'guarantors', 'properties', 'leases'] as $table) {
            $this->assertContains($table, $tables);
        }
    }

    /** @return array<string, true> `<fichier>#<table>` → true */
    private function balayer(): array
    {
        $tables = $this->tablesASuppressionDouce();
        $racine = app_path('Http/Requests');
        $trouves = [];
        $lus = 0;
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($racine, RecursiveDirectoryIterator::SKIP_DOTS)) as $fichier) {
            if ($fichier->getExtension() !== 'php') {
                continue;
            }
            $lus++;
            $relatif = str_replace('\\', '/', substr($fichier->getPathname(), strlen($racine) + 1));
            foreach ($this->analyser((string) file_get_contents($fichier->getPathname()), $tables) as $table) {
                $trouves["{$relatif}#{$table}"] = true;
            }
        }
        $this->assertGreaterThan(100, $lus, 'le balayage de app/Http/Requests n\'a presque rien lu');
        ksort($trouves);

        return $trouves;
    }

    /**
     * @param  list<string>  $tables
     * @return list<string> les tables à suppression douce visées par une règle qui n'écarte pas les lignes supprimées
     */
    private function analyser(string $php, array $tables): array
    {
        $code = '';
        foreach (token_get_all($php) as $jeton) {
            if (is_array($jeton) && in_array($jeton[0], [T_COMMENT, T_DOC_COMMENT], true)) {
                continue;
            }
            $code .= is_array($jeton) ? $jeton[1] : $jeton;
        }

        $nonBornees = [];

        // Forme chaîne : `exists:<table>[,…]`, bornée seulement par `,deleted_at,NULL`.
        preg_match_all("/['\"]exists:([a-z_]+)([^'\"]*)['\"]/", $code, $m, PREG_SET_ORDER);
        foreach ($m as [, $table, $reste]) {
            if (! preg_match('/,deleted_at,NULL\b/i', $reste)) {
                $nonBornees[] = $table;
            }
        }

        // Forme objet : `Rule::exists('<table>', …)` et la chaîne d'appels qui la suit.
        $chaine = '(?:\\s*->\\s*\\w+\\s*\\((?:[^()]|\\((?:[^()]|\\([^()]*\\))*\\))*\\))*';
        preg_match_all("/Rule::exists\\(\\s*['\"]([a-z_]+)['\"][^)]*\\)({$chaine})/", $code, $m, PREG_SET_ORDER);
        foreach ($m as [, $table, $appels]) {
            if (! preg_match("/->\\s*withoutTrashed\\s*\\(|->\\s*whereNull\\s*\\(\\s*['\"]deleted_at['\"]/", $appels)) {
                $nonBornees[] = $table;
            }
        }

        $nonBornees = array_values(array_unique(array_intersect($nonBornees, $tables)));
        sort($nonBornees);

        return $nonBornees;
    }

    /** @return list<string> */
    private function tablesASuppressionDouce(): array
    {
        $tables = [];
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator(app_path('Models'), RecursiveDirectoryIterator::SKIP_DOTS)) as $fichier) {
            if ($fichier->getExtension() !== 'php') {
                continue;
            }
            $classe = 'App\\Models\\'.str_replace(['/', '.php'], ['\\', ''], substr($fichier->getPathname(), strlen(app_path('Models')) + 1));
            if (! class_exists($classe)) {
                continue;
            }
            $reflexion = new ReflectionClass($classe);
            if ($reflexion->isAbstract() || ! $reflexion->isSubclassOf(Model::class)
                || ! in_array(SoftDeletes::class, class_uses_recursive($classe), true)) {
                continue;
            }
            $tables[] = $reflexion->newInstanceWithoutConstructor()->getTable();
        }
        $tables = array_values(array_unique($tables));
        sort($tables);

        return $tables;
    }
}
