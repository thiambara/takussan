<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\PropertyStatus;
use App\Models\Enums\PropertyVisibility;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Support\PubliePret;

/**
 * TCK-1341 (P147.05) — `pending_review`, `rejected` et `published` ne se
 * posent plus à la main : seuls `resubmit`, `reject` et l'observateur posent
 * les deux premiers, avec leur horodatage et leur motif.
 *
 * P209.02 (TCK-2065) — la création les refuse de même : `POST /api/properties`
 * prenait l'enum entier, et un bien naissait `pending_review` sans
 * `submitted_at`, ou `rejected` sans motif ni auteur.
 */
class PropertyStatutsDeModerationTest extends ApiTestCase
{
    use PubliePret, RefreshDatabase;

    private User $admin;

    private Property $property;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();

        $agency = Agency::factory()->create(['moderation_required' => false]);
        $this->admin = User::factory()->create();
        $this->materializeRoleProfile($this->admin, 'agency_admin', $agency);
        $this->rendrePubliable($this->admin);
        $this->property = Property::factory()->create([
            'agency_id' => $agency->id,
            'user_id' => $this->admin->id,
            'status' => PropertyStatus::Draft,
            'visibility' => PropertyVisibility::Private,
            'published_at' => null,
        ]);
    }

    /** @return array<string, array{string, string, string}> */
    public static function statutsReserves(): array
    {
        $cas = [];
        foreach (['pending_review', 'rejected', 'published'] as $statut) {
            $cas["PATCH → {$statut}"] = ['PATCH', '', $statut];
            $cas["PUT …/status → {$statut}"] = ['PUT', '/status', $statut];
        }

        return $cas;
    }

    #[DataProvider('statutsReserves')]
    public function test_un_statut_de_moderation_ne_se_pose_pas_a_la_main(string $method, string $suffix, string $statut): void
    {
        $this->actingAsApi($this->admin)
            ->json($method, "/api/properties/{$this->property->id}{$suffix}", ['status' => $statut])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('status');

        $this->assertSame(PropertyStatus::Draft, $this->property->refresh()->status);
    }

    /** @return array<string, array{string}> */
    public static function statutsReservesALaCreation(): array
    {
        return [
            'POST → pending_review' => ['pending_review'],
            'POST → rejected' => ['rejected'],
            'POST → published' => ['published'],
        ];
    }

    #[DataProvider('statutsReservesALaCreation')]
    public function test_un_statut_de_moderation_ne_se_pose_pas_a_la_creation(string $statut): void
    {
        $avant = Property::query()->count();

        $this->actingAsApi($this->admin)
            ->postJson('/api/properties', $this->bienACreer(['status' => $statut]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('status');

        $this->assertSame($avant, Property::query()->count());
    }

    public function test_la_creation_garde_les_statuts_ouverts(): void
    {
        $this->actingAsApi($this->admin)
            ->postJson('/api/properties', $this->bienACreer(['status' => 'available']))
            ->assertCreated()
            ->assertJsonPath('data.status', 'available');
    }

    /**
     * @param  array<string, mixed>  $champs
     * @return array<string, mixed>
     */
    private function bienACreer(array $champs): array
    {
        return array_merge([
            'title' => 'Appartement à Dakar',
            'type' => 'apartment',
            'contract_type' => 'rent',
            'price' => 500_000,
            'visibility' => PropertyVisibility::Private->value,
        ], $champs);
    }

    public function test_les_autres_statuts_restent_ouverts(): void
    {
        $this->actingAsApi($this->admin)
            ->putJson("/api/properties/{$this->property->id}/status", ['status' => 'archived'])
            ->assertOk();
        $this->actingAsApi($this->admin)
            ->patchJson("/api/properties/{$this->property->id}", ['status' => 'unavailable'])
            ->assertOk();

        $this->assertSame(PropertyStatus::Unavailable, $this->property->refresh()->status);
    }
}
