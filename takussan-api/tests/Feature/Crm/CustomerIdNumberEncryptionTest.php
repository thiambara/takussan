<?php

namespace Tests\Feature\Crm;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\IdType;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;

/**
 * TCK-953 (ADR-0070 § 1 à 4) — le numéro de pièce du client est chiffré en base, ne sort que
 * masqué (`id_number_masked`), et n'est plus demandable par `fields[customers]`.
 */
class CustomerIdNumberEncryptionTest extends ApiTestCase
{
    use RefreshDatabase;

    private const NUMERO = 'SN-998877';

    private const MIGRATION = '2026_10_19_100000_encrypt_id_number_on_customers.php';

    private Agency $agency;

    private User $agent;

    private User $landlord;

    private Customer $tenant;

    private Lease $lease;

    private Booking $booking;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->agent = $this->member('agent');
        $this->landlord = $this->member('owner');
        $property = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->landlord->id]);
        $this->tenant = Customer::factory()->create([
            'agency_id' => $this->agency->id, 'added_by_id' => $this->agent->id,
            'id_type' => IdType::IdCard, 'id_number' => self::NUMERO,
        ]);
        $this->lease = Lease::factory()->create([
            'property_id' => $property->id, 'landlord_id' => $this->landlord->id,
            'tenant_id' => $this->tenant->id, 'agency_id' => $this->agency->id,
        ]);
        $this->booking = Booking::factory()->create([
            'property_id' => $property->id, 'customer_id' => $this->tenant->id, 'agency_id' => $this->agency->id,
        ]);
    }

    private function member(string $role): User
    {
        $user = User::factory()->create();
        $this->materializeRoleProfile($user, $role, $this->agency);

        return $user;
    }

    /** AC1 — la colonne est lisible en clair seulement par le cast, et la migration fait l'aller-retour. */
    public function test_la_migration_chiffre_est_idempotente_et_fait_l_aller_retour(): void
    {
        $migration = require database_path('migrations/'.self::MIGRATION);
        $migration->down();
        $this->assertSame(self::NUMERO, DB::table('customers')->where('id', $this->tenant->id)->value('id_number'));

        $migration->up();
        $premier = DB::table('customers')->where('id', $this->tenant->id)->value('id_number');
        $this->assertNotSame(self::NUMERO, $premier);
        $this->assertSame(self::NUMERO, Crypt::decryptString($premier));
        $this->assertSame(self::NUMERO, $this->tenant->fresh()->id_number);

        $migration->up();
        $this->assertSame($premier, DB::table('customers')->where('id', $this->tenant->id)->value('id_number'),
            'un second up() ne rechiffre pas une valeur déjà chiffrée');

        $migration->down();
        $this->assertSame(self::NUMERO, DB::table('customers')->where('id', $this->tenant->id)->value('id_number'));
        $colonne = DB::selectOne(
            "select data_type, character_maximum_length from information_schema.columns
             where table_schema = current_schema() and table_name = 'customers' and column_name = 'id_number'"
        );
        $this->assertSame('character varying', $colonne->data_type);
        $this->assertSame(255, (int) $colonne->character_maximum_length);

        $migration->up();
    }

    /** AC2 — aucune réponse par défaut ne porte `id_number` ; la fiche porte le masque. */
    public function test_aucune_reponse_ne_porte_la_valeur_et_la_fiche_porte_le_masque(): void
    {
        $this->actingAsApi($this->agent);

        $fiche = $this->apiGet("/api/customers/{$this->tenant->id}")->assertOk()->json('data');
        $this->assertArrayNotHasKey('id_number', $fiche);
        $this->assertSame('•••• 8877', $fiche['id_number_masked']);

        $vus = [
            'liste' => collect($this->apiGet('/api/customers')->assertOk()->json('data'))->firstWhere('id', $this->tenant->id),
            'bail' => $this->apiGet("/api/leases/{$this->lease->id}")->assertOk()->json('data.tenant'),
            'liste des baux' => collect($this->apiGet('/api/leases?include=tenant')->assertOk()->json('data'))
                ->firstWhere('id', $this->lease->id)['tenant'],
            'réservation' => $this->apiGet("/api/bookings/{$this->booking->id}")->assertOk()->json('data.customer'),
        ];
        foreach ($vus as $voie => $vu) {
            $this->assertSame($this->tenant->id, $vu['id'], $voie);
            $this->assertArrayNotHasKey('id_number', $vu, $voie);
            $this->assertStringNotContainsString('998877', json_encode($vu), $voie);
        }

        $this->assertArrayNotHasKey('id_number', $this->tenant->fresh()->toArray());
    }

    /** AC2 — la fiche calcule le masque même sous `fields[customers]`. */
    public function test_la_fiche_rend_le_masque_sous_des_sparse_fieldsets(): void
    {
        $this->actingAsApi($this->agent)
            ->apiGet("/api/customers/{$this->tenant->id}?fields[customers]=id,agency_id,added_by_id,id_type")
            ->assertOk()
            ->assertJsonPath('data.id_number_masked', '•••• 8877')
            ->assertJsonMissingPath('data.id_number');
    }

    /** AC3 — `id_number` n'est plus demandable, ni en direct ni en imbriqué. */
    public function test_id_number_n_est_plus_demandable_par_fields(): void
    {
        $this->actingAsApi($this->agent);

        $this->apiGet('/api/customers?fields[customers]=id,id_number')->assertStatus(400);
        $this->apiGet('/api/leases?include=tenant&fields[customers]=id,id_number')->assertStatus(400);
    }

    /** AC4 — le bailleur ne reçoit ni la valeur ni le masque (TCK-808). */
    public function test_le_bailleur_ne_recoit_ni_la_valeur_ni_le_masque(): void
    {
        $this->actingAsApi($this->landlord);

        $vus = [
            'bail' => $this->apiGet("/api/leases/{$this->lease->id}")->assertOk()->json('data.tenant'),
            'réservation' => $this->apiGet("/api/bookings/{$this->booking->id}")->assertOk()->json('data.customer'),
        ];
        foreach ($vus as $voie => $vu) {
            $this->assertSame($this->tenant->id, $vu['id'], $voie);
            $this->assertArrayNotHasKey('id_number', $vu, $voie);
            $this->assertArrayNotHasKey('id_number_masked', $vu, $voie);
        }
    }

    /** AC5 — sans `id_number`, le numéro chiffré est gardé ; au-delà de 100 caractères, 422. */
    public function test_la_mise_a_jour_garde_le_numero_et_borne_sa_longueur(): void
    {
        $avant = DB::table('customers')->where('id', $this->tenant->id)->value('id_number');
        $this->actingAsApi($this->agent);

        $this->apiPut("/api/customers/{$this->tenant->id}", ['occupation' => 'Comptable'])
            ->assertOk()
            ->assertJsonPath('data.id_number_masked', '•••• 8877')
            ->assertJsonMissingPath('data.id_number');
        $this->assertSame($avant, DB::table('customers')->where('id', $this->tenant->id)->value('id_number'));

        $this->apiPut("/api/customers/{$this->tenant->id}", ['id_number' => str_repeat('9', 101)])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('id_number');
        $this->apiPost('/api/customers', ['first_name' => 'Awa', 'last_name' => 'Diop', 'id_number' => str_repeat('9', 101)])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('id_number');

        $this->apiPut("/api/customers/{$this->tenant->id}", ['id_number' => 'SN-112233'])
            ->assertOk()
            ->assertJsonPath('data.id_number_masked', '•••• 2233');
        $this->assertSame('SN-112233', $this->tenant->fresh()->id_number);
    }
}
