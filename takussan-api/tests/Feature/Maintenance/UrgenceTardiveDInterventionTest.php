<?php

namespace Tests\Feature\Maintenance;

use App\Jobs\EscalateUrgentMaintenanceJob;
use App\Models\Agency;
use App\Models\Enums\MaintenancePriority;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\Property;
use App\Models\User;
use App\Notifications\UrgentMaintenanceCreatedNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;

/**
 * TCK-1991 (P169.03) — une intervention passée en urgente APRÈS sa création.
 *
 * Les 30 minutes de l'escalade couraient depuis `created_at` : une demande ancienne passée en
 * urgente était « escaladée » au passage suivant du job, avec un texte qui la dit non traitée
 * depuis plus de 30 minutes, sans l'alerte d'urgence qui la précède. Elles courent désormais
 * depuis `metadata.urgent_since`, posé par `store` et par `update`.
 */
class UrgenceTardiveDInterventionTest extends ApiTestCase
{
    use RefreshDatabase;

    private User $manager;

    private User $bailleur;

    private MaintenanceRequest $demande;

    protected function setUp(): void
    {
        parent::setUp();

        $agency = Agency::factory()->create();
        $this->manager = User::factory()->create();
        $agency->update(['primary_admin_id' => $this->manager->id]);

        $this->bailleur = User::factory()->withOwnerProfile($agency)->create();
        $property = Property::factory()->create(['agency_id' => $agency->id, 'user_id' => $this->bailleur->id]);

        $this->demande = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'priority' => MaintenancePriority::Normal->value,
            'status' => MaintenanceStatus::Open->value,
            'created_at' => now()->subDays(3),
            'metadata' => [],
        ]);
    }

    private function passerA(MaintenancePriority $priorite): void
    {
        $this->actingAsApi($this->bailleur)
            ->patchJson("/api/maintenance-requests/{$this->demande->id}", ['priority' => $priorite->value])
            ->assertOk();
    }

    private function escalades(): int
    {
        return Notification::sent($this->manager, UrgentMaintenanceCreatedNotification::class)
            ->filter(fn (UrgentMaintenanceCreatedNotification $n) => $n->isEscalation)
            ->count();
    }

    public function test_les_trente_minutes_courent_depuis_le_passage_en_urgent(): void
    {
        Notification::fake();

        $this->passerA(MaintenancePriority::Urgent);

        $this->travel(2)->minutes();
        (new EscalateUrgentMaintenanceJob)->handle();
        $this->assertSame(0, $this->escalades(), 'urgente depuis 2 minutes : aucune escalade');

        $this->travel(29)->minutes();
        (new EscalateUrgentMaintenanceJob)->handle();
        $this->assertSame(1, $this->escalades(), 'urgente depuis 31 minutes : une escalade');
    }

    public function test_le_passage_en_urgent_envoie_l_alerte_d_urgence(): void
    {
        Notification::fake();

        $this->passerA(MaintenancePriority::Urgent);

        Notification::assertSentTo(
            $this->manager,
            UrgentMaintenanceCreatedNotification::class,
            fn (UrgentMaintenanceCreatedNotification $n) => ! $n->isEscalation && $n->becameUrgent,
        );

        $mail = (new UrgentMaintenanceCreatedNotification($this->demande->refresh(), becameUrgent: true))
            ->toMail($this->manager);
        $this->assertContains(__('notifications.urgent_maintenance.intro_became_urgent'), $mail->introLines);
        $this->assertNotContains(__('notifications.urgent_maintenance.intro'), $mail->introLines);
    }

    public function test_une_modification_qui_garde_l_urgence_ne_renvoie_pas_d_alerte(): void
    {
        $this->passerA(MaintenancePriority::Urgent);
        $depuis = $this->demande->refresh()->metadata['urgent_since'] ?? null;
        $this->assertNotNull($depuis);

        Notification::fake();
        $this->travel(10)->minutes();
        $this->actingAsApi($this->bailleur)
            ->patchJson("/api/maintenance-requests/{$this->demande->id}", ['priority' => 'urgent', 'access_instructions' => 'Code 1234'])
            ->assertOk();

        Notification::assertNothingSent();
        $this->assertSame($depuis, $this->demande->refresh()->metadata['urgent_since']);
    }

    public function test_quitter_l_urgence_retire_les_marques_et_un_retour_reescalade(): void
    {
        Notification::fake();

        $this->passerA(MaintenancePriority::Urgent);
        $this->travel(31)->minutes();
        (new EscalateUrgentMaintenanceJob)->handle();
        $this->assertSame(1, $this->escalades());

        $this->passerA(MaintenancePriority::High);
        $metadata = $this->demande->refresh()->metadata ?? [];
        $this->assertArrayNotHasKey('urgent_since', $metadata);
        $this->assertArrayNotHasKey('escalated_at', $metadata);

        $this->passerA(MaintenancePriority::Urgent);
        $this->travel(31)->minutes();
        (new EscalateUrgentMaintenanceJob)->handle();
        $this->assertSame(2, $this->escalades(), 'remise en urgent puis restée non traitée : escaladée de nouveau');
    }

    public function test_une_demande_creee_urgente_porte_sa_date_d_urgence(): void
    {
        Notification::fake();

        $id = $this->actingAsApi($this->bailleur)->postJson('/api/maintenance-requests', [
            'property_id' => $this->demande->property_id,
            'title' => 'Fuite',
            'description' => 'De l’eau partout',
            'category' => 'plumbing',
            'priority' => 'urgent',
        ])->assertCreated()->json('data.id');

        $this->assertNotNull(MaintenanceRequest::query()->findOrFail($id)->metadata['urgent_since'] ?? null);
        Notification::assertSentTo(
            $this->manager,
            UrgentMaintenanceCreatedNotification::class,
            fn (UrgentMaintenanceCreatedNotification $n) => ! $n->becameUrgent,
        );
    }
}
