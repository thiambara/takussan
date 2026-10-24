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
 * TCK-2018 (P190.06, décision du porteur) — `PropertyModerationPolicy::resubmit` rendait vrai dès
 * que `user.id === property.user_id`, avant tout jugement d'agence : l'agent qui a saisi un bien
 * d'agence, suspendu ou retiré, le resoumettait à la modération. `user_id` ne vaut plus titre que
 * sur un bien sans agence ou pour un bailleur non bloqué de l'agence ; le personnel actif garde sa
 * branche.
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

    private function rejeteDe(User $auteur, bool $sansAgence = false): Property
    {
        $this->property->forceFill([
            'user_id' => $auteur->id,
            'agency_id' => $sansAgence ? null : $this->agency->id,
            'status' => PropertyStatus::Rejected,
            'rejection_reason' => 'Photos insuffisantes.',
            'rejected_at' => now()->subDay(),
        ])->save();

        return $this->property;
    }

    private function assertRefuse(User $agent, Property $property): void
    {
        Sanctum::actingAs($agent->fresh());
        $this->postJson("/api/properties/{$property->id}/resubmit")->assertForbidden();
        $property->refresh();
        $this->assertSame(PropertyStatus::Rejected, $property->status);
        $this->assertSame('Photos insuffisantes.', $property->rejection_reason);
    }

    private function assertResoumis(User $user, Property $property): void
    {
        Sanctum::actingAs($user->fresh());
        $this->postJson("/api/properties/{$property->id}/resubmit")->assertOk();
        $this->assertSame(PropertyStatus::PendingReview, $property->fresh()->status);
    }

    public function test_l_agent_createur_suspendu_ne_resoumet_pas(): void
    {
        $property = $this->rejeteDe($this->agent);
        app(TeamMemberSuspensionService::class)->suspend($this->agency, $this->agent, $this->admin);

        $this->assertRefuse($this->agent, $property);
    }

    public function test_l_agent_createur_retire_ne_resoumet_pas(): void
    {
        $property = $this->rejeteDe($this->agent);
        app(AgencyMemberRemovalService::class)->remove($this->agency, $this->agent, $this->admin, leaveUnassigned: true);

        $this->assertRefuse($this->agent, $property);
    }

    /** Le bailleur bloqué dans l'agence ne resoumet plus : c'est une écriture (`bailleurEcrit`). */
    public function test_le_bailleur_bloque_ne_resoumet_pas(): void
    {
        $property = $this->rejeteDe($this->landlord);
        OwnerProfile::query()->where('user_id', $this->landlord->id)->update(['status' => 'blocked']);

        $this->assertRefuse($this->landlord, $property);
    }

    /** Témoins : le bailleur actif, le particulier sans agence et l'agent créateur actif resoumettent. */
    public function test_le_bailleur_actif_resoumet(): void
    {
        $this->assertResoumis($this->landlord, $this->rejeteDe($this->landlord));
    }

    public function test_le_particulier_sans_agence_resoumet(): void
    {
        $particulier = User::factory()->create();

        $this->assertResoumis($particulier, $this->rejeteDe($particulier, sansAgence: true));
    }

    public function test_l_agent_createur_actif_resoumet_au_titre_du_personnel(): void
    {
        $this->assertResoumis($this->agent, $this->rejeteDe($this->agent));
    }
}
