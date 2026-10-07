<?php

namespace Tests\Feature\Auth\TwoFactor;

use App\Http\Controllers\Api\UserAdminController;
use App\Http\Controllers\Api\UserRoleController;
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
            ...array_keys(ProtectedActions::PLATFORM_POWER_EXEMPT),
        ];
        $orphelines = array_values(array_filter($entrees, fn (string $e) => ! isset($enregistrees[$e])));

        $this->assertSame([], $orphelines, "Entrée de ProtectedActions qui ne résout aucune route :\n".implode("\n", $orphelines));
    }

    /**
     * Vérification adverse B1 : `PUT /api/users/{u}/role` fabriquait un super-admin hors de
     * `/api/admin/*`, sans 2FA ni step-up. On ne liste pas ces contrôleurs à la main : on les
     * TROUVE, par ce que leur code écrit — un profil plateforme, ou un compte rendu actif.
     * Toute route mutante de l'un d'eux, quel que soit son fichier, figure dans une liste de
     * step-up ou dans l'exemption motivée.
     */
    public function test_toute_action_qui_confere_un_pouvoir_plateforme_exige_le_step_up(): void
    {
        $marqueurs = '/PlatformProfile::query\(\)->(firstOrNew|create|firstOrCreate|updateOrCreate|forceCreate)'
            .'|new PlatformProfile\b|[\'"]status[\'"]\s*=>\s*UserStatus::Active|SuperAdmin(Cooptation|Bootstrap)Service/';

        $conferent = [];
        $fichiers = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator(app_path('Http/Controllers')));
        foreach ($fichiers as $fichier) {
            if ($fichier->getExtension() !== 'php' || ! preg_match($marqueurs, file_get_contents($fichier->getPathname()))) {
                continue;
            }
            $relatif = substr($fichier->getPathname(), strlen(app_path()) + 1, -4);
            $conferent['App\\'.str_replace('/', '\\', $relatif)] = true;
        }
        // Plancher : la recherche qui ne trouve plus rien ne doit pas passer pour un vert.
        $this->assertArrayHasKey(UserRoleController::class, $conferent);
        $this->assertArrayHasKey(UserAdminController::class, $conferent);

        $oubliees = [];
        foreach (Route::getRoutes()->getRoutes() as $route) {
            $action = ProtectedActions::normalize($route->getActionName());
            if (! isset($conferent[explode('@', $action)[0]]) || array_diff($route->methods(), ['GET', 'HEAD', 'OPTIONS']) === []) {
                continue;
            }
            if (! ProtectedActions::requiresStepUp($action)
                && ! ProtectedActions::requiresStepUpForPlatform($action)
                && ! array_key_exists($action, ProtectedActions::PLATFORM_POWER_EXEMPT)) {
                $oubliees[] = implode('|', $route->methods()).' '.$route->uri()." → {$action}";
            }
        }

        $this->assertSame([], $oubliees, "Action qui confère un pouvoir plateforme sans step-up :\n".implode("\n", $oubliees));
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
