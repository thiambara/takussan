<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Enums\InventoryCondition;
use App\Models\Enums\InventoryType;
use App\Models\Enums\MaintenanceCategory;
use App\Models\Lease;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-1070 (P62.04) — l'état des lieux, la demande d'intervention et la conversation (directe et
 * de groupe) ne disent plus à un compte connecté quels baux et quelles demandes d'intervention
 * existent. `exists:leases,id` et `exists:maintenance_requests,id` rendaient « The selected … is
 * invalid » pour un identifiant absent, là où un bail tiers passait la validation et recevait le
 * refus. L'absent reçoit désormais la réponse du refus (modèle de TCK-599).
 */
class LeaseContextExistenceOracleTest extends TestCase
{
    use RefreshDatabase;

    private const ABSENT = 99999999;

    private User $actor;

    private Lease $leaseTiers;

    protected function setUp(): void
    {
        parent::setUp();

        $tierce = Agency::factory()->create();
        $this->leaseTiers = Lease::factory()->create([
            'agency_id' => $tierce->id,
            'property_id' => Property::factory()->create(['agency_id' => $tierce->id])->id,
        ]);
        $this->actor = User::factory()->create();
        Sanctum::actingAs($this->actor);
    }

    /** @return array{0: int, 1: mixed} */
    private function verdict(TestResponse $response): array
    {
        return [$response->status(), $response->json()];
    }

    private function inventory(int $leaseId): TestResponse
    {
        return $this->postJson('/api/inventories', [
            'lease_id' => $leaseId,
            'type' => InventoryType::MoveIn->value,
            'general_condition' => InventoryCondition::Good->value,
            'rooms' => [['name' => 'Salon', 'condition' => InventoryCondition::Good->value]],
        ]);
    }

    public function test_l_etat_des_lieux_rend_le_refus_pour_un_bail_absent(): void
    {
        $tiers = $this->verdict($this->inventory($this->leaseTiers->id));
        $absent = $this->verdict($this->inventory(self::ABSENT));

        $this->assertSame(403, $tiers[0]);
        $this->assertSame($tiers, $absent);
        $this->assertDatabaseCount('inventories', 0);
    }

    public function test_l_etat_des_lieux_sans_corps_complet_ne_distingue_pas_le_bail(): void
    {
        $tiers = $this->verdict($this->postJson('/api/inventories', ['lease_id' => $this->leaseTiers->id]));
        $absent = $this->verdict($this->postJson('/api/inventories', ['lease_id' => self::ABSENT]));

        $this->assertSame(422, $tiers[0]);
        $this->assertSame($tiers, $absent);
    }

    private function maintenance(int $propertyId, int $leaseId): TestResponse
    {
        return $this->postJson('/api/maintenance-requests', [
            'property_id' => $propertyId,
            'lease_id' => $leaseId,
            'title' => 'Fuite',
            'description' => 'Sous l’évier',
            'category' => MaintenanceCategory::cases()[0]->value,
        ]);
    }

    public function test_l_intervention_rend_le_refus_pour_un_bail_absent_ou_tiers(): void
    {
        // Le bien est à l'appelant : seul le bail rattaché se juge.
        $property = Property::factory()->create(['user_id' => $this->actor->id]);

        $tiers = $this->verdict($this->maintenance($property->id, $this->leaseTiers->id));
        $absent = $this->verdict($this->maintenance($property->id, self::ABSENT));

        $this->assertSame(403, $tiers[0]);
        $this->assertSame($tiers, $absent);
        $this->assertDatabaseCount('maintenance_requests', 0);
    }

    public function test_la_conversation_directe_rend_le_refus_pour_un_bail_absent(): void
    {
        $other = User::factory()->create();
        $direct = fn (int|string $leaseId) => $this->verdict($this->postJson('/api/conversations', [
            'participants' => [$other->id],
            'lease_id' => $leaseId,
        ]));

        $tiers = $direct($this->leaseTiers->id);
        $absent = $direct(self::ABSENT);

        $this->assertSame(422, $tiers[0]);
        $this->assertSame(__('messaging.errors.conversation_context_forbidden'), $tiers[1]['errors']['lease_id'][0] ?? null);
        $this->assertSame($tiers, $absent);
        $this->assertSame(422, $direct('abc')[0], 'un identifiant non entier ne part pas en SQL');
    }

    public function test_le_groupe_rend_le_refus_pour_un_bail_ou_une_intervention_absents(): void
    {
        $others = User::factory()->count(2)->create()->pluck('id')->all();
        $group = fn (array $context) => $this->verdict($this->postJson('/api/conversations', [
            'type' => 'group',
            'subject' => 'Sujet',
            'participants' => $others,
        ] + $context));

        $maintenanceTiers = MaintenanceRequest::factory()->create(['property_id' => $this->leaseTiers->property_id]);

        $leaseTiers = $group(['lease_id' => $this->leaseTiers->id]);
        $this->assertSame(__('messaging.errors.group_context_forbidden'), $leaseTiers[1]['errors']['lease_id'][0] ?? null);
        $this->assertSame($leaseTiers, $group(['lease_id' => self::ABSENT]));

        $mrTiers = $group(['maintenance_request_id' => $maintenanceTiers->id]);
        $this->assertSame(__('messaging.errors.group_context_forbidden'), $mrTiers[1]['errors']['maintenance_request_id'][0] ?? null);
        $this->assertSame($mrTiers, $group(['maintenance_request_id' => self::ABSENT]));

        $propertyTiers = $group(['property_id' => $this->leaseTiers->property_id]);
        $this->assertSame(__('messaging.errors.group_context_forbidden'), $propertyTiers[1]['errors']['property_id'][0] ?? null);
        $this->assertSame($propertyTiers, $group(['property_id' => self::ABSENT]));
    }
}
