<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\InventoryStatus;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\CreatesAgencyMembers;
use Tests\TestCase;

/**
 * TCK-2647 — l'état des lieux pièce par pièce, côté API :
 *
 * - un élément peut attendre son état (`state: null`) tant que l'état des lieux est un brouillon, à
 *   la création comme à la mise à jour ; la soumission à signature le refuse (422
 *   `inventory.unqualified_elements`) ;
 * - une pièce porte `completed` (booléen, nullable), stocké puis rendu tel quel ;
 * - les lecteurs de `state` (reprise de la sortie, PDF) ne cassent pas sur un état nul.
 */
class InventoryPieceParPieceTest extends TestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $owner;

    private Lease $lease;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create();
        $this->owner = User::factory()->withOwnerProfile($this->agency)->create();
        $property = Property::factory()->create(['user_id' => $this->owner->id, 'agency_id' => $this->agency->id]);
        $this->lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $this->owner->id,
            'tenant_id' => Customer::factory()->create()->id,
            'agency_id' => $this->agency->id,
        ]);
        Sanctum::actingAs($this->agencyAgent($this->agency));
    }

    /** @param list<array<string, mixed>> $rooms */
    private function brouillon(array $rooms, string $type = 'move_in'): int
    {
        return $this->postJson('/api/inventories', [
            'lease_id' => $this->lease->id,
            'type' => $type,
            'general_condition' => 'good',
            'rooms' => $rooms,
        ])->assertCreated()->json('data.id');
    }

    /** @return list<array<string, mixed>> */
    private function piecesEnCours(): array
    {
        return [
            ['name' => 'Séjour', 'condition' => 'good', 'completed' => true, 'elements' => [
                ['label' => 'Murs', 'state' => 'bon'],
                ['label' => 'Sol', 'state' => null],
            ]],
            ['name' => 'Cuisine', 'condition' => 'fair', 'completed' => false, 'elements' => [
                ['label' => 'Évier'],
            ]],
            ['name' => 'Chambre', 'condition' => 'good', 'completed' => null],
        ];
    }

    /** AC — un brouillon garde des éléments sans état, à la création comme à la mise à jour. */
    public function test_un_brouillon_garde_des_elements_sans_etat(): void
    {
        $id = $this->brouillon($this->piecesEnCours());
        $rooms = $this->getJson("/api/inventories/{$id}")->assertOk()->json('data.rooms');
        $this->assertSame('bon', $rooms[0]['elements'][0]['state']);
        $this->assertNull($rooms[0]['elements'][1]['state']);
        $this->assertNull($rooms[1]['elements'][0]['state'] ?? null);

        $rooms[0]['elements'][0]['state'] = null;
        $this->patchJson("/api/inventories/{$id}", ['rooms' => $rooms])->assertOk();
        $this->assertNull($this->getJson("/api/inventories/{$id}")->json('data.rooms.0.elements.0.state'));

        // Un état qualifié reste juge : une valeur hors de l'énumération est refusée, nulle ou pas.
        $rooms[0]['elements'][0]['state'] = 'nuclear';
        $this->patchJson("/api/inventories/{$id}", ['rooms' => $rooms])->assertUnprocessable()
            ->assertJsonValidationErrors('rooms.0.elements.0.state');
    }

    /** AC — `completed` par pièce : stocké, puis rendu par la ressource ; un non-booléen est refusé. */
    public function test_la_piece_terminee_fait_l_aller_retour(): void
    {
        $id = $this->brouillon($this->piecesEnCours());
        $this->assertDatabaseHas('inventories', ['id' => $id]);
        $stockees = Inventory::query()->findOrFail($id)->rooms;
        $this->assertTrue($stockees[0]['completed']);
        $this->assertFalse($stockees[1]['completed']);

        $rooms = $this->getJson("/api/inventories/{$id}")->assertOk()->json('data.rooms');
        $this->assertTrue($rooms[0]['completed']);
        $this->assertFalse($rooms[1]['completed']);
        $this->assertNull($rooms[2]['completed'] ?? null);

        $rooms[1]['completed'] = true;
        $this->patchJson("/api/inventories/{$id}", ['rooms' => $rooms])->assertOk()
            ->assertJsonPath('data.rooms.1.completed', true);
        $this->assertTrue($this->getJson("/api/inventories/{$id}")->json('data.rooms.1.completed'));

        $rooms[1]['completed'] = 'oui';
        $this->patchJson("/api/inventories/{$id}", ['rooms' => $rooms])->assertUnprocessable()
            ->assertJsonValidationErrors('rooms.1.completed');
        $pieces = $this->piecesEnCours();
        $pieces[0]['completed'] = 'peut-être';
        $this->postJson('/api/inventories', ['lease_id' => $this->lease->id, 'type' => 'move_in', 'general_condition' => 'good', 'rooms' => $pieces])
            ->assertUnprocessable()->assertJsonValidationErrors('rooms.0.completed');
    }

    /** AC — la soumission refuse un élément sans état (nul ou absent) ; qualifiés, elle passe. */
    public function test_la_soumission_refuse_un_element_sans_etat(): void
    {
        $id = $this->brouillon($this->piecesEnCours());

        $this->postJson("/api/inventories/{$id}/submit")->assertUnprocessable()
            ->assertJsonPath('code', 'inventory.unqualified_elements');
        $this->assertSame(InventoryStatus::Draft, Inventory::query()->findOrFail($id)->status);

        // L'élément nul qualifié, il reste celui qui n'a pas de clé `state` du tout.
        $rooms = $this->getJson("/api/inventories/{$id}")->json('data.rooms');
        $rooms[0]['elements'][1]['state'] = 'usé';
        $this->patchJson("/api/inventories/{$id}", ['rooms' => $rooms])->assertOk();
        $this->postJson("/api/inventories/{$id}/submit")->assertUnprocessable()
            ->assertJsonPath('code', 'inventory.unqualified_elements');

        $rooms[1]['elements'][0]['state'] = 'endommagé';
        $this->patchJson("/api/inventories/{$id}", ['rooms' => $rooms])->assertOk();
        $this->postJson("/api/inventories/{$id}/submit")->assertOk();
        $this->assertSame(InventoryStatus::PendingSignature, Inventory::query()->findOrFail($id)->status);

        // Hors brouillon, un état nul ne s'écrit plus : la mise à jour ne touche que les brouillons.
        $rooms[0]['elements'][0]['state'] = null;
        $this->assertGreaterThanOrEqual(400, $this->patchJson("/api/inventories/{$id}", ['rooms' => $rooms])->status());
        $this->assertSame('bon', Inventory::query()->findOrFail($id)->rooms[0]['elements'][0]['state']);
    }

    /**
     * Les charges EXACTES du front (terrain-8, 2026-11-13) : `Demarrer.tsx` `commencer()` pour le POST
     * d'une entrée tirée du modèle (états nuls, pièces non terminées, `condition` « good » par défaut,
     * `notes` racine absente), puis `parcours.ts` `piecesPourLeServeur()` pour le PATCH « Pièce
     * suivante » (`{rooms}` seul, la pièce courante passée à `completed: true`), et une pièce d'un
     * brouillon antérieur, SANS la clé `completed`. La lecture rend `completed` tel qu'écrit et `state`
     * nul sans repli.
     */
    public function test_les_charges_du_front_pour_une_entree(): void
    {
        $id = $this->postJson('/api/inventories', [
            'lease_id' => $this->lease->id,
            'type' => 'move_in',
            'conducted_at' => '2026-11-13T10:30:00.000Z',
            'general_condition' => 'good',
            'rooms' => [
                ['name' => 'Séjour', 'condition' => 'good', 'notes' => null, 'completed' => false, 'elements' => [
                    ['label' => 'Murs', 'state' => null, 'notes' => null],
                    ['label' => 'Sol', 'state' => null, 'notes' => null],
                ]],
                ['name' => 'Terrasse', 'condition' => 'good', 'notes' => null, 'completed' => false, 'elements' => []],
            ],
        ])->assertCreated()->json('data.id');

        $lu = $this->getJson("/api/inventories/{$id}")->assertOk()->json('data.rooms');
        $this->assertSame([false, false], array_column($lu, 'completed'));
        $this->assertSame([null, null], array_column($lu[0]['elements'], 'state'));
        $this->assertSame([], $lu[1]['elements']);

        $this->patchJson("/api/inventories/{$id}", ['rooms' => [
            ['name' => 'Séjour', 'condition' => 'good', 'completed' => true, 'notes' => null, 'elements' => [
                ['label' => 'Murs', 'state' => null, 'notes' => null],
                ['label' => 'Sol', 'state' => 'usé', 'notes' => null],
            ]],
            ['name' => 'Cuisine', 'condition' => 'good', 'completed' => false, 'notes' => null, 'elements' => []],
            // Une pièce d'un brouillon antérieur au parcours : la clé `completed` ne part pas.
            ['name' => 'Chambre', 'condition' => 'good', 'notes' => null, 'elements' => [['label' => 'Porte', 'state' => 'bon', 'notes' => null]]],
        ]])->assertOk();

        $lu = $this->getJson("/api/inventories/{$id}")->assertOk()->json('data.rooms');
        $this->assertTrue($lu[0]['completed']);
        $this->assertFalse($lu[1]['completed']);
        $this->assertArrayNotHasKey('completed', $lu[2]);
        $this->assertNull($lu[0]['elements'][0]['state']);
        $this->assertSame('usé', $lu[0]['elements'][1]['state']);

        // Le front affiche le message tel quel (useMessageErreurApi) : un libellé, jamais la clé.
        $refus = $this->postJson("/api/inventories/{$id}/submit")->assertUnprocessable()
            ->assertJsonPath('code', 'inventory.unqualified_elements');
        $this->assertContains($refus->json('message'), [
            'Chaque élément doit avoir un état avant la soumission à signature.',
            'Every element needs a condition before the inventory is submitted for signature.',
        ]);
    }

    /**
     * Les charges EXACTES du front pour une SORTIE : le POST reprend les pièces de l'entrée signée
     * (`from_inventory_id`, états d'entrée, `general_condition` de l'entrée, ni `entry_*` ni
     * `retention_*`), puis le PATCH porte `retention_amount` en NOMBRE ou null et `retention_reason`
     * null ; un élément peut rester sans état. Le serveur repose les `entry_*` (`attach`).
     */
    public function test_les_charges_du_front_pour_une_sortie(): void
    {
        $entree = Inventory::factory()->signed()->create([
            'lease_id' => $this->lease->id,
            'property_id' => $this->lease->property_id,
            'tenant_id' => $this->lease->tenant_id,
            'type' => 'move_in',
            'general_condition' => 'fair',
            'rooms' => [
                ['name' => 'Séjour', 'condition' => 'good', 'elements' => [['label' => 'Murs', 'state' => 'bon'], ['label' => 'Sol', 'state' => 'usé']]],
                ['name' => 'Cuisine', 'condition' => 'fair', 'elements' => [
                    ['label' => 'Plaques de cuisson', 'state' => 'bon'], ['label' => 'Murs', 'state' => 'usé'], ['label' => 'Placards', 'state' => null],
                ]],
                ['name' => 'Débarras', 'condition' => 'good', 'elements' => []],
            ],
        ]);

        $id = $this->postJson('/api/inventories', [
            'lease_id' => $this->lease->id,
            'type' => 'move_out',
            'conducted_at' => '2026-11-13T10:30:00.000Z',
            'general_condition' => 'fair',
            'from_inventory_id' => $entree->id,
            'rooms' => [
                ['name' => 'Séjour', 'condition' => 'good', 'notes' => null, 'completed' => false, 'elements' => [
                    ['label' => 'Murs', 'state' => 'bon', 'notes' => null], ['label' => 'Sol', 'state' => 'usé', 'notes' => null],
                ]],
                ['name' => 'Cuisine', 'condition' => 'fair', 'notes' => null, 'completed' => false, 'elements' => [
                    ['label' => 'Plaques de cuisson', 'state' => 'bon', 'notes' => null],
                    ['label' => 'Murs', 'state' => 'usé', 'notes' => null],
                    ['label' => 'Placards', 'state' => null, 'notes' => null],
                ]],
                ['name' => 'Débarras', 'condition' => 'good', 'notes' => null, 'completed' => false, 'elements' => []],
            ],
        ])->assertCreated()->json('data.id');
        $this->assertSame($entree->id, Inventory::query()->findOrFail($id)->entry_inventory_id);

        $this->patchJson("/api/inventories/{$id}", ['rooms' => [
            ['name' => 'Séjour', 'condition' => 'good', 'completed' => true, 'notes' => null, 'elements' => [
                ['label' => 'Murs', 'state' => 'bon', 'notes' => null, 'retention_amount' => null, 'retention_reason' => null],
                ['label' => 'Sol', 'state' => 'usé', 'notes' => null, 'retention_amount' => null, 'retention_reason' => null],
            ]],
            ['name' => 'Cuisine', 'condition' => 'good', 'completed' => false, 'notes' => null, 'elements' => [
                ['label' => 'Plaques de cuisson', 'state' => 'endommagé', 'notes' => 'Une plaque fendue', 'retention_amount' => 35000, 'retention_reason' => null],
                ['label' => 'Murs', 'state' => 'usé', 'notes' => null, 'retention_amount' => null, 'retention_reason' => null],
                ['label' => 'Placards', 'state' => null, 'notes' => null, 'retention_amount' => null, 'retention_reason' => null],
            ]],
            ['name' => 'Débarras', 'condition' => 'good', 'completed' => false, 'notes' => null, 'elements' => []],
        ]])->assertOk();

        $lu = $this->getJson("/api/inventories/{$id}")->assertOk()->json('data');
        $this->assertEquals(35000, $lu['retention_total']);
        $cuisine = collect($lu['rooms'][1]['elements'])->keyBy('label');
        $this->assertSame([true, false, false], array_column($lu['rooms'], 'completed'));
        $this->assertEquals(35000, $cuisine['Plaques de cuisson']['retention_amount']);
        $this->assertSame('bon', $cuisine['Plaques de cuisson']['entry_state'], 'le serveur repose l\'état d\'entrée');
        $this->assertNull($cuisine['Placards']['state']);
        $this->assertNull($cuisine['Placards']['entry_state']);
        $this->assertSame([], $lu['rooms'][2]['elements']);

        $this->postJson("/api/inventories/{$id}/submit")->assertUnprocessable()
            ->assertJsonPath('code', 'inventory.unqualified_elements');
    }

    /** Les lecteurs de `state` : la sortie reprend une entrée dont un élément n'a pas d'état, sans casser. */
    public function test_la_sortie_reprend_une_entree_aux_elements_sans_etat(): void
    {
        Inventory::factory()->signed()->create([
            'lease_id' => $this->lease->id,
            'property_id' => $this->lease->property_id,
            'tenant_id' => $this->lease->tenant_id,
            'type' => 'move_in',
            'rooms' => [['name' => 'Séjour', 'condition' => 'good', 'elements' => [
                ['label' => 'Murs', 'state' => null],
                ['label' => 'Sol'],
                ['label' => 'Plafond', 'state' => 'bon'],
            ]]],
        ]);

        $id = $this->postJson('/api/inventories', ['lease_id' => $this->lease->id, 'type' => 'move_out'])
            ->assertCreated()->json('data.id');
        $elements = collect($this->getJson("/api/inventories/{$id}")->assertOk()->json('data.rooms.0.elements'))->keyBy('label');

        $this->assertNull($elements['Murs']['state']);
        $this->assertNull($elements['Murs']['entry_state']);
        $this->assertNull($elements['Sol']['state']);
        $this->assertNull($elements['Sol']['entry_state']);
        $this->assertSame('bon', $elements['Plafond']['entry_state']);

        // La sortie se reprend par écriture (attach) et refuse la soumission tant qu'un élément attend.
        $rooms = $this->getJson("/api/inventories/{$id}")->json('data.rooms');
        $this->patchJson("/api/inventories/{$id}", ['rooms' => $rooms])->assertOk();
        $this->postJson("/api/inventories/{$id}/submit")->assertUnprocessable()
            ->assertJsonPath('code', 'inventory.unqualified_elements');
    }

    /** Le PDF d'un état des lieux dont un élément n'a pas d'état (nul ou absent) se rend. */
    public function test_le_pdf_se_rend_avec_un_element_sans_etat(): void
    {
        $inventory = Inventory::factory()->signed()->create([
            'lease_id' => $this->lease->id,
            'property_id' => $this->lease->property_id,
            'tenant_id' => $this->lease->tenant_id,
            'conducted_by' => $this->owner->id,
            'rooms' => [['name' => 'Séjour', 'condition' => 'good', 'completed' => true, 'elements' => [
                ['label' => 'Murs', 'state' => null],
                ['label' => 'Sol'],
            ]]],
        ]);
        Sanctum::actingAs($this->owner);

        $response = $this->get("/api/inventories/{$inventory->id}/pdf");

        $response->assertOk();
        $this->assertStringStartsWith('%PDF-', (string) $response->getContent());
    }
}
