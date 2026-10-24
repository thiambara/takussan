<?php

namespace Tests\Feature\Authorization;

use App\Models\Enums\PropertyStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use App\Services\Agency\AgencyMemberRemovalService;
use App\Services\Membership\TeamMemberSuspensionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsBookingStakeholders;
use Tests\TestCase;

/**
 * TCK-2029 (P190.06, décision du porteur) — `PropertyModerationPolicy::resubmit` rendait vrai dès
 * que l'appelant était `properties.user_id`, avant tout jugement d'agence : l'agent qui a saisi le
 * bien, suspendu ou retiré, le resoumettait à la modération. `user_id` ne vaut plus titre que sur un
 * bien sans agence, ou pour un bailleur non bloqué de l'agence (`bailleurEcrit`).
 */
class AgentCreateurResoumissionTest extends TestCase
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

    private function bienRejeteDe(User $auteur): Property
    {
        $this->property->forceFill([
            'user_id' => $auteur->id,
            'status' => PropertyStatus::Rejected,
            'rejection_reason' => 'Photos insuffisantes pour publication sur la plateforme.',
            'rejected_at' => now()->subDay(),
        ])->save();

        return $this->property;
    }

    private function assertRefuse(User $user, Property $property): void
    {
        Sanctum::actingAs($user->fresh());
        $this->postJson("/api/properties/{$property->id}/resubmit")->assertForbidden();
        $this->assertSame(PropertyStatus::Rejected, $property->fresh()->status);
    }

    public function test_l_agent_createur_suspendu_ne_resoumet_pas(): void
    {
        $property = $this->bienRejeteDe($this->agent);
        app(TeamMemberSuspensionService::class)->suspend($this->agency, $this->agent, $this->admin);

        $this->assertRefuse($this->agent, $property);
    }

    public function test_l_agent_createur_retire_ne_resoumet_pas(): void
    {
        $property = $this->bienRejeteDe($this->agent);
        app(AgencyMemberRemovalService::class)->remove($this->agency, $this->agent, $this->admin, leaveUnassigned: true);

        $this->assertRefuse($this->agent, $property);
    }

    /** Le bailleur bloqué dans l'agence ne resoumet plus : c'est une écriture (`bailleurEcrit`). */
    public function test_le_bailleur_bloque_ne_resoumet_pas(): void
    {
        $property = $this->bienRejeteDe($this->landlord);
        OwnerProfile::query()->where('user_id', $this->landlord->id)->update(['status' => 'blocked']);

        $this->assertRefuse($this->landlord, $property);
    }

    /** Témoin : le bailleur actif du bien le resoumet. */
    public function test_le_bailleur_actif_resoumet(): void
    {
        $property = $this->bienRejeteDe($this->landlord);

        Sanctum::actingAs($this->landlord);
        $this->postJson("/api/properties/{$property->id}/resubmit")->assertOk();
        $this->assertSame(PropertyStatus::PendingReview, $property->fresh()->status);
    }

    /** Témoin : l'agent actif le resoumet, au titre du personnel. */
    public function test_l_agent_actif_resoumet(): void
    {
        $property = $this->bienRejeteDe($this->agent);

        Sanctum::actingAs($this->agent);
        $this->postJson("/api/properties/{$property->id}/resubmit")->assertOk();
        $this->assertSame(PropertyStatus::PendingReview, $property->fresh()->status);
    }

    /** Témoin : sur un bien sans agence, `user_id` reste le titre. */
    public function test_le_proprietaire_d_un_bien_sans_agence_resoumet(): void
    {
        $particulier = User::factory()->create();
        $property = Property::factory()->create([
            'user_id' => $particulier->id,
            'agency_id' => null,
            'status' => PropertyStatus::Rejected,
            'rejected_at' => now()->subDay(),
        ]);

        Sanctum::actingAs($particulier);
        $this->postJson("/api/properties/{$property->id}/resubmit")->assertOk();
    }
}
