<?php

namespace Tests\Feature\Maintenance;

use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Services\Model\MaintenanceRequestService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-592 (verif-592, M2) — une intervention close ou annulée ne se modifie plus, ni ne s'assigne.
 *
 * Le kit d'accès et les photos refusaient l'état terminal ; le `PATCH` générique, non : le
 * prestataire réécrivait ses notes après la confirmation du locataire (v01), le donneur d'ordre le
 * coût d'une intervention close (v02), et assigner une demande annulée ouvrait la fiche et le fil
 * au nouveau prestataire (v03).
 */
class MaintenanceTerminalRequestTest extends TestCase
{
    use MaintenanceActors, RefreshDatabase;

    /**
     * Passe 2 (N3, sonde p04) — `POST /api/media`, le chemin générique, déléguait à `update` : le
     * prestataire comme le bailleur ajoutaient des photos à une intervention close.
     */
    public function test_no_media_is_attached_to_a_closed_or_cancelled_request(): void
    {
        Storage::fake(config('media-library.disk_name'));
        Storage::fake('private');

        foreach ([MaintenanceStatus::Closed, MaintenanceStatus::Cancelled] as $status) {
            ['mr' => $mr, 'provider' => $provider, 'landlord' => $landlord] = $this->maintenanceScenario($status, ['accepted_at' => now()]);

            foreach ([$provider, $landlord] as $actor) {
                Sanctum::actingAs($actor);
                foreach (['photos', 'documents'] as $collection) {
                    $this->attach($mr, $collection)->assertForbidden();
                }
            }
            $this->assertCount(0, $mr->refresh()->getMedia('photos'));
            $this->assertCount(0, $mr->getMedia('documents'));
        }

        // Témoin : en cours, le bailleur joint toujours sa photo.
        ['mr' => $open, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::InProgress, ['accepted_at' => now()]);
        Sanctum::actingAs($landlord);
        $this->attach($open, 'photos')->assertCreated();
    }

    /** Passe 2 (N3) — la suppression d'une pièce d'une intervention close est refusée de même. */
    public function test_no_media_is_deleted_from_a_closed_request(): void
    {
        Storage::fake(config('media-library.disk_name'));
        Storage::fake('private');
        ['mr' => $mr, 'provider' => $provider, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::Closed, ['accepted_at' => now()]);
        $media = $mr->addMedia(UploadedFile::fake()->image('preuve.jpg'))->toMediaCollection('photos');

        foreach ([$provider, $landlord] as $actor) {
            Sanctum::actingAs($actor);
            $this->deleteJson("/api/media/{$media->id}")->assertForbidden();
        }
        $this->assertCount(1, $mr->refresh()->getMedia('photos'));
    }

    private function attach(MaintenanceRequest $mr, string $collection): TestResponse
    {
        return $this->post('/api/media', [
            'file' => $collection === 'documents'
                ? UploadedFile::fake()->create('devis.pdf', 20, 'application/pdf')
                : UploadedFile::fake()->image('p.jpg'),
            'collection' => $collection,
            'model_type' => MaintenanceRequest::class,
            'model_id' => $mr->id,
        ], ['Accept' => 'application/json']);
    }

    /** Sonde v01.
    public function test_the_provider_cannot_rewrite_a_closed_request(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::Closed, ['accepted_at' => now(), 'resolution_notes' => 'orig']);

        Sanctum::actingAs($provider);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", [
            'resolution_notes' => 'réécrit après clôture',
            'scheduled_at' => now()->addDay()->toIso8601String(),
        ])->assertUnprocessable()->assertJsonPath('code', 'maintenance.terminal_request');

        $mr->refresh();
        $this->assertSame('orig', $mr->resolution_notes);
        $this->assertNull($mr->scheduled_at);
    }

    /** Sonde v02. */
    public function test_the_principal_cannot_rewrite_the_cost_of_a_closed_request(): void
    {
        ['mr' => $mr, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::Closed, ['actual_cost' => 40000]);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['actual_cost' => 900000])->assertUnprocessable();

        $this->assertSame('40000.00', (string) $mr->refresh()->actual_cost);
    }

    /** Sonde v03, par le `PATCH` et par le service (seul point d'assignation). */
    public function test_a_cancelled_request_is_not_assigned(): void
    {
        ['mr' => $mr, 'landlord' => $landlord, 'agency' => $agency] = $this->maintenanceScenario(MaintenanceStatus::Cancelled, ['assigned_to' => null]);
        $other = $this->providerFor($agency);

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['assigned_to' => $other->id])->assertUnprocessable();
        $this->assertNull($mr->refresh()->assigned_to);

        try {
            app(MaintenanceRequestService::class)->assign($mr, $other, $landlord);
            $this->fail('assign() a accepté une demande annulée.');
        } catch (HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
        }
        $this->assertNull($mr->refresh()->assigned_to);
    }

    /** `completed` attend la confirmation : les notes au prestataire, le coût au donneur d'ordre. */
    public function test_a_completed_request_keeps_notes_for_the_provider_and_cost_for_the_principal(): void
    {
        ['mr' => $mr, 'provider' => $provider, 'landlord' => $landlord] = $this->maintenanceScenario(MaintenanceStatus::Completed, ['accepted_at' => now(), 'completed_at' => now()]);

        Sanctum::actingAs($provider);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['resolution_notes' => 'joint remplacé'])->assertOk();
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['actual_cost' => 15000])->assertForbidden();

        Sanctum::actingAs($landlord);
        $this->patchJson("/api/maintenance-requests/{$mr->id}", ['actual_cost' => 15000])->assertOk();

        $mr->refresh();
        $this->assertSame('joint remplacé', $mr->resolution_notes);
        $this->assertSame('15000.00', (string) $mr->actual_cost);
    }
}
