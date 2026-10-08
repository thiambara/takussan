<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Enums\InventoryStatus;
use App\Models\Enums\InventoryType;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Services\Inventory\InventorySignatureService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-596 §5 (AC21) — l'empreinte d'un état des lieux signé couvre ses photos, et elle est FIGÉE.
 *
 * Avant ce ticket, l'empreinte imprimée portait sur l'identité, les pièces et les signatures, pas
 * sur les photos, et elle était recalculée à chaque rendu : le PDF « signé » pouvait changer sans
 * que son empreinte le dise.
 */
class InventoryTraceabilityHashTest extends TestCase
{
    use RefreshDatabase;

    private const SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAvMBAOeufn4AAAAASUVORK5CYII=';

    /**
     * Deux états identiques sauf UNE photo : on compare le même état des lieux avant et après
     * l'échange des octets d'une photo (même pièce, même nombre). Comparer deux lignes distinctes
     * ne prouverait rien : leurs `id` diffèrent toujours.
     */
    public function test_frozen_hash_changes_when_a_single_photo_differs(): void
    {
        [$owner, $tenantUser, $inventory] = $this->scaffold();
        $media = $inventory->addMedia(UploadedFile::fake()->image('salon.jpg', 20, 20))
            ->withCustomProperties(['room_name' => 'Kitchen'])
            ->toMediaCollection('room_photos');
        $service = app(InventorySignatureService::class);

        $before = $service->frozenTraceabilityHash($inventory->refresh());
        Storage::disk($media->disk)->put($media->getPathRelativeToRoot(), 'des octets différents');
        $after = $service->frozenTraceabilityHash($inventory->refresh());

        $this->assertSame(64, strlen($before));
        $this->assertNotSame($before, $after);
    }

    /** La seconde signature fige la colonne ; le PDF l'imprime, et un rendu ultérieur ne la recalcule pas. */
    public function test_second_signature_freezes_the_hash_and_the_pdf_prints_it(): void
    {
        [$owner, $tenantUser, $inventory] = $this->scaffold();
        $inventory->addMedia(UploadedFile::fake()->image('k.jpg', 20, 20))
            ->withCustomProperties(['room_name' => 'Kitchen'])
            ->toMediaCollection('room_photos');
        $inventory->update(['status' => InventoryStatus::PendingSignature]);

        Sanctum::actingAs($owner);
        $this->postJson("/api/inventories/{$inventory->id}/sign", ['role' => 'landlord', 'signature' => self::SIGNATURE])
            ->assertOk()
            ->assertJsonPath('data.traceability_hash', null);

        Sanctum::actingAs($tenantUser);
        $frozen = $this->postJson("/api/inventories/{$inventory->id}/sign", ['role' => 'tenant', 'signature' => self::SIGNATURE])
            ->assertOk()
            ->json('data.traceability_hash');

        $this->assertIsString($frozen);
        $this->assertSame(64, strlen($frozen));
        $this->assertSame($frozen, app(InventorySignatureService::class)->traceabilityHash($inventory->refresh()));
        $this->assertNotSame(
            app(InventorySignatureService::class)->legacyTraceabilityHash($inventory),
            $frozen,
        );
    }

    /**
     * Un état signé AVANT la migration (colonne nulle) garde l'empreinte qu'il imprime aujourd'hui.
     * La valeur est celle de l'ancien calcul (`e3ab4a4e`) sur une entrée figée — et non recalculée
     * ici par le même code, qui ne prouverait que l'égalité d'une fonction avec elle-même.
     */
    public function test_inventory_signed_before_the_migration_keeps_its_printed_hash(): void
    {
        $inventory = new Inventory;
        $inventory->forceFill([
            'id' => 4242,
            'property_id' => 17,
            'lease_id' => 23,
            'type' => InventoryType::MoveIn,
            'conducted_at' => Carbon::parse('2026-03-01T10:00:00+00:00'),
            'rooms' => [['name' => 'Salon', 'condition' => 'good', 'notes' => null]],
            'tenant_signature_hash' => str_repeat('a', 64),
            'owner_signature_hash' => str_repeat('b', 64),
            'traceability_hash' => null,
        ]);

        $this->assertSame('d5ea363043d795f2', app(InventorySignatureService::class)->traceabilityHash($inventory));
    }

    /** @return array{0: User, 1: User, 2: Inventory} */
    private function scaffold(): array
    {
        $owner = User::factory()->create();
        $tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $tenantUser->id]);
        $property = Property::factory()->create(['user_id' => $owner->id]);
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

        return [$owner, $tenantUser, $inventory];
    }
}
