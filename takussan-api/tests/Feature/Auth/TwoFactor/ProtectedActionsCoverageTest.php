<?php

namespace Tests\Feature\Auth\TwoFactor;

use App\Support\Security\ProtectedActions;
use Illuminate\Routing\Route as RouteDefinition;
use Illuminate\Routing\Router;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * TCK-589 AC9 — la garde du point 8 : la liste des actions protégées apparie par
 * action de contrôleur, et elle casse dans les DEUX sens.
 *
 *  1. Une route mutante d'une famille protégée (fichier de routes de
 *     `ProtectedActions::FAMILIES`) absente de la liste ET des exemptions : rouge.
 *     C'est ce qui attrape la route ajoutée demain à `integrations.php`.
 *  2. Une entrée de liste qui ne résout aucune route enregistrée : rouge — une
 *     action renommée ne laisse pas un trou silencieux.
 *
 * Chaque fichier de famille est rejoué dans un routeur NEUF (façade échangée le
 * temps du `require`) : on sait ainsi exactement quelles routes il déclare, ce que
 * la table globale des routes ne dit pas.
 */
class ProtectedActionsCoverageTest extends TestCase
{
    public function test_chaque_route_mutante_d_une_famille_est_listee(): void
    {
        $oubliees = [];
        foreach (ProtectedActions::FAMILIES as $fichier => $controleurs) {
            foreach ($this->routesDeclareesPar($fichier) as $route) {
                $action = ProtectedActions::normalize($route->getActionName());
                $classe = explode('@', $action)[0];
                if ($controleurs !== null && ! in_array($classe, $controleurs, true)) {
                    continue;
                }
                if (array_diff($route->methods(), ['GET', 'HEAD', 'OPTIONS']) === []) {
                    continue;
                }
                if (! in_array($action, ProtectedActions::AGENCY_TWO_FACTOR, true)
                    && ! array_key_exists($action, ProtectedActions::EXEMPT)) {
                    $oubliees[] = implode('|', $route->methods()).' '.$route->uri()." ({$fichier}) → {$action}";
                }
            }
        }

        $this->assertSame([], $oubliees, "Route mutante d'une famille protégée absente de ProtectedActions :\n".implode("\n", $oubliees));
    }

    public function test_chaque_entree_resout_une_route_enregistree(): void
    {
        $enregistrees = [];
        foreach (Route::getRoutes()->getRoutes() as $route) {
            $enregistrees[ProtectedActions::normalize($route->getActionName())] = true;
        }

        $entrees = [
            ...ProtectedActions::AGENCY_TWO_FACTOR,
            ...ProtectedActions::STEP_UP,
            ...ProtectedActions::STEP_UP_FOR_PLATFORM,
            ...array_keys(ProtectedActions::EXEMPT),
        ];
        $orphelines = array_values(array_filter($entrees, fn (string $e) => ! isset($enregistrees[$e])));

        $this->assertSame([], $orphelines, "Entrée de ProtectedActions qui ne résout aucune route :\n".implode("\n", $orphelines));
    }

    public function test_les_alias_sans_nom_sont_couverts(): void
    {
        $sansNom = collect(Route::getRoutes()->getRoutes())
            ->filter(fn (RouteDefinition $r) => $r->getName() === null)
            ->filter(fn (RouteDefinition $r) => in_array($r->uri(), [
                'api/integrations/{integration}',
                'api/agencies/{agency}',
                'api/agencies/{agency}/roles/{role}',
            ], true))
            ->map(fn (RouteDefinition $r) => ProtectedActions::normalize($r->getActionName()))
            ->values();

        $this->assertCount(3, $sansNom);
        foreach ($sansNom as $action) {
            $this->assertTrue(ProtectedActions::requiresAgencyTwoFactor($action), $action);
        }
    }

    /** @return list<RouteDefinition> */
    private function routesDeclareesPar(string $fichier): array
    {
        $chemin = base_path("routes/api/{$fichier}");
        $this->assertFileExists($chemin, "Famille protégée sans fichier de routes : {$fichier}");

        $original = Route::getFacadeRoot();
        $routeur = new Router($this->app['events'], $this->app);
        Route::swap($routeur);
        try {
            $routeur->prefix('api')->group($chemin);
        } finally {
            Route::swap($original);
        }

        return $routeur->getRoutes()->getRoutes();
    }
}
