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
 * TCK-2181 (P217.03, décision du porteur) — la branche des loyers de `PaymentController::history`
 * listait `leases.landlord_id = $user->id` sans rien juger d'autre : l'agent qui a saisi le bien,
 * que `LeaseService::create` recopie en `landlord_id`, gardait les loyers du bail une fois suspendu
 * ou retiré, quand `LeasePolicy::view` le lui refuse (TCK-1926). Elle passe par
 * `BailleurDuBien::restreindre`, comme `LeaseController::index` et la branche des acomptes (TCK-1932).
 */
class AgentCreateurHistoriqueDesLoyersTest extends TestCase
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

    /** @return list<int> */
    private function loyersListesPar(User $user): array
    {
        Sanctum::actingAs($user->fresh());

        return collect($this->getJson('/api/payments/history')->assertOk()->json('data'))
            ->where('source', 'lease')->pluck('id')->all();
    }

    public function test_l_agent_createur_suspendu_ne_liste_plus_les_loyers_du_bail(): void
    {
        $loyer = $this->loyerDuBailDe($this->agent);
        app(TeamMemberSuspensionService::class)->suspend($this->agency, $this->agent, $this->admin);

        $this->assertNotContains($loyer->id, $this->loyersListesPar($this->agent));
    }

    public function test_l_agent_createur_retire_ne_liste_plus_les_loyers_du_bail(): void
    {
        $loyer = $this->loyerDuBailDe($this->agent);
        app(AgencyMemberRemovalService::class)->remove($this->agency, $this->agent, $this->admin, leaveUnassigned: true);

        $this->assertNotContains($loyer->id, $this->loyersListesPar($this->agent));
    }

    /** Témoins : l'agent actif (au titre du personnel), le bailleur du bien bloqué et le locataire. */
    public function test_le_personnel_le_bailleur_et_le_locataire_gardent_les_loyers(): void
    {
        $duBienDeLAgent = $this->loyerDuBailDe($this->agent);
        $this->assertContains($duBienDeLAgent->id, $this->loyersListesPar($this->agent));

        $duBailleur = $this->loyerDuBailDe($this->landlord);
        OwnerProfile::query()->where('user_id', $this->landlord->id)->update(['status' => 'blocked']);
        $this->assertContains($duBailleur->id, $this->loyersListesPar($this->landlord));

        $this->assertContains($duBailleur->id, $this->loyersListesPar($this->client));
    }
}
