<?php

namespace Tests\Feature\Architecture;

use App\Models\Agency;
use Illuminate\Contracts\Routing\UrlRoutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Routing\Route;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Route as RouteFacade;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use ReflectionClass;
use ReflectionMethod;
use Spatie\QueryBuilder\Exceptions\InvalidIncludeQuery;
use Tests\ApiTestCase;
use Tests\Concerns\InteractsWithMeilisearch;
use Throwable;

/**
 * TCK-2787 (AC7, garde écrite en avance du lot) — un nom d'`include` venu de l'URL n'appelle jamais
 * une méthode du modèle, sur AUCUNE route `GET` qui passe par `buildQuery()`.
 *
 * Eloquent résout une relation en appelant la méthode du même nom sur une instance neuve
 * (`Eloquent\Builder::getRelation()`). Un nom qui atteint `with`, `load` ou `$modele->{$nom}()` sans
 * liste blanche appelle donc `unguard` (la protection d'affectation de masse levée pour tout le
 * processus), `delete`, ou `truncate` (que `__call` transmet à la requête : la table vidée). C'est
 * l'incident du 2026-11-12 (`include=unguard` sur `/api/customers`, corrigé en 34c796ce1) et le
 * chemin de l'avis moyen de laravel/framework 13.0 à 13.27 (« relationship inclusion can trigger
 * unauthorized data destruction »). Jusqu'ici, une seule route l'épinglait
 * (`CustomerIndexSparseFieldsTest`).
 *
 * Les routes ne sont pas listées à la main : le routeur les énumère, et une route est retenue quand
 * spatie y refuse un include sonde (`InvalidIncludeQuery`). Pour chacune, chaque nom dangereux est
 * envoyé seul, imbriqué sous une relation admise, et accompagné de `fields[<table>]=id` pour chaque
 * table d'un modèle à `buildQuery()` (c'est sous `fields` que le chemin de l'incident s'ouvrait). Il
 * doit rendre 400, sans lever `unguard` ni changer le nombre de lignes d'aucune table.
 *
 * Deux conditions l'empêchent d'être vert sans rien prouver :
 * - le nombre de routes retenues ne baisse pas sous `RETENUES_MIN` ;
 * - toute route dont l'action appelle `buildQuery(` dans sa source, et que le parcours sait atteindre,
 *   est retenue par la sonde, sauf celles de `SONDE_MUETTE`, chacune avec sa raison.
 *
 * L'appelant est un super-admin, admin d'une agence active, comme `ValeursEnListeParcoursDesRoutesTest`.
 */
class IncludeNomDeMethodeRefuseTest extends ApiTestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    /** Mesuré le 2026-11-13 ; ne se baisse pas sans dire quelle route sort et pourquoi. */
    private const RETENUES_MIN = 67;

    /** Les noms de méthode envoyés comme include : chacun détruit, ou lève une protection. */
    private const NOMS_DANGEREUX = ['truncate', 'unguard', 'delete'];

    /**
     * Les routes dont l'action appelle `buildQuery(` mais où la sonde ne lève pas `InvalidIncludeQuery`
     * pour cet appelant, chacune avec sa raison.
     *
     * @var array<string, string>
     */
    private const SONDE_MUETTE = [
        'api/maintenance-requests/summary' => 'buildQuery() reçoit une requête neuve qui ne porte que filter[] (MaintenanceRequestController::summary) : include n\'y arrive pas',
        'api/property-visits/counts' => 'buildQuery() reçoit une requête neuve qui ne porte que filter[] (PropertyVisitController::counts) : include n\'y arrive pas',
        'api/me/service-provider/collaborations' => 'l\'appelant du parcours n\'a pas de profil de prestataire : la liste vide rend avant buildQuery()',
    ];

    public function test_aucun_include_nom_de_methode_n_appelle_rien_sur_les_routes_de_buildquery(): void
    {
        Http::fake();
        Mail::fake();
        Notification::fake();
        Queue::fake();
        $this->withoutMiddleware(ThrottleRequests::class);

        $agency = Agency::factory()->create();
        $user = $this->apiActingAsRole('super_admin', ['agency' => $agency]);
        $this->materializeRoleProfile($user, 'agency_admin', $agency);
        $agency->update(['primary_admin_id' => $user->id]);

        $champs = $this->champsDeToutesLesTables();
        $tables = $this->tables();

        $modeles = [];
        $echecs = [];
        $retenues = [];
        $muettes = [];

        foreach (RouteFacade::getRoutes()->getRoutes() as $route) {
            if (! in_array('GET', $route->methods(), true) || ! str_starts_with($route->uri(), 'api/')) {
                continue;
            }
            $url = $this->url($route, $modeles);
            if ($url === null) {
                continue;
            }

            [, , $sonde] = $this->appeler($url.'?include=__sonde__');
            if (! $sonde instanceof InvalidIncludeQuery) {
                if ($this->actionAppelleBuildQuery($route) && ! isset(self::SONDE_MUETTE[$route->uri()])) {
                    $muettes[] = $route->uri().' → '.($sonde === null ? 'aucune exception' : class_basename($sonde));
                }

                continue;
            }
            $retenues[] = $route->uri();

            $relation = collect($sonde->allowedIncludes->all())
                ->first(fn ($nom) => is_string($nom) && ! str_contains($nom, '.') && ! str_ends_with($nom, 'Count') && ! str_ends_with($nom, 'Exists'));

            $includes = self::NOMS_DANGEREUX;
            if (is_string($relation)) {
                $includes[] = $relation.'.truncate';
            }

            // Le témoin : un include inconnu mais inoffensif, sous les deux formes. Ce que la route
            // écrit d'elle-même à la lecture (les sources du Radar naissent à la première lecture)
            // se retrouve dans le témoin ; seul l'écart au témoin accuse l'include.
            $temoins = [];
            foreach (['', '&'.$champs] as $suffixe) {
                $temoins[$suffixe] = $this->mesurer($url.'?include=__sonde__'.$suffixe, $tables);
            }

            foreach ($includes as $include) {
                foreach ($temoins as $suffixe => $temoin) {
                    $requete = 'include='.$include.$suffixe;
                    $causes = $this->ecarts($this->mesurer($url.'?'.$requete, $tables), $temoin);
                    if ($causes !== []) {
                        $echecs[] = $route->uri().'?'.mb_substr($requete, 0, 80).' → '.implode(' ; ', $causes);
                    }
                }
            }
        }

        $this->assertSame([], $echecs, "Un include nom de méthode n'est pas refusé sans effet :\n".implode("\n", $echecs));
        $this->assertSame([], $muettes, "Routes dont l'action appelle buildQuery( sans que la sonde y lève InvalidIncludeQuery : la nommer dans SONDE_MUETTE avec sa raison.\n".implode("\n", $muettes));
        $this->assertGreaterThanOrEqual(self::RETENUES_MIN, count($retenues), count($retenues).' routes retenues :'."\n".implode("\n", $retenues));
    }

    /**
     * Le chemin de l'avis passe par `JsonApiResource`, qui charge les includes imbriqués par
     * `loadMissing` (`ResolvesJsonApiElements`) sans la liste blanche de spatie. Le dépôt n'en emploie
     * aucune : la première qui entre dans `app/` doit venir avec sa liste blanche, et retirer cette garde
     * se décide alors, pas en passant.
     */
    public function test_aucune_json_api_resource_dans_app(): void
    {
        $fautifs = [];
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator(app_path())) as $fichier) {
            if ($fichier->getExtension() === 'php'
                && preg_match('/\\b(JsonApiResource|ResolvesJsonApiElements|JsonApiRequest)\\b/', (string) file_get_contents($fichier->getPathname())) === 1) {
                $fautifs[] = substr($fichier->getPathname(), strlen(base_path()) + 1);
            }
        }

        $this->assertSame([], $fautifs, 'JsonApiResource sans liste blanche des includes imbriqués (TCK-2787, AC7).');
    }

    /**
     * La requête, dans un point de sauvegarde : son statut, si elle a levé `unguard`, et l'écart du
     * nombre de lignes de chaque table (`null` si la base n'est plus lisible après elle).
     *
     * @param  list<string>  $tables
     * @return array{statut: int, unguarded: bool, ecart: array<string, int>|null}
     */
    private function mesurer(string $url, array $tables): array
    {
        DB::beginTransaction();
        try {
            $avant = $this->lignes($tables);
            try {
                $statut = $this->getJson($url)->getStatusCode();
            } catch (Throwable) {
                $statut = 500;
            }

            $unguarded = Model::isUnguarded();
            Model::reguard();

            try {
                $apres = $this->lignes($tables);
                $ecart = array_filter(
                    array_map(fn (string $t) => $apres[$t] - $avant[$t], array_combine($tables, $tables)),
                    fn (int $d) => $d !== 0,
                );
            } catch (Throwable) {
                $ecart = null;
            }
        } finally {
            DB::rollBack();
        }

        return ['statut' => $statut, 'unguarded' => $unguarded, 'ecart' => $ecart];
    }

    /**
     * Ce qui sépare la requête au nom dangereux de son témoin : 400 attendu, `unguard` jamais levé,
     * et les mêmes lignes écrites que le témoin.
     *
     * @param  array{statut: int, unguarded: bool, ecart: array<string, int>|null}  $mesure
     * @param  array{statut: int, unguarded: bool, ecart: array<string, int>|null}  $temoin
     * @return list<string>
     */
    private function ecarts(array $mesure, array $temoin): array
    {
        $causes = [];
        if ($mesure['statut'] !== 400) {
            $causes[] = 'statut '.$mesure['statut'].' au lieu de 400';
        }
        if ($mesure['unguarded']) {
            $causes[] = 'protection d\'affectation de masse levée';
        }
        if ($mesure['ecart'] === null) {
            $causes[] = 'base inutilisable après la requête';
        } elseif ($mesure['ecart'] != $temoin['ecart']) {
            $causes[] = 'lignes changées hors du témoin : '.json_encode($mesure['ecart']).' contre '.json_encode($temoin['ecart']);
        }

        return $causes;
    }

    /**
     * Le nombre de lignes de chaque table du schéma, en une requête.
     *
     * @param  list<string>  $tables
     * @return array<string, int>
     */
    private function lignes(array $tables): array
    {
        $union = implode(' UNION ALL ', array_map(
            fn (string $t) => "SELECT '".$t."' AS t, COUNT(*) AS n FROM \"".$t.'"',
            $tables,
        ));

        return collect(DB::select($union))->mapWithKeys(fn ($l) => [$l->t => (int) $l->n])->all();
    }

    /** @return list<string> */
    private function tables(): array
    {
        return collect(DB::select("SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename <> 'migrations'"))
            ->pluck('tablename')->sort()->values()->all();
    }

    /**
     * `fields[<table>]=id` pour la table de chaque modèle qui a `buildQuery()` : lus dans les
     * modèles, pas dans une liste écrite à la main.
     */
    private function champsDeToutesLesTables(): string
    {
        $tables = [];
        $dossier = app_path('Models');
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dossier)) as $fichier) {
            if ($fichier->getExtension() !== 'php') {
                continue;
            }
            $classe = 'App\\Models\\'.str_replace(['/', '.php'], ['\\', ''], substr($fichier->getPathname(), strlen($dossier) + 1));
            if (! class_exists($classe) || ! is_subclass_of($classe, Model::class) || (new ReflectionClass($classe))->isAbstract()
                || ! method_exists($classe, 'buildQuery')) {
                continue;
            }
            $tables[] = (new $classe)->getTable();
        }

        return implode('&', array_map(fn (string $t) => 'fields['.$t.']=id', array_values(array_unique($tables))));
    }

    /** L'action appelle-t-elle `buildQuery(` dans son CODE (les commentaires ne comptent pas) ? */
    private function actionAppelleBuildQuery(Route $route): bool
    {
        $action = $route->getAction('uses');
        if (! is_string($action)) {
            return false;
        }
        [$controleur, $methode] = str_contains($action, '@') ? explode('@', $action) : [$action, '__invoke'];
        if (! method_exists($controleur, $methode)) {
            return false;
        }
        $reflexion = new ReflectionMethod($controleur, $methode);
        $lignes = file((string) $reflexion->getFileName()) ?: [];
        $source = implode('', array_slice($lignes, $reflexion->getStartLine() - 1, $reflexion->getEndLine() - $reflexion->getStartLine() + 1));

        $code = '';
        foreach (token_get_all('<?php '.$source) as $jeton) {
            if (is_array($jeton) && in_array($jeton[0], [T_COMMENT, T_DOC_COMMENT], true)) {
                continue;
            }
            $code .= is_array($jeton) ? $jeton[1] : $jeton;
        }

        return str_contains($code, 'buildQuery(');
    }

    /**
     * L'URL de la route, ses paramètres remplis par un modèle de sa fabrique ; `null` si l'un d'eux
     * n'a pas de modèle à fournir (même règle que `ValeursEnListeParcoursDesRoutesTest`, qui nomme
     * ces routes dans son `HORS_PARCOURS`).
     *
     * @param  array<string, string|null>  $modeles
     */
    private function url(Route $route, array &$modeles): ?string
    {
        $classes = [];
        foreach ($route->signatureParameters(['subClass' => UrlRoutable::class]) as $parametre) {
            $type = $parametre->getType();
            if ($type instanceof \ReflectionNamedType) {
                $classes[$parametre->getName()] = $type->getName();
            }
        }

        $url = '/'.$route->uri();
        foreach ($route->parameterNames() as $nom) {
            $classe = $classes[$nom] ?? null;
            if ($classe === null) {
                return null;
            }
            $modeles[$classe] ??= $this->creer($classe);
            if ($modeles[$classe] === null) {
                return null;
            }
            $url = preg_replace('/\{'.$nom.'\??\}/', $modeles[$classe], $url);
        }

        return $url;
    }

    private function creer(string $classe): ?string
    {
        if (! is_subclass_of($classe, Model::class) || ! method_exists($classe, 'factory')) {
            return null;
        }

        try {
            return DB::transaction(fn (): string => (string) $classe::factory()->create()->getRouteKey());
        } catch (Throwable) {
            return null;
        }
    }

    /**
     * Une requête dans un point de sauvegarde, sans rien garder.
     *
     * @return array{int, string, ?Throwable}
     */
    private function appeler(string $url): array
    {
        DB::beginTransaction();
        try {
            $reponse = $this->getJson($url);
            $exception = $reponse->baseResponse->exception ?? null;
            $statut = $reponse->getStatusCode();
        } catch (Throwable $e) {
            $exception = $e;
            $statut = 500;
        } finally {
            DB::rollBack();
            Model::reguard();
        }

        return [$statut, '', $exception];
    }
}
