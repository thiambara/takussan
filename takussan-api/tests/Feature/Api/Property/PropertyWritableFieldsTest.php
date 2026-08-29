<?php

namespace Tests\Feature\Api\Property;

use App\Models\Agency;
use App\Models\Enums\TitleType;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * TCK-464 — quatre champs SPÉCIFIÉS (docs/models-spec.md#3-property) que le circuit d'écriture
 * refusait ou ne relisait pas. Ils sont dans `$fillable`, castés, et pour trois d'entre eux déjà
 * exposés en LECTURE : le trou était dans les FormRequest seuls.
 *
 * ⚠ Chaque cas vérifie la valeur RELUE, jamais le seul code 200 : une règle de validation absente
 * ne produit pas d'erreur, elle produit un `validated()` amputé — donc un 200 parfaitement vert
 * sur une écriture qui n'a rien écrit. C'est exactement ce que ce fichier existe pour attraper.
 */
class PropertyWritableFieldsTest extends TestCase
{
    use RefreshDatabase;

    private function acteur(): User
    {
        $agency = Agency::factory()->create();

        return User::factory()->create(['agency_id' => $agency->id]);
    }

    /** @return array<string, mixed> */
    private function payloadMinimal(): array
    {
        return [
            'title' => 'Terrain de test',
            'type' => 'land',
            'contract_type' => 'sale',
            'price' => 25_000_000,
        ];
    }

    public function test_title_type_est_persiste_a_la_creation(): void
    {
        $reponse = $this->actingAs($this->acteur())
            ->postJson('/api/properties', $this->payloadMinimal() + [
                'title_type' => TitleType::TitreFoncier->value,
            ]);

        $reponse->assertCreated();
        $this->assertSame(
            TitleType::TitreFoncier,
            Property::query()->findOrFail($reponse->json('data.id'))->title_type,
        );
    }

    public function test_title_type_est_modifiable(): void
    {
        $user = $this->acteur();
        $bien = Property::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $user->agency_id,
            'title_type' => TitleType::Bail,
        ]);

        $this->actingAs($user)
            ->putJson("/api/properties/{$bien->id}", ['title_type' => TitleType::Deliberation->value])
            ->assertOk();

        $this->assertSame(TitleType::Deliberation, $bien->refresh()->title_type);
    }

    public function test_les_etages_sont_modifiables(): void
    {
        $user = $this->acteur();
        $bien = Property::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $user->agency_id,
            'floor_number' => 2,
            'total_floors' => 5,
        ]);

        $this->actingAs($user)
            ->putJson("/api/properties/{$bien->id}", ['floor_number' => 7, 'total_floors' => 9])
            ->assertOk();

        $bien->refresh();
        $this->assertSame(7, $bien->floor_number);
        $this->assertSame(9, $bien->total_floors);
    }

    public function test_le_code_postal_est_persiste_des_deux_cotes(): void
    {
        $user = $this->acteur();

        $creation = $this->actingAs($user)->postJson('/api/properties', $this->payloadMinimal() + [
            'address' => ['city' => 'Dakar', 'postal_code' => '10700'],
        ]);
        $creation->assertCreated();

        $bien = Property::query()->with('address')->findOrFail($creation->json('data.id'));
        $this->assertSame('10700', $bien->address->postal_code);

        $this->actingAs($user)
            ->putJson("/api/properties/{$bien->id}", ['address' => ['postal_code' => '11000']])
            ->assertOk();

        $this->assertSame('11000', $bien->refresh()->address->postal_code);
    }

    public function test_available_from_est_relu_dans_la_reponse(): void
    {
        $user = $this->acteur();

        $creation = $this->actingAs($user)->postJson('/api/properties', $this->payloadMinimal() + [
            'contract_type' => 'rent',
            'available_from' => '2026-10-01',
        ]);

        $creation->assertCreated();
        $this->assertNotNull(
            $creation->json('data.available_from'),
            'available_from est accepté en écriture mais absent de PropertyResource : '
            .'le champ ne peut jamais être relu, donc jamais pré-rempli à l’édition.',
        );
    }
}
