<?php

namespace Tests\Feature\Maintenance;

use App\Models\Enums\MaintenancePriority;
use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Services\Maintenance\OwnerApprovalThreshold;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * P245.03 (TCK-2362) — `PATCH /api/maintenance-requests/{id}` recomposait `metadata` depuis
 * l'intervention liée à la route (accord du bailleur sur le coût réel, passage dans ou hors de
 * l'urgence, devis archivé à la réassignation), puis écrivait la colonne entière : l'escalade
 * posée entre-temps par `EscalateUrgentMaintenanceJob`, qui relit sous verrou depuis TCK-2225,
 * était effacée, et l'escalade repartait au passage suivant.
 *
 * L'escalade est jouée une fois, dans l'écouteur `retrieved` du modèle : à la liaison de la route.
 */
class ModificationFaceAEscaladeConcurrenteTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    private function escaladeeALaLiaison(MaintenanceRequest $mr, array $metadata): void
    {
        $joue = false;
        MaintenanceRequest::retrieved(function () use (&$joue, $mr, $metadata): void {
            if ($joue) {
                return;
            }
            $joue = true;
            DB::table('maintenance_requests')->where('id', $mr->id)->update(['metadata' => json_encode($metadata)]);
        });
    }

    private function urgente(MaintenanceStatus $status, array $attributes = []): array
    {
        return $this->maintenanceScenario($status, array_merge([
            'priority' => MaintenancePriority::Urgent->value,
            'metadata' => [MaintenanceRequest::URGENT_SINCE => now()->subHour()->toIso8601String()],
        ], $attributes));
    }

    public function test_le_cout_reel_du_bailleur_garde_l_escalade_posee_entre_temps(): void
    {
        Notification::fake();
        ['mr' => $mr, 'landlord' => $landlord] = $this->urgente(MaintenanceStatus::Open);
        $escalade = $mr->metadata + [MaintenanceRequest::ESCALATED_AT => now()->toIso8601String()];
        $this->escaladeeALaLiaison($mr, $escalade);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['actual_cost' => 1000])->assertOk();

        $metadata = $mr->fresh()->metadata;
        $this->assertSame($escalade[MaintenanceRequest::ESCALATED_AT], $metadata[MaintenanceRequest::ESCALATED_AT] ?? null);
        $this->assertArrayHasKey(OwnerApprovalThreshold::OWNER_AGREED_COST, $metadata);
        $this->assertSame($escalade[MaintenanceRequest::URGENT_SINCE], $metadata[MaintenanceRequest::URGENT_SINCE]);
    }

    public function test_la_reassignation_archive_le_devis_sans_effacer_l_escalade(): void
    {
        Notification::fake();
        ['mr' => $mr, 'agency' => $agency, 'provider' => $ancien, 'landlord' => $landlord] = $this->urgente(MaintenanceStatus::QuoteSubmitted, [
            'quote_amount' => 30000,
            'quote_submitted_at' => now()->subHour(),
        ]);
        $escalade = $mr->metadata + [MaintenanceRequest::ESCALATED_AT => now()->toIso8601String()];
        $this->escaladeeALaLiaison($mr, $escalade);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $this->providerFor($agency)->id])->assertOk();

        $metadata = $mr->fresh()->metadata;
        $this->assertSame($escalade[MaintenanceRequest::ESCALATED_AT], $metadata[MaintenanceRequest::ESCALATED_AT] ?? null);
        $this->assertSame($ancien->id, $metadata['previous_quotes'][0]['provider_id']);
    }

    public function test_le_passage_en_urgence_s_ecrit_sur_la_metadata_relue(): void
    {
        Notification::fake();
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::Open, [
            'priority' => MaintenancePriority::Normal->value,
            'metadata' => ['autre' => 'x'],
        ]);
        $this->escaladeeALaLiaison($mr, ['autre' => 'écrit entre-temps']);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['priority' => MaintenancePriority::Urgent->value])->assertOk();

        $metadata = $mr->fresh()->metadata;
        $this->assertSame('écrit entre-temps', $metadata['autre']);
        $this->assertArrayHasKey(MaintenanceRequest::URGENT_SINCE, $metadata);
    }
}
