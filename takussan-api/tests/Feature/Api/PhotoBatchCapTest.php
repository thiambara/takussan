<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-2330 (P222.02) — les lots de photos d'intervention et d'état des lieux bornés à 20, comme les
 * photos de bien (TCK-673).
 *
 * L'image fixe `max_file_uploads = 20` : au-delà, PHP ignore un fichier SANS ERREUR avant même la
 * validation, et le lot était accepté amputé. Les trois règles `photos` n'avaient pas de `max:`.
 */
class PhotoBatchCapTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // TCK-538 : les deux disques de médias — le privé est le défaut (ADR-0029 §3).
        Storage::fake(config('media-library.disk_name'));
        Storage::fake(config('media-library.public_disk_name'));
    }

    public function test_more_than_twenty_maintenance_photos_returns_422_without_media(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::InProgress);

        Sanctum::actingAs($landlord);
        $this->postJson("/api/maintenance-requests/{$mr->id}/photos", ['photos' => $this->photos(21)])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['photos']);

        $this->assertCount(0, $mr->refresh()->getMedia('photos'));
    }

    public function test_more_than_twenty_completion_photos_returns_422_and_leaves_the_request_open(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::InProgress, ['accepted_at' => now()]);

        Sanctum::actingAs($landlord);
        $this->putJson("/api/maintenance-requests/{$mr->id}/complete", ['photos' => $this->photos(21)])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['photos']);

        $fresh = $mr->refresh();
        $this->assertSame(MaintenanceStatus::InProgress, $fresh->status);
        $this->assertCount(0, $fresh->getMedia('completion_photos'));
    }

    public function test_more_than_twenty_room_photos_returns_422_without_media(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $tenant = Customer::factory()->create();
        $lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $owner->id,
            'tenant_id' => $tenant->id,
        ]);
        $inventory = Inventory::factory()->create([
            'lease_id' => $lease->id,
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'conducted_by' => $owner->id,
        ]);

        Sanctum::actingAs($owner);
        $this->post("/api/inventories/{$inventory->id}/room-photos", [
            'room_name' => 'Kitchen',
            'photos' => $this->photos(21),
        ], ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['photos']);

        $this->assertCount(0, $inventory->refresh()->getMedia('room_photos'));
    }

    /**
     * Le chemin que prend désormais la clôture au front : chaque photo par `/photos`
     * (`completion_photos`) avant `/complete`. Le prestataire assigné, qui termine, y a accès.
     */
    public function test_the_assigned_provider_sends_completion_photos_one_by_one_then_completes(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::InProgress, ['accepted_at' => now()]);

        Sanctum::actingAs($provider);
        foreach ($this->photos(2) as $photo) {
            $this->postJson("/api/maintenance-requests/{$mr->id}/photos", [
                'photos' => [$photo],
                'collection' => 'completion_photos',
            ])->assertCreated();
        }
        $this->putJson("/api/maintenance-requests/{$mr->id}/complete", ['resolution_notes' => 'Joint changé.'])
            ->assertOk()
            ->assertJsonPath('data.status', MaintenanceStatus::Completed->value);

        $this->assertCount(2, $mr->refresh()->getMedia('completion_photos'));
    }

    /** @return list<UploadedFile> */
    private function photos(int $count): array
    {
        $photos = [];
        for ($i = 1; $i <= $count; $i++) {
            $photos[] = UploadedFile::fake()->image("photo{$i}.jpg", 10, 10);
        }

        return $photos;
    }
}
