<?php

namespace Tests\Feature\Commission;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2364 (P241.01, P241.03 ; ADR-0049, amendement du 2026-10-25) — la part de commission d'un
 * collaborateur (`commission_share`) est la ventilation de la commission de l'agence : seul le
 * personnel de l'agence du bien qui tient `leases.create` l'écrit, à l'ajout, à la modification et à
 * la copie du bien, et seul lui la lit.
 *
 * Avant : le bailleur du bien, qui tient `update` par `properties.update_own`, donnait 100 % à l'agent
 * de son choix (201), effaçait la part posée par l'admin (200), et lisait les parts de tous.
 */
class CommissionShareWritersTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    private User $landlord;

    private Property $property;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->admin = $this->agencyAdmin($this->agency);
        $this->landlord = User::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $this->landlord->id, 'agency_id' => $this->agency->id]);
        $this->property = Property::factory()->create(['user_id' => $this->landlord->id, 'agency_id' => $this->agency->id]);
    }

    private function url(string $suffix = ''): string
    {
        return "/api/properties/{$this->property->id}/collaborators{$suffix}";
    }

    private function lineByAdmin(User $agent, float $share): PropertyCollaborator
    {
        $this->actingAsApi($this->admin);
        $id = $this->postJson($this->url(), ['user_id' => $agent->id, 'role' => 'agent', 'commission_share' => $share])
            ->assertCreated()->json('data.id');

        return PropertyCollaborator::query()->findOrFail($id);
    }

    public function test_the_landlord_cannot_add_a_collaborator_with_a_share(): void
    {
        $agent = $this->agencyAgent($this->agency);

        $this->actingAsApi($this->landlord);
        $this->postJson($this->url(), ['user_id' => $agent->id, 'role' => 'agent', 'commission_share' => 100])
            ->assertForbidden()->assertJsonPath('code', 'property.commission_share_forbidden');

        $this->assertSame(0, $this->property->collaborators()->count());
    }

    public function test_the_landlord_still_adds_a_collaborator_without_a_share(): void
    {
        $agent = $this->agencyAgent($this->agency);
        $other = $this->agencyAgent($this->agency);

        $this->actingAsApi($this->landlord);
        $this->postJson($this->url(), ['user_id' => $agent->id, 'role' => 'agent'])->assertCreated();
        $this->postJson($this->url(), ['user_id' => $other->id, 'role' => 'agent', 'commission_share' => 0])->assertCreated();

        $this->assertSame(2, $this->property->collaborators()->count());
    }

    public function test_the_landlord_cannot_change_a_share_at_modification(): void
    {
        $line = $this->lineByAdmin($this->agencyAgent($this->agency), 40);

        $this->actingAsApi($this->landlord);
        $this->putJson($this->url("/{$line->id}"), ['commission_share' => 0])
            ->assertForbidden()->assertJsonPath('code', 'property.commission_share_forbidden');
        $this->putJson($this->url("/{$line->id}"), ['commission_share' => 100])
            ->assertForbidden()->assertJsonPath('code', 'property.commission_share_forbidden');
        $this->putJson($this->url("/{$line->id}"), ['commission_share' => null])
            ->assertForbidden()->assertJsonPath('code', 'property.commission_share_forbidden');

        $this->assertEquals(40.0, (float) $line->fresh()->commission_share);
    }

    /** Renvoyer la part telle qu'elle est n'écrit rien : la modification du reste passe. */
    public function test_the_landlord_may_resend_the_current_share_unchanged(): void
    {
        $line = $this->lineByAdmin($this->agencyAgent($this->agency), 40);

        $this->actingAsApi($this->landlord);
        $this->putJson($this->url("/{$line->id}"), ['role' => 'agent', 'commission_share' => 40])->assertOk();

        $this->assertEquals(40.0, (float) $line->fresh()->commission_share);
    }

    public function test_staff_without_leases_create_cannot_write_a_share(): void
    {
        $agent = $this->agencyAgent($this->agency);

        $this->actingAsApi($this->adminWithout($this->agency, Capability::LeasesCreate));
        $this->postJson($this->url(), ['user_id' => $agent->id, 'role' => 'agent', 'commission_share' => 10])
            ->assertForbidden()->assertJsonPath('code', 'property.commission_share_forbidden');
    }

    /** Témoin : le personnel qui ouvre les baux écrit la part, à l'ajout et à la modification. */
    public function test_staff_holding_leases_create_writes_the_share(): void
    {
        $line = $this->lineByAdmin($this->agencyAgent($this->agency), 40);

        $this->putJson($this->url("/{$line->id}"), ['commission_share' => 25])->assertOk()
            ->assertJsonPath('data.commission_share', '25.00');

        $this->assertEquals(25.0, (float) $line->fresh()->commission_share);
    }

    public function test_the_landlord_no_longer_reads_the_shares(): void
    {
        $this->lineByAdmin($this->agencyAgent($this->agency), 40);

        $this->actingAsApi($this->landlord);
        $rows = $this->getJson($this->url())->assertOk()->json('data');
        $this->assertCount(1, $rows);
        $this->assertArrayNotHasKey('commission_share', $rows[0]);

        $rows = $this->getJson("/api/properties/{$this->property->id}?include=collaborators")->assertOk()
            ->json('data.collaborators');
        $this->assertCount(1, $rows);
        $this->assertArrayNotHasKey('commission_share', $rows[0]);
    }

    /** Témoin des deux lectures : le personnel qui fixe les parts les lit. */
    public function test_staff_holding_leases_create_reads_the_shares(): void
    {
        $this->lineByAdmin($this->agencyAgent($this->agency), 40);

        $this->actingAsApi($this->admin);
        $this->getJson($this->url())->assertOk()->assertJsonPath('data.0.commission_share', '40.00');
        $this->getJson("/api/properties/{$this->property->id}?include=collaborators")->assertOk()
            ->assertJsonPath('data.collaborators.0.commission_share', 40);
    }

    /** P241.03 — la copie du bailleur reprend les collaborateurs, sans leur part. */
    public function test_a_copy_by_the_landlord_does_not_carry_the_shares(): void
    {
        $agent = $this->agencyAgent($this->agency);
        $this->lineByAdmin($agent, 40);

        $this->actingAsApi($this->landlord);
        $cloneId = $this->postJson("/api/properties/{$this->property->id}/duplicate", ['copy_collaborators' => true])
            ->assertCreated()->json('data.id');

        $copied = PropertyCollaborator::query()->where('property_id', $cloneId)->get();
        $this->assertCount(1, $copied);
        $this->assertSame($agent->id, $copied[0]->user_id);
        $this->assertNull($copied[0]->commission_share);
    }

    /** Témoin : la copie du personnel garde la ventilation. */
    public function test_a_copy_by_staff_carries_the_shares(): void
    {
        $this->lineByAdmin($this->agencyAgent($this->agency), 40);

        $cloneId = $this->postJson("/api/properties/{$this->property->id}/duplicate", ['copy_collaborators' => true])
            ->assertCreated()->json('data.id');

        $this->assertEquals(40.0, (float) PropertyCollaborator::query()->where('property_id', $cloneId)->value('commission_share'));
    }
}
