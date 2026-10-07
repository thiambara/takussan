<?php

namespace Tests\Feature\Maintenance;

use App\Models\Address;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-592 — AC13 (P6) : le kit d'accès — rue, coordonnées, téléphone du demandeur, consignes — au
 * seul prestataire assigné, après acceptation, tant que la demande n'est ni close ni annulée.
 *
 * `propertySummary()` n'exposait ni rue ni coordonnées et `userSummary()` pas de téléphone : le
 * prestataire n'avait aucun moyen de trouver le logement depuis la fiche.
 */
class MaintenanceAccessKitTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    public function test_accepted_provider_gets_the_access_kit(): void
    {
        ['mr' => $mr, 'provider' => $provider, 'tenant' => $tenant] = $this->scenario(MaintenanceStatus::InProgress, accepted: true);

        Sanctum::actingAs($provider);
        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk()
            ->assertJsonPath('data.access.street', 'Rue 10 x Rue 15')
            ->assertJsonPath('data.access.latitude', 14.6928)
            ->assertJsonPath('data.access.longitude', -17.4467)
            ->assertJsonPath('data.access.requester_phone', $tenant->phone)
            ->assertJsonPath('data.access.instructions', 'Clé chez le gardien');
    }

    /** @return array<string, array{MaintenanceStatus, bool}> */
    public static function closedWindows(): array
    {
        return [
            'avant acceptation' => [MaintenanceStatus::Assigned, false],
            'close' => [MaintenanceStatus::Closed, true],
            'annulée' => [MaintenanceStatus::Cancelled, true],
        ];
    }

    #[DataProvider('closedWindows')]
    public function test_no_access_kit_outside_the_window(MaintenanceStatus $status, bool $accepted): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->scenario($status, $accepted);

        Sanctum::actingAs($provider);
        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk()->assertJsonMissingPath('data.access');
    }

    public function test_requester_and_principal_get_no_access_block(): void
    {
        ['mr' => $mr, 'tenant' => $tenant, 'landlord' => $landlord] = $this->scenario(MaintenanceStatus::InProgress, accepted: true);

        foreach ([$tenant, $landlord] as $viewer) {
            Sanctum::actingAs($viewer);
            $this->getJson("/api/maintenance-requests/{$mr->id}")->assertOk()->assertJsonMissingPath('data.access');
        }

        // Le demandeur ne lit pas non plus les consignes du donneur d'ordre.
        Sanctum::actingAs($tenant);
        $this->getJson("/api/maintenance-requests/{$mr->id}")->assertJsonMissingPath('data.access_instructions');
    }

    /** Photos « avant » : au prestataire accepté seulement. */
    public function test_before_photos_require_acceptance(): void
    {
        Storage::fake(config('media-library.disk_name'));
        ['mr' => $mr, 'provider' => $provider, 'tenant' => $tenant] = $this->scenario(MaintenanceStatus::Assigned, accepted: false);

        Sanctum::actingAs($provider);
        $this->upload($mr)->assertUnprocessable();

        $mr->forceFill(['accepted_at' => now()])->save();
        $this->upload($mr)->assertCreated();

        Sanctum::actingAs($tenant);
        $this->upload($mr)->assertForbidden();

        $this->assertCount(1, $mr->refresh()->getMedia('before_photos'));
    }

    private function upload(MaintenanceRequest $mr)
    {
        return $this->post("/api/maintenance-requests/{$mr->id}/photos", [
            'collection' => 'before_photos',
            'photos' => [UploadedFile::fake()->image('avant.jpg')],
        ], ['Accept' => 'application/json']);
    }

    /** @return array<string, mixed> */
    private function scenario(MaintenanceStatus $status, bool $accepted): array
    {
        $scenario = $this->maintenanceScenario($status, [
            'accepted_at' => $accepted ? now() : null,
            'access_instructions' => 'Clé chez le gardien',
        ]);
        User::query()->whereKey($scenario['tenant']->id)->update(['phone' => '+221771234567']);
        $scenario['tenant']->refresh();

        Address::query()->create([
            'addressable_type' => $scenario['property']->getMorphClass(),
            'addressable_id' => $scenario['property']->id,
            'street' => 'Rue 10 x Rue 15',
            'neighborhood' => 'Médina',
            'city' => 'Dakar',
            'country' => 'SN',
            'latitude' => 14.6928,
            'longitude' => -17.4467,
        ]);

        return $scenario;
    }
}
