<?php

namespace Tests\Feature\Api;

use App\Models\Enums\IdType;
use App\Models\Guarantor;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-954 (ADR-0070 § 1 à 3) — la pièce et le revenu d'une caution sont chiffrés en base et ne
 * sortent que masqués : `id_number_masked` (`•••• 5566`) et `monthly_income_masked` (`••••`).
 */
class GuarantorSensitiveDataTest extends TestCase
{
    use RefreshDatabase;

    private const NUMERO = 'CNI-445566';

    private const MIGRATION = '2026_10_19_110000_encrypt_identity_and_income_on_guarantors.php';

    private User $user;

    private Guarantor $guarantor;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::factory()->create();
        $this->guarantor = Guarantor::factory()->create([
            'added_by_id' => $this->user->id,
            'id_type' => IdType::IdCard,
            'id_number' => self::NUMERO,
            'monthly_income' => '800000.00',
        ]);
    }

    /** @return array{data_type: string, character_maximum_length: ?int, numeric_precision: ?int, numeric_scale: ?int} */
    private function colonne(string $nom): array
    {
        return (array) DB::selectOne(
            "select data_type, character_maximum_length, numeric_precision, numeric_scale from information_schema.columns
             where table_schema = current_schema() and table_name = 'guarantors' and column_name = ?",
            [$nom],
        );
    }

    private function brut(): object
    {
        return DB::table('guarantors')->where('id', $this->guarantor->id)->first(['id_number', 'monthly_income']);
    }

    /** AC1 — l'aller-retour de la migration, montant au centime et types d'origine compris. */
    public function test_la_migration_chiffre_est_idempotente_et_fait_l_aller_retour(): void
    {
        $migration = require database_path('migrations/'.self::MIGRATION);
        $migration->down();
        $this->assertSame(self::NUMERO, $this->brut()->id_number);
        $this->assertSame('800000.00', $this->brut()->monthly_income);

        $migration->up();
        $premier = $this->brut();
        $this->assertSame(self::NUMERO, Crypt::decryptString($premier->id_number));
        $this->assertSame('800000.00', Crypt::decryptString($premier->monthly_income));
        $migration->up();
        $this->assertEquals($premier, $this->brut(), 'un second up() ne rechiffre pas une valeur déjà chiffrée');

        $migration->down();
        $this->assertSame(self::NUMERO, $this->brut()->id_number);
        $this->assertSame('800000.00', $this->brut()->monthly_income);
        $this->assertSame('character varying', $this->colonne('id_number')['data_type']);
        $this->assertSame(255, (int) $this->colonne('id_number')['character_maximum_length']);
        $this->assertSame('numeric', $this->colonne('monthly_income')['data_type']);
        $this->assertSame([14, 2], [(int) $this->colonne('monthly_income')['numeric_precision'], (int) $this->colonne('monthly_income')['numeric_scale']]);

        $migration->up();
        $this->assertSame(self::NUMERO, $this->guarantor->fresh()->id_number);
    }

    /** AC2 — les quatre réponses de la caution ne portent que les masques. */
    public function test_les_reponses_ne_portent_que_les_masques(): void
    {
        Sanctum::actingAs($this->user);

        $vus = [
            'liste' => $this->getJson('/api/guarantors')->assertOk()->json('data.0'),
            'fiche' => $this->getJson("/api/guarantors/{$this->guarantor->id}")->assertOk()->json('data'),
            'mise à jour' => $this->putJson("/api/guarantors/{$this->guarantor->id}", ['occupation' => 'Comptable'])->assertOk()->json('data'),
        ];
        foreach ($vus as $voie => $vu) {
            $this->assertArrayNotHasKey('id_number', $vu, $voie);
            $this->assertArrayNotHasKey('monthly_income', $vu, $voie);
            $this->assertSame('•••• 5566', $vu['id_number_masked'], $voie);
            $this->assertSame('••••', $vu['monthly_income_masked'], $voie);
            $this->assertStringNotContainsString('800000', json_encode($vu), $voie);
        }

        $cree = $this->postJson('/api/guarantors', ['first_name' => 'Jean', 'last_name' => 'Dupont'])->assertCreated()->json('data');
        $this->assertArrayNotHasKey('id_number', $cree);
        $this->assertArrayNotHasKey('monthly_income', $cree);
        $this->assertNull($cree['id_number_masked']);
        $this->assertNull($cree['monthly_income_masked']);

        $this->assertArrayNotHasKey('monthly_income', $this->guarantor->fresh()->toArray());
        $this->assertArrayNotHasKey('id_number', $this->guarantor->fresh()->toArray());
    }

    /** AC3 — la caution créée par le bail est écrite chiffrée. */
    public function test_la_caution_creee_par_le_bail_est_chiffree(): void
    {
        $property = Property::factory()->create(['user_id' => $this->user->id]);
        $lease = Lease::factory()->create(['property_id' => $property->id, 'landlord_id' => $this->user->id]);
        Sanctum::actingAs($this->user);

        $this->postJson("/api/leases/{$lease->id}/guarantors", [
            'first_name' => 'Awa', 'last_name' => 'Diop', 'role' => 'primary',
            'id_type' => 'passport', 'id_number' => 'P-778899', 'monthly_income' => 650000,
        ])->assertCreated();

        $caution = Guarantor::query()->where('first_name', 'Awa')->sole();
        $this->assertSame('P-778899', $caution->id_number);
        $this->assertEquals(650000, (float) $caution->monthly_income);
        $ligne = DB::table('guarantors')->where('id', $caution->id)->first(['id_number', 'monthly_income']);
        $this->assertStringNotContainsString('778899', $ligne->id_number);
        $this->assertStringNotContainsString('650000', $ligne->monthly_income);
    }

    /** AC4 — les bornes qui gardent le `down()` possible. */
    public function test_les_valeurs_sont_bornees(): void
    {
        Sanctum::actingAs($this->user);
        $property = Property::factory()->create(['user_id' => $this->user->id]);
        $lease = Lease::factory()->create(['property_id' => $property->id, 'landlord_id' => $this->user->id]);

        $voies = [
            ['post', '/api/guarantors', ['first_name' => 'Jean', 'last_name' => 'Dupont']],
            ['put', "/api/guarantors/{$this->guarantor->id}", []],
            ['post', "/api/leases/{$lease->id}/guarantors", ['first_name' => 'Awa', 'last_name' => 'Diop', 'role' => 'primary']],
        ];
        foreach ($voies as [$verbe, $uri, $base]) {
            $this->json($verbe, $uri, $base + ['monthly_income' => 1000000000000])
                ->assertUnprocessable()->assertJsonValidationErrors('monthly_income');
            $this->json($verbe, $uri, $base + ['id_number' => str_repeat('9', 101)])
                ->assertUnprocessable()->assertJsonValidationErrors('id_number');
        }

        $this->putJson("/api/guarantors/{$this->guarantor->id}", ['monthly_income' => 999999999999.99])->assertOk();
    }
}
