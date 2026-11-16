<?php

namespace Tests\Feature\Validation;

use App\Http\Requests\Api\UnsubscribePublicSearchAlertRequest;
use App\Http\Requests\BaseFormRequest;
use App\Http\Requests\Invitation\PurgeExpiredInvitationsRequest;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\TaskStatus;
use App\Models\Invitation;
use App\Models\Property;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Routing\Redirector;
use Illuminate\Routing\Route as LaRoute;
use Illuminate\Support\Facades\Route;
use ReflectionFunction;
use ReflectionMethod;
use ReflectionNamedType;
use Tests\ApiTestCase;
use Tests\Unit\Architecture\FormRequestEtendBaseFormRequestTest;
use Throwable;

/**
 * TCK-612 — une écriture (`POST`, `PUT`, `PATCH`, `DELETE`) se valide sur le CORPS seul.
 *
 * `BaseFormRequest::prepareForValidation()` faisait `replace(normalize(input()))` : `input()`
 * fusionne la query, `replace()` la réécrivait dans le corps, et `validated()` rendait un champ
 * venu de l'URL comme un champ saisi. C'est la condition qui rendait verif-600 B1-bis exploitable
 * (`POST …/impersonate?reason=…` sous n'importe quel corps).
 *
 * Le premier test parcourt `Route::getRoutes()` : une `BaseFormRequest` ajoutée demain sur une
 * écriture est couverte sans toucher à ce fichier, et une FormRequest qui étend `FormRequest` en
 * direct le fait rougir, sauf exemption motivée de `FormRequestEtendBaseFormRequestTest`. Il rejoue, hors autorisation, l'ordre de
 * `validateResolved()` — relevé des clés, query cachée, `prepareForValidation()`, query rendue,
 * `validationData()` — deux fois :
 * sans query, puis avec chaque champ de premier niveau des `rules()` posé EN QUERY SEULEMENT. Les
 * deux jeux de données doivent être identiques : une comparaison, et non la recherche d'une valeur
 * témoin, parce qu'une sous-classe peut transformer la valeur recopiée (casse, téléphone).
 */
class QueryNeverFeedsAWriteTest extends ApiTestCase
{
    use RefreshDatabase;

    /**
     * Exceptions motivées, déclarées dans la classe par `$queryKeysAcceptedOnWrite` — la raison est
     * écrite là. Ce tableau les recense : une exception neuve fait rougir le test tant qu'elle n'y
     * est pas.
     *
     * @var array<class-string<BaseFormRequest>, list<string>>
     */
    private const EXEMPTIONS = [
        // DELETE sans corps ; `filter[role]` est un filtre, contrat du front (TCK-2665).
        PurgeExpiredInvitationsRequest::class => ['filter'],
        // RFC 8058 : le jeton est dans l'URI de `List-Unsubscribe`, POSTée telle quelle (TCK-599).
        UnsubscribePublicSearchAlertRequest::class => ['token'],
    ];

    private const INJECTE = 'injecte-par-la-query';

    private User $acteur;

    /**
     * Paramètres de route qu'une FormRequest résout dès `prepareForValidation()` (404 avant 422) :
     * un bien publié par son slug, une invitation active par son jeton. Les autres valent `1`.
     *
     * @var array<string, string>
     */
    private array $parametres = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->acteur = User::factory()->create();
    }

    public function test_aucune_ecriture_ne_valide_un_champ_venu_de_la_query(): void
    {
        config(['auth.phone_login.enabled' => true]);
        $this->parametres = [
            'slug' => (string) Property::factory()->create()->slug,
            'token' => (string) Invitation::factory()->create()->token,
        ];
        $couvertes = [];
        $fuites = [];
        $exemptionsVues = [];
        $nonRejouees = [];
        $horsBase = [];

        foreach (Route::getRoutes()->getRoutes() as $route) {
            $ecritures = array_values(array_diff($route->methods(), ['GET', 'HEAD', 'OPTIONS']));
            $classe = $ecritures === [] ? null : $this->formRequestDe($route);
            if ($classe === null) {
                continue;
            }
            // Une FormRequest qui n'étend pas BaseFormRequest n'a pas `validationData()` corps seul :
            // elle n'est admise que si la garde d'architecture l'exempte, avec son motif.
            if (! is_subclass_of($classe, BaseFormRequest::class)) {
                $horsBase[$classe] = true;

                continue;
            }

            $acceptees = (fn () => $this->queryKeysAcceptedOnWrite)->call(new $classe);
            if ($acceptees !== []) {
                $exemptionsVues[$classe] = $acceptees;
            }

            $etiquette = $ecritures[0].' '.$route->uri().' ('.$classe.')';
            try {
                [$temoin, $champs] = $this->rejouer($classe, $route, $ecritures[0], []);
                $champs = array_values(array_diff($champs, $acceptees));
                if ($champs === []) {
                    $champs = ['champ_temoin_tck612'];
                }
                [$avecQuery] = $this->rejouer($classe, $route, $ecritures[0], array_fill_keys($champs, self::INJECTE));
            } catch (Throwable $e) {
                $nonRejouees[] = $etiquette.' — '.$e::class.': '.$e->getMessage();

                continue;
            }

            $couvertes[] = $etiquette;
            if ($avecQuery !== $temoin) {
                $fuites[] = $etiquette.' — '.json_encode(array_keys(array_diff_key($avecQuery, $temoin) + array_diff_assoc(
                    array_map('json_encode', $avecQuery),
                    array_map('json_encode', $temoin),
                )));
            }
        }

        $this->assertSame([], $fuites, "Des champs posés en query seulement entrent dans la validation d'une écriture :\n".implode("\n", $fuites));
        $exemptees = array_map(
            fn (string $relatif) => 'App\\Http\\Requests\\'.str_replace('/', '\\', substr($relatif, 0, -4)),
            array_keys(FormRequestEtendBaseFormRequestTest::EXEMPTIONS),
        );
        $nonExemptees = array_values(array_diff(array_keys($horsBase), $exemptees));
        $this->assertSame([], $nonExemptees, "Ces écritures type-hintent une FormRequest qui n'étend pas BaseFormRequest : la query y entre (TCK-612) :\n".implode("\n", $nonExemptees));
        $this->assertSame([], $nonRejouees, "Écritures que le test n'a pas su rejouer :\n".implode("\n", $nonRejouees));
        // Plancher : un parcours qui ne trouverait plus rien serait vert sans rien prouver.
        $this->assertGreaterThan(200, count($couvertes), 'Le parcours des routes ne trouve presque plus de FormRequest.');
        // Témoins des classes qui étendaient `FormRequest` en direct jusqu'au 2026-11-16 : le parcours les rejoue.
        foreach (['POST api/auth/login (App\Http\Requests\Auth\LoginRequest)', 'POST api/{paymentType}/{paymentId}/initiate (App\Http\Requests\InitiatePaymentRequest)', 'POST api/agencies/{agency}/members/{user}/handover (App\Http\Requests\Agency\StoreAgentHandoverRequest)'] as $temoin) {
            $this->assertContains($temoin, $couvertes, "Écriture attendue dans le parcours : {$temoin}");
        }
        ksort($exemptionsVues);
        $attendues = self::EXEMPTIONS;
        ksort($attendues);
        $this->assertSame($attendues, $exemptionsVues, 'Une exception `$queryKeysAcceptedOnWrite` neuve se recense dans EXEMPTIONS, avec sa raison.');
    }

    /** AC2 — la note porte ce qui a été saisi, jamais ce que l'URL portait. */
    public function test_la_note_d_un_client_porte_le_corps_et_non_la_query(): void
    {
        [$agent, $client] = $this->agentEtClient();
        $this->actingAsApi($agent);

        $this->apiPost("/api/customers/{$client->id}/notes?body=injecte", ['body' => 'saisi'])->assertCreated();
        $this->assertDatabaseHas('customer_notes', ['customer_id' => $client->id, 'body' => 'saisi']);
        $this->assertDatabaseMissing('customer_notes', ['body' => 'injecte']);
    }

    /** AC2 — sans corps, la query seule ne suffit pas : 422. */
    public function test_une_note_portee_par_la_query_seule_est_refusee(): void
    {
        [$agent, $client] = $this->agentEtClient();
        $this->actingAsApi($agent);

        $this->apiPost("/api/customers/{$client->id}/notes?body=injecte")->assertStatus(422)->assertJsonValidationErrors('body');
        $this->assertDatabaseMissing('customer_notes', ['customer_id' => $client->id]);
    }

    /**
     * Au-delà de `validated()` : une sous-classe qui recopie `input()` dans le corps
     * (`LoginRequest`, `InviteAgentRequest`…) ne recopie plus la query, et un contrôleur qui lit
     * `input()`/`boolean()` ne voit plus un champ réglé que la query portait seule. Un paramètre
     * sans règle (`include`) reste lisible.
     */
    public function test_un_champ_regle_venu_de_la_query_n_est_lu_nulle_part(): void
    {
        Route::post('/api/_tck612', fn (Tck612Request $request) => response()->json([
            'validated' => $request->validated(),
            'drapeau' => $request->input('drapeau'),
            'email' => $request->input('email'),
            'include' => $request->input('include'),
        ]))->middleware('api');

        $this->postJson('/api/_tck612?drapeau=1&email=URL@EXEMPLE.SN&include=x', ['nom' => 'a'])
            ->assertOk()
            ->assertExactJson(['validated' => ['nom' => 'a'], 'drapeau' => null, 'email' => null, 'include' => 'x']);

        // Témoin : dans le corps, les mêmes champs sont entendus, et la recopie de la sous-classe joue.
        $this->postJson('/api/_tck612?include=x', ['nom' => 'a', 'drapeau' => true, 'email' => 'Saisi@Exemple.SN'])
            ->assertOk()
            ->assertJsonPath('validated', ['nom' => 'a', 'drapeau' => true, 'email' => 'saisi@exemple.sn']);
    }

    /**
     * Une classe qui étendait `FormRequest` en direct (`LoginRequest`, jusqu'au 2026-11-16) : des
     * identifiants posés dans l'URL seule n'ouvrent pas de session ; dans le corps, si.
     */
    public function test_la_connexion_ne_lit_pas_les_identifiants_dans_la_query(): void
    {
        User::factory()->create(['email' => 'query@exemple.sn', 'password' => bcrypt('password123')]);

        $this->postJson('/api/auth/login?email=query@exemple.sn&password=password123')
            ->assertStatus(422)->assertJsonValidationErrors(['email', 'password']);

        $this->postJson('/api/auth/login', ['email' => 'query@exemple.sn', 'password' => 'password123'])->assertOk();
    }

    /** Une lecture garde sa source : la query. */
    public function test_une_lecture_se_valide_toujours_sur_la_query(): void
    {
        Route::get('/api/_tck612', fn (Tck612Request $request) => response()->json($request->validated()))->middleware('api');

        $this->getJson('/api/_tck612?nom=a&drapeau=1')->assertOk()->assertExactJson(['nom' => 'a', 'drapeau' => '1']);
    }

    /** Le retrait d'un membre lit `leave_unassigned` dans le corps seul. */
    public function test_le_retrait_d_un_membre_ne_lit_pas_le_drapeau_dans_la_query(): void
    {
        $agence = Agency::factory()->create();
        $admin = User::factory()->create(['two_factor_enabled' => true, 'two_factor_secret' => self::TEST_TWO_FACTOR_SECRET]);
        $this->materializeRoleProfile($admin, 'agency_admin', $agence);
        $membre = User::factory()->create();
        $this->materializeRoleProfile($membre, 'agent', $agence);
        Customer::factory()->create(['agency_id' => $agence->id]);
        $tache = Task::factory()->forCustomer(Customer::query()->firstOrFail())->create([
            'created_by_id' => $admin->id, 'assigned_to_id' => $membre->id, 'status' => TaskStatus::Open,
        ]);

        $this->actingAsApi($admin)
            ->apiDelete("/api/agencies/{$agence->id}/members/{$membre->id}?leave_unassigned=1")
            ->assertStatus(422);
        $this->assertSame($membre->id, $tache->refresh()->assigned_to_id);

        $this->actingAsApi($admin)
            ->apiDelete("/api/agencies/{$agence->id}/members/{$membre->id}", ['leave_unassigned' => true])
            ->assertOk();
    }

    /** @return array{0: User, 1: Customer} */
    private function agentEtClient(): array
    {
        $agence = Agency::factory()->create();

        return [User::factory()->withAgentProfile($agence)->create(), Customer::factory()->create(['agency_id' => $agence->id])];
    }

    /** @return class-string<FormRequest>|null */
    private function formRequestDe(LaRoute $route): ?string
    {
        $uses = $route->getAction('uses');
        try {
            $reflexion = match (true) {
                is_string($uses) && str_contains($uses, '@') => new ReflectionMethod(...explode('@', $uses, 2)),
                is_string($uses) => new ReflectionMethod($uses, '__invoke'),
                $uses instanceof \Closure => new ReflectionFunction($uses),
                default => null,
            };
        } catch (\ReflectionException) {
            return null;
        }

        foreach ($reflexion?->getParameters() ?? [] as $parametre) {
            $type = $parametre->getType();
            if ($type instanceof ReflectionNamedType && ! $type->isBuiltin() && is_subclass_of($type->getName(), FormRequest::class)) {
                return $type->getName();
            }
        }

        return null;
    }

    /**
     * L'ordre de `BaseFormRequest::validateResolved()`, sans l'autorisation ni la validation.
     *
     * @param  class-string<BaseFormRequest>  $classe
     * @param  array<string, string>  $query
     * @return array{0: array<string, mixed>, 1: list<string>} les données validées, et les champs de premier niveau des règles
     */
    private function rejouer(string $classe, LaRoute $route, string $methode, array $query): array
    {
        $uri = '/'.preg_replace_callback('/\{([^}?]+)\??\}/', fn (array $m) => $this->parametres[$m[1]] ?? '1', $route->uri());
        $base = Request::create(
            $uri.($query === [] ? '' : '?'.http_build_query($query)),
            $methode,
            server: ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json'],
            content: '{}',
        );
        $liee = (clone $route)->bind($base);
        $base->setRouteResolver(fn () => $liee);
        $base->setUserResolver(fn () => $this->acteur);

        /** @var BaseFormRequest $requete */
        $requete = $classe::createFrom($base);
        $requete->setContainer($this->app)->setRedirector($this->app->make(Redirector::class));

        (fn () => $this->rememberQueryOnlyKeys())->call($requete);
        (fn () => $this->hideQueryOnlyKeys())->call($requete);
        (fn () => $this->prepareForValidation())->call($requete);
        (fn () => $this->restoreHiddenQueryKeys())->call($requete);
        $donnees = $requete->validationData();

        // Des `rules()` lisent le modèle lié à la route (`$this->route('property')->agency_id`) : sans
        // liaison, ils lèvent. Le témoin `champ_temoin_tck612` les couvre alors — la query cachée ne
        // dépend pas du nom du champ.
        try {
            $regles = $this->app->call([$requete, 'rules']);
        } catch (Throwable) {
            $regles = [];
        }
        $champs = [];
        foreach (array_keys($regles) as $regle) {
            $champ = strtok((string) $regle, '.');
            if ($champ !== false && $champ !== '*') {
                $champs[$champ] = true;
            }
        }

        return [$donnees, array_keys($champs)];
    }
}

class Tck612Request extends BaseFormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** Le motif de `LoginRequest` : la sous-classe relit `input()` et le recopie dans le corps. */
    protected function prepareForValidation(): void
    {
        parent::prepareForValidation();
        if ($this->has('email')) {
            $this->merge(['email' => mb_strtolower((string) $this->input('email'))]);
        }
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['nom' => ['required', 'string'], 'drapeau' => ['sometimes'], 'email' => ['sometimes', 'string']];
    }
}
