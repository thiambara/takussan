<?php

namespace Tests\Feature\Agency;

use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyUpgradeRequestStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\User;
use App\Services\Agency\AgencyMemberRemovalService;
use App\Services\Membership\TeamMemberSuspensionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * P233.04 (TCK-2290) — ADR-0031, amendement du 2026-10-25 (D2) : `AgencyUpgradeRequestPolicy::revoke`
 * juge le déposant (`submitted_by`) par `auteurEncoreMembre($user, submitted_by, agency_id)`, la
 * forme écrite de la règle d'auteur (B.2).
 *
 * Avant : l'administrateur suspendu ou retiré qui avait déposé la demande de passage en agence
 * professionnelle la révoquait encore (200, `revoked`), et la révocation est finale.
 */
class DeposantEncoreMembreTest extends TestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $principal;

    private User $deposant;

    private AgencyUpgradeRequest $demande;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->agency = Agency::factory()->create(['kind' => AgencyKind::Individual]);
        $this->principal = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $this->principal->id, 'agency_id' => $this->agency->id]);
        $this->agency->forceFill(['primary_admin_id' => $this->principal->id])->save();
        $this->deposant = User::factory()->create();
        AgencyAdminProfile::query()->create(['user_id' => $this->deposant->id, 'agency_id' => $this->agency->id]);
        $this->demande = AgencyUpgradeRequest::factory()->pending()->create([
            'agency_id' => $this->agency->id,
            'submitted_by' => $this->deposant->id,
        ]);
    }

    private function revoquerEn(User $user): TestResponse
    {
        Sanctum::actingAs($user->fresh());

        return $this->deleteJson("/api/agencies/{$this->agency->id}/upgrade-requests/{$this->demande->id}");
    }

    private function assertNeRevoquePlus(): void
    {
        $this->assertFalse($this->deposant->fresh()->can('revoke', $this->demande->fresh()));
        $this->revoquerEn($this->deposant)->assertForbidden();
        $this->assertSame(AgencyUpgradeRequestStatus::Pending, $this->demande->fresh()->status);
    }

    public function test_le_deposant_suspendu_ne_revoque_plus_la_demande(): void
    {
        app(TeamMemberSuspensionService::class)->suspend($this->agency, $this->deposant, $this->principal);

        $this->assertNeRevoquePlus();
    }

    public function test_le_deposant_retire_ne_revoque_plus_la_demande(): void
    {
        app(AgencyMemberRemovalService::class)->remove($this->agency, $this->deposant, $this->principal);

        $this->assertNeRevoquePlus();
    }

    /** Témoin : le déposant actif révoque sa demande. */
    public function test_temoin_le_deposant_actif_revoque_sa_demande(): void
    {
        $this->revoquerEn($this->deposant)->assertOk()
            ->assertJsonPath('data.status', AgencyUpgradeRequestStatus::Revoked->value);
    }

    /** Témoin : un autre administrateur actif révoque toujours, déposant parti ou non. */
    public function test_temoin_l_administrateur_actif_revoque_la_demande_du_deposant_retire(): void
    {
        app(AgencyMemberRemovalService::class)->remove($this->agency, $this->deposant, $this->principal);

        $this->revoquerEn($this->principal)->assertOk();
        $this->assertSame(AgencyUpgradeRequestStatus::Revoked, $this->demande->fresh()->status);
    }
}
