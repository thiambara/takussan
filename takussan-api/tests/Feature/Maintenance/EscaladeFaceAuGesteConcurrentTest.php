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
use Closure;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * P229.03 (TCK-2225) — `EscalateUrgentMaintenanceJob` lit ses demandes en lot, puis envoyait
 * l'avis d'escalade et réécrivait `metadata` depuis le modèle chargé : une demande annulée ou
 * remise en priorité normale pendant son passage était escaladée quand même, et la `metadata`
 * écrite entre-temps était écrasée.
 *
 * Le geste concurrent est joué une fois, dans l'écouteur `retrieved` du modèle.
 */
class EscaladeFaceAuGesteConcurrentTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;

    private MaintenanceRequest $demande;

    protected function setUp(): void
    {
        parent::setUp();

        $agency = Agency::factory()->create();
        $this->manager = User::factory()->create();
        $agency->update(['primary_admin_id' => $this->manager->id]);
        $property = Property::factory()->create(['agency_id' => $agency->id]);

        $this->demande = MaintenanceRequest::factory()->create([
            'property_id' => $property->id,
            'priority' => MaintenancePriority::Urgent->value,
            'status' => MaintenanceStatus::Open->value,
            'created_at' => now()->subMinutes(35),
            'metadata' => [
                MaintenanceRequest::URGENT_SINCE => now()->subMinutes(35)->toIso8601String(),
                'autre' => 'x',
            ],
        ]);
    }

    private function pendantLaLecture(Closure $geste): void
    {
        $joue = false;
        MaintenanceRequest::retrieved(function () use (&$joue, $geste): void {
            if ($joue) {
                return;
            }
            $joue = true;
            $geste();
        });
    }

    private function escalades(): int
    {
        return Notification::sent($this->manager, UrgentMaintenanceCreatedNotification::class)
            ->filter(fn (UrgentMaintenanceCreatedNotification $n) => $n->isEscalation)
            ->count();
    }

    public function test_une_demande_annulee_et_remise_en_normal_pendant_le_passage_n_est_pas_escaladee(): void
    {
        Notification::fake();

        $this->pendantLaLecture(function (): void {
            DB::table('maintenance_requests')->where('id', $this->demande->id)->update([
                'priority' => MaintenancePriority::Normal->value,
                'status' => MaintenanceStatus::Cancelled->value,
                'metadata' => json_encode(['autre' => 'y']),
            ]);
        });

        (new EscalateUrgentMaintenanceJob)->handle();

        $this->assertSame(0, $this->escalades());
        $fraiche = $this->demande->fresh();
        $this->assertSame(MaintenancePriority::Normal, $fraiche->priority);
        $this->assertSame(['autre' => 'y'], $fraiche->metadata);
    }

    public function test_l_escalade_s_ecrit_sur_la_metadata_relue(): void
    {
        Notification::fake();

        $this->pendantLaLecture(function (): void {
            $metadata = $this->demande->metadata;
            $metadata['autre'] = 'y';
            DB::table('maintenance_requests')->where('id', $this->demande->id)->update([
                'metadata' => json_encode($metadata),
            ]);
        });

        (new EscalateUrgentMaintenanceJob)->handle();

        $this->assertSame(1, $this->escalades());
        $metadata = $this->demande->fresh()->metadata;
        $this->assertSame('y', $metadata['autre']);
        $this->assertArrayHasKey(MaintenanceRequest::ESCALATED_AT, $metadata);
        $this->assertArrayHasKey(MaintenanceRequest::URGENT_SINCE, $metadata);
    }

    public function test_sans_geste_concurrent_l_escalade_part_une_fois(): void
    {
        Notification::fake();

        (new EscalateUrgentMaintenanceJob)->handle();
        (new EscalateUrgentMaintenanceJob)->handle();

        $this->assertSame(1, $this->escalades());
        $this->assertArrayHasKey(MaintenanceRequest::ESCALATED_AT, $this->demande->fresh()->metadata);
    }
}
