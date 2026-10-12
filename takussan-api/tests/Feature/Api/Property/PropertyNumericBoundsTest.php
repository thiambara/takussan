<?php

namespace Tests\Feature\Api\Property;

use App\Models\Agency;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-633 (AC3) — les bornes des champs numériques, des DEUX côtés (création et modification).
 *
 * Le défaut n'était pas l'étage négatif (accepté depuis toujours : un sous-sol existe) mais
 * l'absence de borne haute : `parking_spaces = 40000` débordait le `smallint` et rendait 500.
 */
class PropertyNumericBoundsTest extends TestCase
{
    use RefreshDatabase;

    private User $agent;

    protected function setUp(): void
    {
        parent::setUp();
        $agence = Agency::factory()->create(['moderation_required' => false]);
        $this->agent = $this->actingAsRole('agent', ['agency_id' => $agence->id]);
    }

    /** @return array<string, mixed> */
    private function bien(array $plus = []): array
    {
        return $plus + ['title' => 'Appartement test', 'type' => 'apartment', 'contract_type' => 'rent', 'price' => 200_000];
    }

    public function test_un_sous_sol_reste_accepte(): void
    {
        $this->postJson('/api/properties', $this->bien(['floor_number' => -1, 'total_floors' => 4]))
            ->assertCreated()
            ->assertJsonPath('data.floor_number', -1);
    }

    public function test_un_nombre_qui_deborde_la_colonne_est_un_422_et_non_un_500(): void
    {
        $this->postJson('/api/properties', $this->bien(['parking_spaces' => 40_000]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('parking_spaces');
    }

    /** @return iterable<string, array{string, int|float}> */
    public static function horsBornes(): iterable
    {
        yield 'chambres' => ['bedrooms', 101];
        yield 'salles de bain' => ['bathrooms', 101];
        yield 'étage trop bas' => ['floor_number', -6];
        yield 'étage trop haut' => ['floor_number', 201];
        yield 'aucun étage' => ['total_floors', 0];
        yield 'stationnement' => ['parking_spaces', 501];
    }

    #[DataProvider('horsBornes')]
    public function test_les_bornes_a_la_creation(string $champ, int|float $valeur): void
    {
        $this->postJson('/api/properties', $this->bien([$champ => $valeur]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors($champ);
    }

    public function test_les_coordonnees_hors_plage_sont_refusees_des_deux_cotes(): void
    {
        $this->postJson('/api/properties', $this->bien(['address' => ['city' => 'Dakar', 'latitude' => 95, 'longitude' => -17.4]]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('address.latitude');

        $bien = Property::factory()->create(['user_id' => $this->agent->id, 'agency_id' => $this->agent->agency_id]);
        $this->putJson("/api/properties/{$bien->id}", ['address' => ['longitude' => -190]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('address.longitude');
    }

    public function test_les_bornes_a_la_modification(): void
    {
        $bien = Property::factory()->create(['user_id' => $this->agent->id, 'agency_id' => $this->agent->agency_id]);

        $this->putJson("/api/properties/{$bien->id}", ['bedrooms' => 101, 'bathrooms' => 101, 'parking_spaces' => 501])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['bedrooms', 'bathrooms', 'parking_spaces']);
    }

    /**
     * La même famille que `parking_spaces = 40000` : `area` est un `integer` (2 147 483 647 au
     * plus) et `price` un `numeric(14,2)` (999 999 999 999,99 au plus). Au-delà, PostgreSQL refuse
     * l'écriture et l'API rendait 500.
     *
     * @return iterable<string, array{string, int|float}>
     */
    public static function debordements(): iterable
    {
        yield 'surface' => ['area', 3_000_000_000];
        yield 'prix' => ['price', 1e15];
        yield 'année trop lointaine' => ['year_built', (int) date('Y') + 4];
    }

    #[DataProvider('debordements')]
    public function test_un_debordement_de_colonne_est_un_422_des_deux_cotes(string $champ, int|float $valeur): void
    {
        $this->postJson('/api/properties', $this->bien([$champ => $valeur]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors($champ);

        $bien = Property::factory()->create(['user_id' => $this->agent->id, 'agency_id' => $this->agent->agency_id]);
        $this->putJson("/api/properties/{$bien->id}", [$champ => $valeur])
            ->assertUnprocessable()
            ->assertJsonValidationErrors($champ);
    }

    /**
     * Les plus grandes valeurs admises s'enregistrent : la borne est celle de la colonne, pas une
     * borne plus étroite qui refuserait un terrain ou un prix légitimes. L'année : une vente sur
     * plan (`condition = off_plan`) annonce l'année de LIVRAISON, couramment deux à trois ans
     * plus tard — d'où « année courante + 3 », et rien au-delà.
     */
    public function test_les_plus_grandes_valeurs_admises_s_enregistrent(): void
    {
        $this->postJson('/api/properties', $this->bien([
            'area' => 2_147_483_647,
            'price' => 999_999_999_999.99,
            'year_built' => (int) date('Y') + 3,
        ]))->assertCreated();
    }

    /**
     * Chaque borne, à la valeur EXACTE (acceptée) et un cran au-delà (refusée), à la création ET à
     * la modification : `UpdatePropertyRequest` et `StorePropertyRequest` portent chacun leurs
     * règles, et une borne relâchée d'un seul côté rendait 500 à l'écriture sans qu'aucun test ne
     * le voie (relevé de la re-vérification du lot D : `area max:2147483648` en modification).
     *
     * @return iterable<string, array{string, int|float, int|float}>
     */
    public static function bornes(): iterable
    {
        $annee = (int) date('Y');
        yield 'surface' => ['area', 2_147_483_647, 2_147_483_648];
        yield 'prix' => ['price', 999_999_999_999.99, 1_000_000_000_000];
        yield 'année au plus tard' => ['year_built', $annee + 3, $annee + 4];
        yield 'année au plus tôt' => ['year_built', 1800, 1799];
        yield 'chambres' => ['bedrooms', 100, 101];
        yield 'salles de bain' => ['bathrooms', 100, 101];
        yield 'stationnements' => ['parking_spaces', 500, 501];
        yield 'étage le plus haut' => ['floor_number', 200, 201];
        yield 'étage le plus bas' => ['floor_number', -5, -6];
        yield 'étages de l\'immeuble' => ['total_floors', 200, 201];
    }

    #[DataProvider('bornes')]
    public function test_la_borne_passe_et_la_borne_plus_un_est_refusee_des_deux_cotes(string $champ, int|float $borne, int|float $auDela): void
    {
        $this->postJson('/api/properties', $this->bien([$champ => $borne]))->assertCreated();
        $this->postJson('/api/properties', $this->bien([$champ => $auDela]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors($champ);

        $bien = Property::factory()->create(['user_id' => $this->agent->id, 'agency_id' => $this->agent->agency_id]);
        $this->putJson("/api/properties/{$bien->id}", [$champ => $borne])->assertOk();
        $this->putJson("/api/properties/{$bien->id}", [$champ => $auDela])
            ->assertUnprocessable()
            ->assertJsonValidationErrors($champ);
    }
}
