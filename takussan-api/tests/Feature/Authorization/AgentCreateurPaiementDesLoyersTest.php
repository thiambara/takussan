<?php

namespace Tests\Feature\Authorization;

use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Services\Agency\AgencyMemberRemovalService;
use App\Services\Membership\TeamMemberSuspensionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * TCK-2183 (P217.04, décision du porteur) — `LeasePaymentPolicy::update`, qui garde l'initiation, la
 * vérification et les fournisseurs de la passerelle pour `lease-payments`, acceptait
 * `landlordWrites` : l'agent qui a saisi le bien, désigné `landlord_id` du bail, ouvrait et vérifiait
 * le paiement des loyers une fois suspendu ou retiré. Elle passe à `bailleurEcrit` (TCK-1722) ; le
 * bailleur bloqué reste refusé.
 */
class AgentCreateurPaiementDesLoyersTest extends TestCase
{
    use BuildsBookingStakeholders, RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildStakeholders();
        $this->admin = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $this->admin->id, 'agency_id' => $this->agency->id]);
    }

    private function loyerDuBailDe(User $landlord): LeasePayment
    {
        $lease = Lease::factory()->create([
            'property_id' => $this->property->id,
            'agency_id' => $this->agency->id,
            'landlord_id' => $landlord->id,
            'tenant_id' => Customer::factory()->create(['user_id' => $this->client->id])->id,
            'status' => LeaseStatus::Active,
        ]);

        return LeasePayment::factory()->create(['lease_id' => $lease->id, 'payer_id' => $lease->tenant_id]);
    }

    private function assertPlusLaMain(User $agent, LeasePayment $loyer): void
    {
        $agent = $agent->fresh();
        $this->assertFalse($agent->can('update', $loyer->fresh()));

        Sanctum::actingAs($agent);
        $this->getJson("/api/lease-payments/{$loyer->id}/providers")->assertForbidden();
        $this->getJson("/api/lease-payments/{$loyer->id}/verify")->assertForbidden();
    }

    public function test_l_agent_createur_suspendu_n_a_plus_la_main_sur_le_loyer(): void
    {
        $loyer = $this->loyerDuBailDe($this->agent);
        app(TeamMemberSuspensionService::class)->suspend($this->agency, $this->agent, $this->admin);

        $this->assertPlusLaMain($this->agent, $loyer);
    }

    public function test_l_agent_createur_retire_n_a_plus_la_main_sur_le_loyer(): void
    {
        $loyer = $this->loyerDuBailDe($this->agent);
        app(AgencyMemberRemovalService::class)->remove($this->agency, $this->agent, $this->admin, leaveUnassigned: true);

        $this->assertPlusLaMain($this->agent, $loyer);
    }

    /** Témoins : l'agent actif (au titre du personnel), le bailleur du bien, le locataire. */
    public function test_le_personnel_le_bailleur_et_le_locataire_gardent_la_main(): void
    {
        $this->assertTrue($this->agent->can('update', $this->loyerDuBailDe($this->agent)));

        $loyer = $this->loyerDuBailDe($this->landlord);
        $this->assertTrue($this->landlord->fresh()->can('update', $loyer));
        $this->assertTrue($this->client->fresh()->can('update', $loyer));

        Sanctum::actingAs($this->landlord);
        $this->getJson("/api/lease-payments/{$loyer->id}/providers")->assertOk();
    }

    /** Le bailleur bloqué reste refusé (décision du porteur), comme avant. */
    public function test_le_bailleur_bloque_reste_refuse(): void
    {
        $loyer = $this->loyerDuBailDe($this->landlord);
        OwnerProfile::query()->where('user_id', $this->landlord->id)->update(['status' => 'blocked']);

        $this->assertFalse($this->landlord->fresh()->can('update', $loyer->fresh()));
    }
}
