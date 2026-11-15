<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\InventoryStatus;
use App\Models\Enums\InventoryType;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-2646 — la sortie reprend l'entrée signée du même bail : ses pièces, et pour chaque élément
 * `entry_state`, `entry_notes` et la vignette d'entrée. Les états d'entrée sont en LECTURE : le
 * serveur les repose à chaque écriture, un `PATCH` ne les change pas.
 */
class InventoryExitPrefillTest extends TestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $agent;

    private Lease $lease;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $owner = User::factory()->withOwnerProfile($this->agency)->create();
        $property = Property::factory()->create(['user_id' => $owner->id, 'agency_id' => $this->agency->id]);
        $this->lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $owner->id,
            'tenant_id' => Customer::factory()->create()->id,
            'agency_id' => $this->agency->id,
        ]);
        $this->agent = $this->agencyAgent($this->agency);
        Sanctum::actingAs($this->agent);
    }

    /** L'entrée de référence : saisie en brouillon, photographiée, puis signée. */
    private function signedEntry(?Lease $lease = null): Inventory
    {
        $lease ??= $this->lease;
        $id = $this->postJson('/api/inventories', [
            'lease_id' => $lease->id,
            'type' => 'move_in',
            'general_condition' => 'fair',
            'rooms' => [
                ['name' => 'Séjour', 'condition' => 'good', 'elements' => [
                    ['label' => 'Murs', 'state' => 'usé', 'notes' => 'Fissure près de la fenêtre'],
                    ['label' => 'Sol', 'state' => 'bon'],
                ]],
                ['name' => 'Cuisine', 'condition' => 'fair', 'elements' => [
                    ['label' => 'Évier', 'state' => 'endommagé', 'notes' => 'Émail éclaté'],
                ]],
            ],
        ])->assertCreated()->json('data.id');

        $this->post("/api/inventories/{$id}/room-photos", ['room_name' => 'Séjour', 'photos' => [UploadedFile::fake()->image('vue.jpg')]], ['Accept' => 'application/json'])->assertOk();
        $this->post("/api/inventories/{$id}/room-photos", ['room_name' => 'Séjour', 'element_label' => 'Murs', 'photos' => [UploadedFile::fake()->image('murs.jpg')]], ['Accept' => 'application/json'])->assertOk();

        $entry = Inventory::query()->findOrFail($id);
        $entry->forceFill(['status' => InventoryStatus::Signed, 'tenant_signed' => true, 'owner_signed' => true, 'signed_at' => now()])->save();

        return $entry;
    }

    /** @return array<string, array<string, mixed>> libellé => élément, toutes pièces confondues */
    private function elements(array $rooms): array
    {
        $out = [];
        foreach ($rooms as $room) {
            foreach ($room['elements'] ?? [] as $element) {
                $out[$room['name'].' / '.$element['label']] = $element;
            }
        }

        return $out;
    }

    public function test_ac6_une_sortie_reprend_les_pieces_et_les_etats_d_entree(): void
    {
        $entry = $this->signedEntry();
        $photos = $entry->getMedia('room_photos')->keyBy(fn ($m) => (string) $m->getCustomProperty('element_label'));

        $response = $this->postJson('/api/inventories', ['lease_id' => $this->lease->id, 'type' => 'move_out'])
            ->assertCreated()
            ->assertJsonPath('data.entry_inventory_id', $entry->id)
            ->assertJsonPath('data.general_condition', 'fair')
            ->assertJsonPath('data.rooms.0.name', 'Séjour')
            ->assertJsonPath('data.rooms.1.name', 'Cuisine');

        $elements = $this->elements($response->json('data.rooms'));
        $this->assertSame('usé', $elements['Séjour / Murs']['entry_state']);
        $this->assertSame('Fissure près de la fenêtre', $elements['Séjour / Murs']['entry_notes']);
        // La photo de l'élément d'abord ; à défaut, la vue de la pièce.
        $this->assertSame($photos['Murs']->id, $elements['Séjour / Murs']['entry_photo_id']);
        $this->assertSame($photos['']->id, $elements['Séjour / Sol']['entry_photo_id']);
        $this->assertNull($elements['Cuisine / Évier']['entry_photo_id']);
        $this->assertSame('endommagé', $elements['Cuisine / Évier']['entry_state']);
        // Le point de départ de la sortie : l'état d'entrée, sans notes.
        $this->assertSame('usé', $elements['Séjour / Murs']['state']);
        $this->assertNull($elements['Séjour / Murs']['notes']);

        // `show` résout la vignette en URL signée, à la lecture.
        $shown = $this->elements($this->getJson('/api/inventories/'.$response->json('data.id'))->assertOk()->json('data.rooms'));
        $this->assertStringContainsString('signature=', (string) $shown['Séjour / Murs']['entry_thumbnail_url']);
        $this->assertArrayNotHasKey('entry_thumbnail_url', $shown['Cuisine / Évier']);
    }

    public function test_ac6_un_patch_ne_change_pas_entry_state(): void
    {
        $this->signedEntry();
        $exit = $this->postJson('/api/inventories', ['lease_id' => $this->lease->id, 'type' => 'move_out'])->assertCreated()->json('data');

        $rooms = $exit['rooms'];
        $rooms[0]['elements'][0]['entry_state'] = 'bon';
        $rooms[0]['elements'][0]['entry_notes'] = 'réécrit';
        $rooms[0]['elements'][0]['state'] = 'endommagé';
        // Un élément nouveau, sans pendant à l'entrée, ne reçoit aucun état d'entrée.
        $rooms[0]['elements'][] = ['label' => 'Climatiseur', 'state' => 'bon', 'entry_state' => 'bon'];

        $elements = $this->elements($this->patchJson("/api/inventories/{$exit['id']}", ['rooms' => $rooms])->assertOk()->json('data.rooms'));
        $this->assertSame('usé', $elements['Séjour / Murs']['entry_state']);
        $this->assertSame('Fissure près de la fenêtre', $elements['Séjour / Murs']['entry_notes']);
        $this->assertSame('endommagé', $elements['Séjour / Murs']['state']);
        $this->assertArrayNotHasKey('entry_state', $elements['Séjour / Climatiseur']);

        // Un PATCH qui omet les états d'entrée ne les retire pas non plus.
        $bare = array_map(fn (array $room) => [
            'name' => $room['name'],
            'condition' => $room['condition'],
            'elements' => array_map(fn (array $e) => ['label' => $e['label'], 'state' => $e['state']], $room['elements']),
        ], $rooms);
        $elements = $this->elements($this->patchJson("/api/inventories/{$exit['id']}", ['rooms' => $bare])->assertOk()->json('data.rooms'));
        $this->assertSame('usé', $elements['Séjour / Murs']['entry_state']);
    }

    /** À la création aussi : un `entry_state` envoyé par le client est remplacé par celui de l'entrée. */
    public function test_les_pieces_envoyees_recoivent_les_etats_d_entree_du_serveur(): void
    {
        $this->signedEntry();

        $elements = $this->elements($this->postJson('/api/inventories', [
            'lease_id' => $this->lease->id,
            'type' => 'move_out',
            'general_condition' => 'good',
            'rooms' => [['name' => 'Séjour', 'condition' => 'good', 'elements' => [['label' => 'Murs', 'state' => 'bon', 'entry_state' => 'bon']]]],
        ])->assertCreated()->json('data.rooms'));

        $this->assertSame('usé', $elements['Séjour / Murs']['entry_state']);
    }

    public function test_sans_entree_signee_la_sortie_demarre_comme_avant(): void
    {
        // Une entrée en brouillon ne compte pas.
        Inventory::factory()->create(['lease_id' => $this->lease->id, 'property_id' => $this->lease->property_id, 'tenant_id' => $this->lease->tenant_id]);

        $this->postJson('/api/inventories', ['lease_id' => $this->lease->id, 'type' => 'move_out'])
            ->assertStatus(422)->assertJsonValidationErrors(['rooms', 'general_condition']);

        $this->postJson('/api/inventories', [
            'lease_id' => $this->lease->id,
            'type' => 'move_out',
            'general_condition' => 'good',
            'rooms' => [['name' => 'Séjour', 'condition' => 'good', 'elements' => [['label' => 'Murs', 'state' => 'bon']]]],
        ])->assertCreated()
            ->assertJsonPath('data.entry_inventory_id', null)
            ->assertJsonMissingPath('data.rooms.0.elements.0.entry_state');
    }

    public function test_la_derniere_entree_signee_est_reprise_ou_celle_designee(): void
    {
        $first = $this->signedEntry();
        $this->travel(1)->hours();
        $second = $this->signedEntry();

        $this->postJson('/api/inventories', ['lease_id' => $this->lease->id, 'type' => 'move_out'])
            ->assertCreated()->assertJsonPath('data.entry_inventory_id', $second->id);
        $this->postJson('/api/inventories', ['lease_id' => $this->lease->id, 'type' => 'move_out', 'from_inventory_id' => $first->id])
            ->assertCreated()->assertJsonPath('data.entry_inventory_id', $first->id);
    }

    /**
     * Arbitrage du 2026-11-11 — un renouvellement ne refait pas d'entrée : la sortie d'un bail renouvelé
     * reprend l'entrée signée d'un ancêtre (`renewed_from_lease_id`), au même locataire et au même bien.
     */
    public function test_la_sortie_d_un_bail_renouvele_reprend_l_entree_de_son_ancetre(): void
    {
        $entry = $this->signedEntry();
        $renewal = Lease::factory()->create([
            'property_id' => $this->lease->property_id,
            'landlord_id' => $this->lease->landlord_id,
            'tenant_id' => $this->lease->tenant_id,
            'agency_id' => $this->agency->id,
            'renewed_from_lease_id' => $this->lease->id,
        ]);
        $second = Lease::factory()->create([
            'property_id' => $this->lease->property_id,
            'landlord_id' => $this->lease->landlord_id,
            'tenant_id' => $this->lease->tenant_id,
            'agency_id' => $this->agency->id,
            'renewed_from_lease_id' => $renewal->id,
        ]);

        // Par défaut : la plus récente entrée signée de la chaîne, deux renouvellements plus haut.
        $this->postJson('/api/inventories', ['lease_id' => $second->id, 'type' => 'move_out'])
            ->assertCreated()->assertJsonPath('data.entry_inventory_id', $entry->id)
            ->assertJsonPath('data.rooms.0.elements.0.entry_state', 'usé');
        $this->postJson('/api/inventories', ['lease_id' => $renewal->id, 'type' => 'move_out', 'from_inventory_id' => $entry->id])
            ->assertCreated()->assertJsonPath('data.entry_inventory_id', $entry->id);
    }

    /** Un « ancêtre » d'un autre locataire n'est pas la même occupation : son entrée n'est pas reprise. */
    public function test_un_ancetre_d_un_autre_locataire_n_est_pas_repris(): void
    {
        $entry = $this->signedEntry();
        $otherTenancy = Lease::factory()->create([
            'property_id' => $this->lease->property_id,
            'landlord_id' => $this->lease->landlord_id,
            'tenant_id' => Customer::factory()->create()->id,
            'agency_id' => $this->agency->id,
            'renewed_from_lease_id' => $this->lease->id,
        ]);

        $this->postJson('/api/inventories', ['lease_id' => $otherTenancy->id, 'type' => 'move_out', 'from_inventory_id' => $entry->id])
            ->assertStatus(422)->assertJsonValidationErrors(['from_inventory_id']);
        $this->postJson('/api/inventories', ['lease_id' => $otherTenancy->id, 'type' => 'move_out'])
            ->assertStatus(422)->assertJsonValidationErrors(['rooms']);
    }

    /** Un « ancêtre » d'un autre bien, au même locataire, n'est pas la même occupation non plus. */
    public function test_un_ancetre_d_un_autre_bien_n_est_pas_repris(): void
    {
        $entry = $this->signedEntry();
        $otherProperty = Property::factory()->create(['user_id' => $this->lease->landlord_id, 'agency_id' => $this->agency->id]);
        $otherPlace = Lease::factory()->create([
            'property_id' => $otherProperty->id,
            'landlord_id' => $this->lease->landlord_id,
            'tenant_id' => $this->lease->tenant_id,
            'agency_id' => $this->agency->id,
            'renewed_from_lease_id' => $this->lease->id,
        ]);

        $this->postJson('/api/inventories', ['lease_id' => $otherPlace->id, 'type' => 'move_out', 'from_inventory_id' => $entry->id])
            ->assertStatus(422)->assertJsonValidationErrors(['from_inventory_id']);
        $this->postJson('/api/inventories', ['lease_id' => $otherPlace->id, 'type' => 'move_out'])
            ->assertStatus(422)->assertJsonValidationErrors(['rooms']);
    }

    public function test_from_inventory_id_doit_etre_une_entree_signee_du_meme_bail(): void
    {
        $entry = $this->signedEntry();
        $draft = Inventory::factory()->create(['lease_id' => $this->lease->id, 'property_id' => $this->lease->property_id, 'tenant_id' => $this->lease->tenant_id]);
        $signedExit = Inventory::factory()->signed()->moveOut()->create(['lease_id' => $this->lease->id, 'property_id' => $this->lease->property_id, 'tenant_id' => $this->lease->tenant_id]);
        $otherLease = Lease::factory()->create(['property_id' => $this->lease->property_id, 'landlord_id' => $this->lease->landlord_id, 'tenant_id' => $this->lease->tenant_id, 'agency_id' => $this->agency->id]);
        $foreign = $this->signedEntry($otherLease);
        $trashed = $this->signedEntry();
        $trashed->delete();

        foreach ([$draft->id, $signedExit->id, $foreign->id, $trashed->id, 999999999] as $id) {
            $this->postJson('/api/inventories', ['lease_id' => $this->lease->id, 'type' => 'move_out', 'from_inventory_id' => $id])
                ->assertStatus(422)->assertJsonValidationErrors(['from_inventory_id']);
        }

        // Sur une entrée, `from_inventory_id` n'a pas de sens.
        $this->postJson('/api/inventories', [
            'lease_id' => $this->lease->id, 'type' => 'move_in', 'from_inventory_id' => $entry->id,
            'general_condition' => 'good', 'rooms' => [['name' => 'Séjour', 'condition' => 'good']],
        ])->assertStatus(422)->assertJsonValidationErrors(['from_inventory_id']);

        $this->assertSame(0, Inventory::query()->where('type', InventoryType::MoveOut->value)->where('status', InventoryStatus::Draft->value)->count());
    }
}
