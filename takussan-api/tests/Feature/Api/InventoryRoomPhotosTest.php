<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Enums\InventoryStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * TCK-596 §5 (AC15, AC16) — les photos d'un état des lieux appartiennent à une pièce, se voient, et
 * ne bougent plus une fois l'état soumis.
 *
 * Avant ce ticket : `uploadRoomPhotos` n'avait AUCUNE garde de statut (on ajoutait des photos à un
 * état signé, et le PDF « signé », recomposé au téléchargement, changeait après les signatures),
 * `room_name` était une chaîne libre, `show` ne rendait pas les photos et rien ne les retirait.
 */
class InventoryRoomPhotosTest extends TestCase
{
    use RefreshDatabase;

    /** AC15 — 409 sur un état signé, 422 sur un état soumis ou contesté ; aucun média ajouté. */
    #[DataProvider('lockedStatuses')]
    public function test_upload_on_a_non_draft_inventory_is_refused_before_any_write(InventoryStatus $status, int $expected): void
    {
        [$owner, $inventory] = $this->scaffold(['status' => $status]);

        Sanctum::actingAs($owner);
        $this->post("/api/inventories/{$inventory->id}/room-photos", [
            'room_name' => 'Kitchen',
            'photos' => [UploadedFile::fake()->image('a.jpg')],
        ], ['Accept' => 'application/json'])->assertStatus($expected);

        $this->assertCount(0, $inventory->refresh()->getMedia('room_photos'));
    }

    public static function lockedStatuses(): array
    {
        return [
            'signed' => [InventoryStatus::Signed, 409],
            'pending_signature' => [InventoryStatus::PendingSignature, 422],
            'disputed' => [InventoryStatus::Disputed, 422],
        ];
    }

    /** AC15 — une pièce absente de `rooms` → 422, aucun média. */
    public function test_upload_to_an_unknown_room_returns_422(): void
    {
        [$owner, $inventory] = $this->scaffold();

        Sanctum::actingAs($owner);
        $this->post("/api/inventories/{$inventory->id}/room-photos", [
            'room_name' => 'Garage',
            'photos' => [UploadedFile::fake()->image('a.jpg')],
        ], ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['room_name']);

        $this->assertCount(0, $inventory->refresh()->getMedia('room_photos'));
    }

    /** AC16 — `show` rend les photos groupées par pièce, par URL signée ; `index` ne les rend pas. */
    public function test_show_returns_signed_urls_grouped_by_room(): void
    {
        [$owner, $inventory] = $this->scaffold();

        Sanctum::actingAs($owner);
        foreach (['Kitchen' => 2, 'Living room' => 1] as $room => $count) {
            $files = [];
            for ($i = 0; $i < $count; $i++) {
                $files[] = UploadedFile::fake()->image("{$room}-{$i}.jpg");
            }
            $this->post("/api/inventories/{$inventory->id}/room-photos", [
                'room_name' => $room,
                'photos' => $files,
            ], ['Accept' => 'application/json'])->assertOk();
        }

        $response = $this->getJson("/api/inventories/{$inventory->id}")->assertOk();
        $groups = collect($response->json('data.room_photos'))->keyBy('room_name');

        // L'ordre des pièces est celui de l'état des lieux.
        $this->assertSame(['Living room', 'Kitchen'], $groups->keys()->all());
        $this->assertCount(1, $groups['Living room']['photos']);
        $this->assertCount(2, $groups['Kitchen']['photos']);
        foreach ($groups['Kitchen']['photos'] as $photo) {
            $this->assertSame('Kitchen', $photo['room_name']);
            $this->assertStringContainsString('signature=', $photo['url']);
        }

        $this->getJson('/api/inventories')->assertOk()->assertJsonMissingPath('data.0.room_photos');
    }

    /** AC16 — l'agent supprime une photo en brouillon (204). */
    public function test_delete_a_room_photo_on_a_draft(): void
    {
        [$owner, $inventory] = $this->scaffold();
        $media = $inventory->addMedia(UploadedFile::fake()->image('k.jpg'))
            ->withCustomProperties(['room_name' => 'Kitchen'])
            ->toMediaCollection('room_photos');

        Sanctum::actingAs($owner);
        $this->deleteJson("/api/inventories/{$inventory->id}/room-photos/{$media->id}")->assertNoContent();

        $this->assertCount(0, $inventory->refresh()->getMedia('room_photos'));
    }

    /** AC16 — la suppression sur un état soumis → 422, signé → 409 ; la photo reste. */
    #[DataProvider('lockedStatuses')]
    public function test_delete_on_a_non_draft_inventory_is_refused(InventoryStatus $status, int $expected): void
    {
        [$owner, $inventory] = $this->scaffold();
        $media = $inventory->addMedia(UploadedFile::fake()->image('k.jpg'))
            ->withCustomProperties(['room_name' => 'Kitchen'])
            ->toMediaCollection('room_photos');
        $inventory->update(['status' => $status]);

        Sanctum::actingAs($owner);
        $this->deleteJson("/api/inventories/{$inventory->id}/room-photos/{$media->id}")->assertStatus($expected);

        $this->assertCount(1, $inventory->refresh()->getMedia('room_photos'));
    }

    /** Un média d'un AUTRE état des lieux, ou d'une autre collection → 404, et il reste. */
    public function test_delete_a_media_of_another_inventory_or_collection_returns_404(): void
    {
        [$owner, $inventory] = $this->scaffold();
        [, $other] = $this->scaffold([], $owner);
        $foreign = $other->addMedia(UploadedFile::fake()->image('o.jpg'))
            ->withCustomProperties(['room_name' => 'Kitchen'])
            ->toMediaCollection('room_photos');
        $otherCollection = $inventory->addMedia(UploadedFile::fake()->image('p.jpg'))->toMediaCollection('photos');

        Sanctum::actingAs($owner);
        $this->deleteJson("/api/inventories/{$inventory->id}/room-photos/{$foreign->id}")->assertNotFound();
        $this->deleteJson("/api/inventories/{$inventory->id}/room-photos/{$otherCollection->id}")->assertNotFound();

        $this->assertCount(1, $other->refresh()->getMedia('room_photos'));
        $this->assertCount(1, $inventory->refresh()->getMedia('photos'));
    }

    /** Un tiers ne supprime rien (403), même un média qui existe. */
    public function test_stranger_cannot_delete_a_room_photo(): void
    {
        [, $inventory] = $this->scaffold();
        $media = $inventory->addMedia(UploadedFile::fake()->image('k.jpg'))
            ->withCustomProperties(['room_name' => 'Kitchen'])
            ->toMediaCollection('room_photos');

        Sanctum::actingAs(User::factory()->create());
        $this->deleteJson("/api/inventories/{$inventory->id}/room-photos/{$media->id}")->assertForbidden();

        $this->assertCount(1, $inventory->refresh()->getMedia('room_photos'));
    }

    /**
     * @param  array<string, mixed>  $attributes
     * @return array{0: User, 1: Inventory}
     */
    private function scaffold(array $attributes = [], ?User $owner = null): array
    {
        $owner ??= User::factory()->create();
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
            ...$attributes,
        ]);

        return [$owner, $inventory];
    }
}
