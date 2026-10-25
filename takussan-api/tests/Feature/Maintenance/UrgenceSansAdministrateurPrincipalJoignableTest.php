<?php

namespace Tests\Feature\Maintenance;

use App\Jobs\EscalateUrgentMaintenanceJob;
use App\Models\Agency;
use App\Models\Enums\MaintenancePriority;
use App\Models\Enums\MaintenanceStatus;
use App\Models\Enums\UserStatus;
use App\Models\MaintenanceRequest;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Property;
use App\Models\User;
use App\Notifications\UrgentMaintenanceCreatedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;

/**
 * TCK-2185 (P225.01, décision déléguée) — l'alerte d'urgence et l'escalade ne visaient que
 * l'administrateur principal : effacé, l'escalade ne partait à personne et se marquait faite ;
 * bloqué, elle partait au compte fermé. Elles partent à l'administrateur principal s'il est
 * joignable, et sinon aux administrateurs que rend `AdminsDeLAgence::destinataires`.
 */
class UrgenceSansAdministrateurPrincipalJoignableTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $principal;

    private User $coAdmin;

    private User $bailleur;

    private Property $property;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->principal = User::factory()->create();
        $this->coAdmin = User::factory()->create();
        foreach ([$this->principal, $this->coAdmin] as $admin) {
            AgencyAdminProfile::query()->create(['user_id' => $admin->id, 'agency_id' => $this->agency->id]);
        }
        $this->agency->update(['primary_admin_id' => $this->principal->id]);

        $this->bailleur = User::factory()->withOwnerProfile($this->agency)->create();
        $this->property = Property::factory()->create(['agency_id' => $this->agency->id, 'user_id' => $this->bailleur->id]);
    }

    private function urgenteDepuisDeuxHeures(): MaintenanceRequest
    {
        return MaintenanceRequest::factory()->create([
            'property_id' => $this->property->id,
            'priority' => MaintenancePriority::Urgent->value,
            'status' => MaintenanceStatus::Open->value,
            'created_at' => now()->subHours(2),
            'metadata' => [MaintenanceRequest::URGENT_SINCE => now()->subHours(2)->toIso8601String()],
        ]);
    }

    private function efface(User $user): void
    {
        $user->forceFill(['status' => UserStatus::Deleted])->save();
        $user->delete();
    }

    private function bloque(User $user): void
    {
        $user->forceFill(['status' => UserStatus::Blocked])->save();
    }

    private function escaladesA(User $user): int
    {
        return Notification::sent($user, UrgentMaintenanceCreatedNotification::class)
            ->filter(fn (UrgentMaintenanceCreatedNotification $n) => $n->isEscalation)
            ->count();
    }

    public function test_principal_efface_l_escalade_part_au_co_administrateur(): void
    {
        Notification::fake();
        $demande = $this->urgenteDepuisDeuxHeures();
        $this->efface($this->principal);

        (new EscalateUrgentMaintenanceJob)->handle();

        $this->assertSame(1, $this->escaladesA($this->coAdmin));
        $this->assertNotNull($demande->refresh()->metadata[MaintenanceRequest::ESCALATED_AT] ?? null);
    }

    public function test_principal_bloque_l_escalade_part_au_co_administrateur_et_pas_a_lui(): void
    {
        Notification::fake();
        $this->urgenteDepuisDeuxHeures();
        $this->bloque($this->principal);

        (new EscalateUrgentMaintenanceJob)->handle();

        $this->assertSame(1, $this->escaladesA($this->coAdmin));
        $this->assertSame(0, $this->escaladesA($this->principal));
    }

    public function test_principal_bloque_l_alerte_d_urgence_part_au_co_administrateur(): void
    {
        Notification::fake();
        $this->bloque($this->principal);

        $this->actingAsApi($this->bailleur)->postJson('/api/maintenance-requests', [
            'property_id' => $this->property->id,
            'title' => 'Fuite',
            'description' => 'De l’eau partout',
            'category' => 'plumbing',
            'priority' => 'urgent',
        ])->assertCreated();

        Notification::assertSentTo($this->coAdmin, UrgentMaintenanceCreatedNotification::class);
        Notification::assertNotSentTo($this->principal, UrgentMaintenanceCreatedNotification::class);
    }

    /** Témoin : un administrateur principal joignable reste seul destinataire (TCK-1991). */
    public function test_principal_joignable_reste_seul_destinataire(): void
    {
        Notification::fake();
        $this->urgenteDepuisDeuxHeures();

        (new EscalateUrgentMaintenanceJob)->handle();

        $this->assertSame(1, $this->escaladesA($this->principal));
        $this->assertSame(0, $this->escaladesA($this->coAdmin));
    }

    public function test_sans_aucun_destinataire_l_escalade_est_marquee_et_dite_au_journal(): void
    {
        Notification::fake();
        Log::spy();
        $demande = $this->urgenteDepuisDeuxHeures();
        $this->bloque($this->principal);
        $this->bloque($this->coAdmin);

        (new EscalateUrgentMaintenanceJob)->handle();

        Notification::assertNothingSent();
        $this->assertNotNull($demande->refresh()->metadata[MaintenanceRequest::ESCALATED_AT] ?? null);
        Log::shouldHaveReceived('warning')->withArgs(fn (string $message, array $context = []): bool => ($context['maintenance_request_id'] ?? null) === $demande->id
            && ($context['agency_id'] ?? null) === $this->agency->id)->once();
    }
}
