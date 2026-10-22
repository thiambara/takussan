<?php

namespace Tests\Feature\Validation;

use App\Http\Requests\BaseFormRequest;
use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\ContractType;
use App\Models\Enums\RentPeriod;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1446 (P80.03) — une clé envoyée par le front que le FormRequest n'a pas dans ses règles est
 * écartée par `validated()` sans bruit : P80.01 (statut d'un client) et P80.02 (voyageurs d'une
 * réservation) n'ont été trouvés que par lecture. `BaseFormRequest` journalise désormais ces
 * clés, en `local` et en `testing` seulement : le nom de la clé et la route, jamais la valeur.
 */
class UnruledInputKeysSignalTest extends TestCase
{
    use RefreshDatabase;

    private Property $property;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $agency = Agency::factory()->create();
        $agent = User::factory()->withAgentProfile($agency)->create();
        $this->property = Property::factory()->create([
            'agency_id' => $agency->id,
            'contract_type' => ContractType::Rent,
            'rent_period' => RentPeriod::Daily,
            'price' => '20000',
        ]);
        $this->customer = Customer::factory()->create(['agency_id' => $agency->id]);
        Sanctum::actingAs($agent);

        Log::spy();
    }

    /** @param  array<string, mixed>  $extra */
    private function book(array $extra = [])
    {
        return $this->postJson('/api/bookings', [
            'property_id' => $this->property->id,
            'customer_id' => $this->customer->id,
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(3)->toDateString(),
        ] + $extra);
    }

    /** @param  list<string>  $keys */
    private function assertSignaled(string $route, array $keys): void
    {
        Log::shouldHaveReceived('warning')
            ->withArgs(fn (string $message, array $context = []) => $message === 'form_request.unruled_input_keys'
                && ($context['route'] ?? null) === $route
                && ($context['keys'] ?? null) === $keys)
            ->once();
    }

    private function assertNotSignaled(): void
    {
        Log::shouldNotHaveReceived('warning', fn (string $message) => $message === 'form_request.unruled_input_keys');
    }

    public function test_une_cle_hors_regles_est_signalee_avec_sa_route(): void
    {
        $this->book(['guests' => 2, 'couleur_preferee' => 'ocre'])->assertCreated();

        $this->assertSignaled('api/bookings', ['couleur_preferee']);
    }

    public function test_la_valeur_de_la_cle_n_est_jamais_journalisee(): void
    {
        $this->book(['secret_du_visiteur' => 'valeur-sensible-123'])->assertCreated();

        Log::shouldHaveReceived('warning')
            ->withArgs(fn (string $message, array $context = []) => $message === 'form_request.unruled_input_keys'
                && ! str_contains(json_encode($context), 'valeur-sensible-123'))
            ->once();
    }

    public function test_un_corps_dans_les_regles_ne_signale_rien(): void
    {
        $this->book(['guests' => 3])->assertCreated();

        $this->assertNotSignaled();
    }

    public function test_hors_local_et_testing_rien_n_est_signale(): void
    {
        $this->app['env'] = 'production';

        $this->book(['couleur_preferee' => 'ocre'])->assertCreated();

        $this->assertNotSignaled();
    }

    public function test_les_cles_de_la_liste_d_exceptions_ne_sont_pas_signalees(): void
    {
        Route::post('/api/_tck1446', fn (Tck1446Request $request) => response()->json($request->validated()))
            ->middleware('api');

        $this->postJson('/api/_tck1446', ['nom' => 'a', 'tolere' => 'b', 'inconnue' => 'c'])
            ->assertOk()
            ->assertExactJson(['nom' => 'a']);

        $this->assertSignaled('api/_tck1446', ['inconnue']);
    }

    public function test_la_chaine_de_requete_d_un_formulaire_n_est_pas_lue_comme_un_corps(): void
    {
        Route::post('/api/_tck1446', fn (Tck1446Request $request) => response()->json($request->validated()))
            ->middleware('api');

        $this->post('/api/_tck1446?include=x', ['nom' => 'a'], ['Accept' => 'application/json'])
            ->assertOk();

        $this->assertNotSignaled();
    }

    public function test_la_chaine_de_requete_n_est_pas_lue_comme_un_corps(): void
    {
        $this->postJson('/api/bookings?include=property', [
            'property_id' => $this->property->id,
            'customer_id' => $this->customer->id,
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDays(3)->toDateString(),
        ])->assertCreated();

        $this->assertNotSignaled();
    }
}

class Tck1446Request extends BaseFormRequest
{
    /** @var list<string> */
    protected array $unruledInputKeysAllowed = ['tolere'];

    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['nom' => ['required', 'string']];
    }
}
