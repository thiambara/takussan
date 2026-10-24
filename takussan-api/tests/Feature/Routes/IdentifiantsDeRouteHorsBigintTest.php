<?php

namespace Tests\Feature\Routes;

use App\Models\ConversationParticipant;
use App\Models\Enums\PlatformProfileLevel;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Routing\Route;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route as Routes;
use PHPUnit\Framework\Attributes\DataProvider;
use ReflectionNamedType;
use Tests\Support\OperateursPlateforme;
use Tests\TestCase;

/**
 * TCK-2115 (P215.01) — un identifiant de route qui ne peut pas être une clé rend 404, jamais 500.
 *
 * La liaison implicite passait la valeur du chemin telle quelle à `where id = ?`, et PostgreSQL la
 * refusait : vingt chiffres levaient `SQLSTATE[22003]` (hors de `bigint`), `abc` `22P02`, et
 * environ 380 routes connectées rendaient 500, avec une ligne `query_exception` au niveau `error`.
 *
 * La garde balaie chaque route `api/*` à paramètre, remplace chaque paramètre par une même valeur
 * impossible, joue la requête une fois, sans corps, dans un point de sauvegarde annulé (une erreur
 * SQL abandonnerait sinon la transaction du test, et les routes suivantes avec elle), et n'accepte
 * aucun 5xx.
 */
class IdentifiantsDeRouteHorsBigintTest extends TestCase
{
    use OperateursPlateforme;
    use RefreshDatabase;

    /** Paramètres dont la valeur choisit une branche du code, et non une ligne. */
    private const VALEURS_IMPOSEES = [
        'paymentType' => 'invoices',
    ];

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
    }

    public static function valeursImpossibles(): array
    {
        return [
            'vingt chiffres, hors de bigint' => ['99999999999999999999'],
            'un cran au-delà de bigint' => ['9223372036854775808'],
            'non numérique' => ['abc'],
        ];
    }

    #[DataProvider('valeursImpossibles')]
    public function test_aucune_route_connectee_ne_rend_500_sur_un_identifiant_impossible(string $valeur): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        $en500 = [];
        $jouees = 0;
        foreach ($this->routesAParametre() as $route) {
            $methode = $this->methode($route);
            $uri = '/'.$this->remplir($route, $valeur);

            DB::beginTransaction();
            try {
                $statut = $this->json($methode, $uri)->getStatusCode();
            } finally {
                DB::rollBack();
            }
            $jouees++;

            if ($statut >= 500) {
                $en500[] = "{$methode} {$route->uri()} → {$statut}";
            }
        }

        // Le balayage a bien porté : sans ce plancher, une liste de routes vide rendrait la garde verte.
        $this->assertGreaterThan(300, $jouees, "{$jouees} routes jouées seulement");
        $this->assertSame([], $en500, "Ces routes rendent une erreur de serveur sur l'identifiant « {$valeur} » :\n"
            .implode("\n", $en500));

        // Témoin : la transaction du test vit encore, et l'identifiant impossible rend le 404 de TCK-588 (`http.not_found`).
        $this->getJson("/api/properties/{$valeur}")->assertNotFound()->assertJsonPath('code', 'http.not_found');
    }

    public function test_la_borne_de_bigint_reste_un_identifiant_qui_se_cherche(): void
    {
        $this->agirEnOperateur(PlatformProfileLevel::SuperAdmin);

        $this->getJson('/api/properties/9223372036854775807')->assertNotFound()->assertJsonPath('code', 'http.not_found');
    }

    public function test_une_cle_valable_se_lie_toujours_sur_chaque_famille_de_modele(): void
    {
        $user = User::factory()->create();
        $property = Property::factory()->create();

        $this->assertTrue($property->is((new Property)->resolveRouteBinding((string) $property->id)));
        $this->assertTrue($property->is((new Property)->resolveRouteBinding($property->id)));
        $this->assertTrue($user->is((new User)->resolveRouteBinding((string) $user->id)));
        $this->assertNull((new User)->resolveRouteBinding('99999999999999999999'));
        $this->assertNull((new ConversationParticipant)->resolveRouteBinding('abc'));
        // Une liaison par un autre champ que la clé n'est pas jugée par le motif.
        $this->assertNull((new Property)->resolveRouteBinding('abc', 'title'));
    }

    /**
     * TCK-2117 (P215.02) — une action qui type un paramètre de route `int` lève `TypeError` avant
     * tout SQL sur vingt chiffres ou `abc` : la route le contraint à `[0-9]{1,18}` (TCK-1851), qui
     * rend 404 avant l'appel. Le balayage ci-dessus joue la même valeur partout, et une liaison
     * parente refusée masque l'enfant (`{property}/media/{mediaId}`) : cette garde-ci les voit tous.
     */
    public function test_chaque_parametre_de_route_type_int_est_contraint_a_dix_huit_chiffres(): void
    {
        $nonContraints = [];
        foreach (Routes::getRoutes()->getRoutes() as $route) {
            foreach ($route->signatureParameters() as $parametre) {
                $type = $parametre->getType();
                if (! $type instanceof ReflectionNamedType || $type->getName() !== 'int'
                    || ! in_array($parametre->getName(), $route->parameterNames(), true)) {
                    continue;
                }
                if (($route->wheres[$parametre->getName()] ?? null) !== '[0-9]{1,18}') {
                    $nonContraints[] = $route->uri().' {'.$parametre->getName().'}';
                }
            }
        }

        $this->assertSame([], $nonContraints, "Ces paramètres typés `int` ne sont pas contraints à `[0-9]{1,18}` :\n"
            .implode("\n", $nonContraints));
    }

    /** @return list<Route> */
    private function routesAParametre(): array
    {
        return array_values(array_filter(
            Routes::getRoutes()->getRoutes(),
            fn (Route $r) => str_starts_with($r->uri(), 'api/') && $r->parameterNames() !== [],
        ));
    }

    private function methode(Route $route): string
    {
        $methodes = array_values(array_diff($route->methods(), ['HEAD']));

        return $methodes[0];
    }

    private function remplir(Route $route, string $valeur): string
    {
        return (string) preg_replace_callback(
            '/\{(\w+)\??\}/',
            fn (array $m) => self::VALEURS_IMPOSEES[$m[1]] ?? $valeur,
            $route->uri(),
        );
    }
}
