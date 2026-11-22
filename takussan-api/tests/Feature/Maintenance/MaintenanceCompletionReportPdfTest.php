<?php

namespace Tests\Feature\Maintenance;

use App\Models\Enums\MaintenanceStatus;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Spatie\LaravelPdf\Facades\Pdf;
use Tests\Support\MaintenanceActors;
use Tests\TestCase;

/**
 * TCK-2897 (ADR-0099, amendement du 2026-11-15) — `GET maintenance-requests/{id}/completion-report/pdf` :
 * le rapport de fin d'intervention, GÉNÉRÉ depuis la demande (bien, dates, travaux, notes de résolution,
 * photos avant / après). Lecteurs : le prestataire assigné et le personnel de l'agence du bien. Un
 * prestataire de l'agence non assigné : 403 ; hors de l'agence : 404. Travail non rendu : 404.
 */
class MaintenanceCompletionReportPdfTest extends TestCase
{
    use MaintenanceActors;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake(config('media-library.disk_name'));
    }

    private function closed(array $attributes = []): array
    {
        return $this->maintenanceScenario(MaintenanceStatus::Closed, array_merge([
            'title' => 'Fuite sous l’évier',
            'description' => 'Le siphon goutte.',
            'resolution_notes' => 'Joint du siphon remplacé, essai d’étanchéité concluant.',
            'actual_cost' => 27_500,
            'completed_at' => '2026-11-10 15:00:00',
        ], $attributes));
    }

    public function test_le_prestataire_assigne_recoit_le_rapport_avec_les_notes_et_les_photos(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->closed();
        $mr->addMedia(UploadedFile::fake()->image('avant.jpg', 40, 30))->toMediaCollection('before_photos');
        $mr->addMedia(UploadedFile::fake()->image('apres.jpg', 40, 30))->toMediaCollection('completion_photos');

        $pdf = Pdf::fake();
        Sanctum::actingAs($provider);
        $reponse = $this->get("/api/maintenance-requests/{$mr->id}/completion-report/pdf");

        $reponse->assertOk();
        $this->assertStringStartsWith('application/pdf', (string) $reponse->headers->get('Content-Type'));
        $html = (string) $pdf->html;
        $this->assertStringContainsString('Joint du siphon remplacé', $html);
        $this->assertStringContainsString(e($mr->property->title), $html);
        $this->assertSame(2, substr_count($html, 'src="data:image/'), 'une photo avant, une photo après, en URI data:');
        $this->assertMatchesRegularExpression('/27\D{1,3}500/u', $html);
        $this->assertDoesNotMatchRegularExpression('/27\D{1,3}500[,.]00/u', $html);
    }

    /** Le gabarit se rend pour de vrai (pilote local, sans double), photos `data:` comprises. */
    public function test_le_rapport_se_rend_sous_le_vrai_pilote(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->closed(['started_at' => '2026-11-10 09:00:00']);
        $mr->addMedia(UploadedFile::fake()->image('avant.jpg', 40, 30))->toMediaCollection('before_photos');
        $mr->addMedia(UploadedFile::fake()->image('apres.jpg', 40, 30))->toMediaCollection('completion_photos');

        Sanctum::actingAs($provider);
        $reponse = $this->get("/api/maintenance-requests/{$mr->id}/completion-report/pdf");

        $reponse->assertOk();
        $this->assertStringStartsWith('%PDF', (string) $reponse->getContent());
    }

    public function test_le_personnel_de_l_agence_du_bien_le_lit(): void
    {
        ['mr' => $mr, 'agency' => $agency] = $this->closed();

        Pdf::fake();
        Sanctum::actingAs($this->agentOf($agency));
        $this->get("/api/maintenance-requests/{$mr->id}/completion-report/pdf")->assertOk();
    }

    public function test_ac5_un_prestataire_non_assigne_403_et_hors_agence_404(): void
    {
        ['mr' => $mr, 'agency' => $agency, 'tenant' => $tenant] = $this->closed();
        ['agency' => $ailleurs] = $this->maintenanceScenario();

        Pdf::fake();
        Sanctum::actingAs($this->providerFor($agency));
        $this->get("/api/maintenance-requests/{$mr->id}/completion-report/pdf")->assertForbidden();

        // Le demandeur lit la demande, pas le rapport.
        Sanctum::actingAs($tenant);
        $this->get("/api/maintenance-requests/{$mr->id}/completion-report/pdf")->assertForbidden();

        Sanctum::actingAs($this->agentOf($ailleurs));
        $this->get("/api/maintenance-requests/{$mr->id}/completion-report/pdf")->assertNotFound();

        Sanctum::actingAs($this->providerFor($ailleurs));
        $this->get("/api/maintenance-requests/{$mr->id}/completion-report/pdf")->assertNotFound();

        Sanctum::actingAs(User::factory()->create());
        $this->get("/api/maintenance-requests/{$mr->id}/completion-report/pdf")->assertNotFound();
    }

    public function test_un_prestataire_dont_la_collaboration_est_finie_ne_le_lit_plus(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->closed();
        $provider->serviceProviderProfile->agencyCollaborations()->update(['status' => 'ended']);

        Pdf::fake();
        Sanctum::actingAs($provider->fresh());
        $this->get("/api/maintenance-requests/{$mr->id}/completion-report/pdf")->assertNotFound();
    }

    public function test_un_travail_non_rendu_n_a_pas_de_rapport(): void
    {
        ['mr' => $mr, 'provider' => $provider] = $this->maintenanceScenario(MaintenanceStatus::InProgress);

        Pdf::fake();
        Sanctum::actingAs($provider);
        $this->get("/api/maintenance-requests/{$mr->id}/completion-report/pdf")->assertNotFound();

        $mr->forceFill(['status' => MaintenanceStatus::Completed, 'completed_at' => now()])->save();
        $this->get("/api/maintenance-requests/{$mr->id}/completion-report/pdf")->assertOk();
    }
}
