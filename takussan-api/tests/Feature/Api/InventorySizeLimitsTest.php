<?php

namespace Tests\Feature\Api;

use App\Http\Requests\InventoryStoreRequest;
use App\Models\Customer;
use App\Models\Enums\InventoryCondition;
use App\Models\Enums\InventoryStatus;
use App\Models\Enums\InventoryType;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * P143.01 (TCK-1915) — un état des lieux est borné à l'envoi, pour que son PDF, recomposé par
 * dompdf à chaque téléchargement, se rende sous le `memory_limit` de 256M (`docker/php.ini`).
 *
 * Décision du porteur (2026-10-23) : 20 pièces × 20 éléments, notes d'élément à 200 caractères,
 * notes de pièce et générales à 1 000, libellés à 255. Mesuré avant la décision : 40 × 40 rendait
 * `Allowed memory size of 268435456 bytes exhausted` dans dompdf ; 20 × 20 au plafond, 25,4 s et
 * un pic de 188 Mo.
 */
class InventorySizeLimitsTest extends TestCase
{
    use RefreshDatabase;

    public function test_store_refuses_more_rooms_elements_or_longer_notes_than_the_ceiling(): void
    {
        [$owner, $lease] = $this->scaffold();
        Sanctum::actingAs($owner);

        $base = [
            'lease_id' => $lease->id,
            'type' => InventoryType::MoveIn->value,
            'general_condition' => InventoryCondition::Good->value,
        ];

        $this->postJson('/api/inventories', $base + [
            'rooms' => $this->rooms(InventoryStoreRequest::MAX_ROOMS + 1, 1, 10, 10),
        ])->assertStatus(422)->assertJsonValidationErrors('rooms');

        $this->postJson('/api/inventories', $base + [
            'rooms' => $this->rooms(1, InventoryStoreRequest::MAX_ELEMENTS_PER_ROOM + 1, 10, 10),
        ])->assertStatus(422)->assertJsonValidationErrors('rooms.0.elements');

        $this->postJson('/api/inventories', $base + [
            'rooms' => $this->rooms(1, 1, 10, InventoryStoreRequest::MAX_ELEMENT_NOTES + 1),
        ])->assertStatus(422)->assertJsonValidationErrors('rooms.0.elements.0.notes');

        $this->postJson('/api/inventories', $base + [
            'rooms' => $this->rooms(1, 1, InventoryStoreRequest::MAX_NOTES + 1, 10),
        ])->assertStatus(422)->assertJsonValidationErrors('rooms.0.notes');

        $this->postJson('/api/inventories', $base + [
            'notes' => $this->words(InventoryStoreRequest::MAX_NOTES + 1),
            'rooms' => $this->rooms(1, 1, 10, 10),
        ])->assertStatus(422)->assertJsonValidationErrors('notes');

        $this->assertSame(0, Inventory::query()->count());
    }

    public function test_store_accepts_an_inventory_exactly_at_the_ceiling(): void
    {
        [$owner, $lease] = $this->scaffold();
        Sanctum::actingAs($owner);

        $this->postJson('/api/inventories', [
            'lease_id' => $lease->id,
            'type' => InventoryType::MoveIn->value,
            'general_condition' => InventoryCondition::Good->value,
            'notes' => $this->words(InventoryStoreRequest::MAX_NOTES),
            'rooms' => $this->ceilingRooms(),
        ])->assertCreated();
    }

    public function test_update_refuses_what_store_refuses(): void
    {
        [$owner, , $property] = $this->scaffold();
        $inventory = Inventory::factory()->create([
            'property_id' => $property->id,
            'conducted_by' => $owner->id,
            'status' => InventoryStatus::Draft,
        ]);
        Sanctum::actingAs($owner);

        $url = "/api/inventories/{$inventory->id}";

        $this->patchJson($url, ['rooms' => $this->rooms(InventoryStoreRequest::MAX_ROOMS + 1, 1, 10, 10)])
            ->assertStatus(422)->assertJsonValidationErrors('rooms');
        $this->patchJson($url, ['rooms' => $this->rooms(1, InventoryStoreRequest::MAX_ELEMENTS_PER_ROOM + 1, 10, 10)])
            ->assertStatus(422)->assertJsonValidationErrors('rooms.0.elements');
        $this->patchJson($url, ['rooms' => $this->rooms(1, 1, 10, InventoryStoreRequest::MAX_ELEMENT_NOTES + 1)])
            ->assertStatus(422)->assertJsonValidationErrors('rooms.0.elements.0.notes');
        $this->patchJson($url, ['rooms' => $this->rooms(1, 1, InventoryStoreRequest::MAX_NOTES + 1, 10)])
            ->assertStatus(422)->assertJsonValidationErrors('rooms.0.notes');
        $this->patchJson($url, ['notes' => $this->words(InventoryStoreRequest::MAX_NOTES + 1)])
            ->assertStatus(422)->assertJsonValidationErrors('notes');

        $this->patchJson($url, [
            'notes' => $this->words(InventoryStoreRequest::MAX_NOTES),
            'rooms' => $this->ceilingRooms(),
        ])->assertOk();
    }

    /**
     * La garde de la `Piste` : l'état des lieux signé le plus lourd que l'envoi accepte se rend en
     * PDF sous `memory_limit = 256M`. Le texte est en mots de trois lettres : chaque mot est un
     * cadre dompdf, et c'est le nombre de mots qui fait la mémoire (mesure du 2026-10-23).
     */
    public function test_the_signed_pdf_at_the_ceiling_renders_under_256m(): void
    {
        [$owner, $lease, $property, $tenant] = $this->scaffold();
        $inventory = Inventory::factory()->signed()->create([
            'lease_id' => $lease->id,
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'conducted_by' => $owner->id,
            'notes' => $this->words(InventoryStoreRequest::MAX_NOTES),
            'rooms' => $this->ceilingRooms(),
        ]);
        Sanctum::actingAs($owner);

        $previous = ini_get('memory_limit');
        // Le processus PHPUnit porte déjà l'application et le harnais : la borne se pose au-dessus
        // de ce qu'il occupe, comme une requête de FrankenPHP qui part de son propre socle.
        $limit = max(256 * 1024 * 1024, memory_get_usage() + 216 * 1024 * 1024);
        $this->assertNotFalse(ini_set('memory_limit', (string) $limit));

        try {
            $response = $this->get("/api/inventories/{$inventory->id}/pdf");
        } finally {
            ini_set('memory_limit', $previous);
        }

        $response->assertOk();
        $this->assertStringStartsWith('%PDF-', (string) $response->getContent());
    }

    /**
     * @return array{0: User, 1: Lease, 2: Property, 3: Customer}
     */
    private function scaffold(): array
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $tenant = Customer::factory()->create();
        $lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $owner->id,
            'tenant_id' => $tenant->id,
        ]);

        return [$owner, $lease, $property, $tenant];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function ceilingRooms(): array
    {
        return $this->rooms(
            InventoryStoreRequest::MAX_ROOMS,
            InventoryStoreRequest::MAX_ELEMENTS_PER_ROOM,
            InventoryStoreRequest::MAX_NOTES,
            InventoryStoreRequest::MAX_ELEMENT_NOTES,
        );
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function rooms(int $rooms, int $elements, int $roomNotes, int $elementNotes): array
    {
        $out = [];
        for ($r = 0; $r < $rooms; $r++) {
            $items = [];
            for ($e = 0; $e < $elements; $e++) {
                $items[] = [
                    'label' => $this->words(255, "e{$r}-{$e} "),
                    'state' => 'bon',
                    'notes' => $this->words($elementNotes),
                ];
            }
            $out[] = [
                'name' => $this->words(255, "p{$r} "),
                'condition' => 'good',
                'notes' => $this->words($roomNotes),
                'elements' => $items,
            ];
        }

        return $out;
    }

    /** Une chaîne de `$length` caractères exactement, en mots de trois lettres, sans espace final. */
    private function words(int $length, string $prefix = ''): string
    {
        $text = $prefix.str_repeat('abc ', intdiv($length, 4) + 1);

        return substr($text, 0, $length - 1).'x';
    }
}
