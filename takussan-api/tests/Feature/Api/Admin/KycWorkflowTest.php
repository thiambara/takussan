<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Agency;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\KycDossierStatus;
use App\Models\KycDossier;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

class KycWorkflowTest extends TestCase
{
    use RefreshDatabase;

    public function test_agency_cannot_be_verified_without_verified_kyc(): void
    {
        $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create([
            'status' => AgencyStatus::Inactive,
            'is_verified' => false,
            'verified_at' => null,
        ]);

        $this->postJson("/api/admin/agencies/{$agency->id}/verify")
            ->assertStatus(422)
            ->assertJsonPath('message', 'Agency KYC must be verified before agency verification.');
    }

    public function test_super_admin_cannot_verify_kyc_when_required_documents_are_missing(): void
    {
        $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create();
        $dossier = KycDossier::query()->create([
            'subject_type' => Agency::class,
            'subject_id' => $agency->id,
            'status' => KycDossierStatus::Submitted,
            'submitted_at' => now(),
        ]);

        $this->postJson("/api/admin/kyc/{$dossier->id}/verify")
            ->assertStatus(422)
            ->assertJsonPath('message', 'Missing required KYC documents: rccm, ninea, director_id');
    }

    public function test_agency_admin_can_submit_complete_dossier_and_submission_is_audited(): void
    {
        $agency = Agency::factory()->create();
        $actor = $this->actingAsRole('agency_admin', ['agency' => $agency]);

        foreach (['rccm', 'ninea', 'director_id'] as $type) {
            $this->postJson("/api/agencies/{$agency->id}/kyc/documents", [
                'document_type' => $type,
                'document' => UploadedFile::fake()->create("{$type}.pdf", 10, 'application/pdf'),
            ])->assertCreated();
        }

        $response = $this->postJson("/api/agencies/{$agency->id}/kyc/submit")
            ->assertOk()
            ->assertJsonPath('data.status', 'submitted');

        $this->assertTrue(Activity::query()
            ->where('event', 'kyc_submitted')
            ->where('causer_id', $actor->id)
            ->where('subject_id', $response->json('data.id'))
            ->exists());
    }

    public function test_verify_and_reject_transitions_are_audited(): void
    {
        $superAdmin = $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create(['status' => AgencyStatus::Inactive, 'is_verified' => false]);
        $verifiedDossier = $this->submittedDossierWithDocuments($agency);

        $this->postJson("/api/admin/kyc/{$verifiedDossier->id}/verify")
            ->assertOk()
            ->assertJsonPath('data.status', 'verified');

        $this->assertDatabaseHas('agencies', [
            'id' => $agency->id,
            'status' => AgencyStatus::Active->value,
            'is_verified' => true,
        ]);
        $this->assertTrue(Activity::query()
            ->where('event', 'kyc_verified')
            ->where('causer_id', $superAdmin->id)
            ->where('subject_id', $verifiedDossier->id)
            ->exists());

        $rejectedDossier = $this->submittedDossierWithDocuments(Agency::factory()->create());
        $this->postJson("/api/admin/kyc/{$rejectedDossier->id}/reject", ['reason' => 'Document NINEA illisible'])
            ->assertOk()
            ->assertJsonPath('data.status', 'rejected')
            ->assertJsonPath('data.rejection_reason', 'Document NINEA illisible');

        $this->assertTrue(Activity::query()
            ->where('event', 'kyc_rejected')
            ->where('subject_id', $rejectedDossier->id)
            ->exists());
    }

    public function test_signed_document_url_expires_within_15_minutes_and_is_scoped(): void
    {
        $agency = Agency::factory()->create();
        $owner = $this->actingAsRole('agency_admin', ['agency' => $agency]);

        $response = $this->postJson("/api/agencies/{$agency->id}/kyc/documents", [
            'document_type' => 'rccm',
            'document' => UploadedFile::fake()->create('rccm.pdf', 10, 'application/pdf'),
        ])->assertCreated();

        $document = $response->json('data.documents.0');
        $this->assertNotEmpty($document['signed_url']);
        $this->assertLessThanOrEqual(
            15 * 60,
            now()->diffInSeconds(Carbon::parse($document['expires_at']), false),
        );

        $parts = parse_url($document['signed_url']);
        $uri = ($parts['path'] ?? '').(isset($parts['query']) ? '?'.$parts['query'] : '');

        $this->actingAs($owner);
        $this->get($uri)->assertOk();

        $otherAgency = Agency::factory()->create();
        $this->actingAsRole('agency_admin', ['agency' => $otherAgency]);
        $this->get($uri)->assertForbidden();
    }

    public function test_agency_admin_sees_rejection_reason(): void
    {
        $agency = Agency::factory()->create();
        $dossier = $this->submittedDossierWithDocuments($agency);

        $this->actingAsRole('super_admin');
        $this->postJson("/api/admin/kyc/{$dossier->id}/reject", ['reason' => 'RCCM expiré'])->assertOk();

        $this->actingAsRole('agency_admin', ['agency' => $agency]);
        $this->getJson("/api/agencies/{$agency->id}/kyc")
            ->assertOk()
            ->assertJsonPath('data.status', 'rejected')
            ->assertJsonPath('data.rejection_reason', 'RCCM expiré');
    }

    public function test_kyc_queue_filters_agency_submissions_and_sorts_oldest_first(): void
    {
        $this->actingAsRole('super_admin');
        $newer = $this->submittedDossierWithDocuments(Agency::factory()->create(), now()->subHour());
        $older = $this->submittedDossierWithDocuments(Agency::factory()->create(), now()->subHours(3));
        KycDossier::query()->create([
            'subject_type' => Agency::class,
            'subject_id' => Agency::factory()->create()->id,
            'status' => KycDossierStatus::Pending,
        ]);

        $this->getJson('/api/admin/kyc?filter[status]=submitted&filter[subject_type]=Agency&per_page=10')
            ->assertOk()
            ->assertJsonPath('data.0.id', $older->id)
            ->assertJsonPath('data.1.id', $newer->id)
            ->assertJsonPath('meta.total', 2);
    }

    /**
     * TCK-362 — la file doit porter le NOM de l'agence, pas seulement sa clé.
     *
     * L'écran `/super-admin/kyc` affichait « Agence #12 » faute d'autre chose à afficher :
     * `KycController::index` chargeait `subject` depuis toujours, et `KycDossierResource` ne
     * l'émettait pas. Le test porte donc sur la SORTIE — un nom lisible dans la charge utile —
     * et non sur le `->with()` du contrôleur, qui était déjà juste et ne prouvait rien.
     */
    public function test_kyc_queue_exposes_the_agency_name_without_a_query_per_row(): void
    {
        $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create(['name' => 'Dakar Immo Sarl']);
        $dossier = $this->submittedDossierWithDocuments($agency);

        /*
         * On ne compte PAS toutes les requêtes : `KycDossierResource` appelle `getMedia()` par
         * dossier, ce qui est un `N+1` de médias — réel, mais hors du périmètre de ce ticket, et
         * un compteur global le confondrait avec celui qu'on ferme ici. On ne compte donc que les
         * requêtes qui touchent `agencies` : c'est exactement la propriété que le ticket demande.
         */
        $requetesAgences = 0;
        DB::listen(function ($requete) use (&$requetesAgences): void {
            if (str_contains($requete->sql, 'agencies')) {
                $requetesAgences++;
            }
        });

        $this->getJson('/api/admin/kyc?filter[status]=submitted&filter[subject_type]=Agency&per_page=10')
            ->assertOk()
            ->assertJsonPath('data.0.id', $dossier->id)
            ->assertJsonPath('data.0.subject.id', $agency->id)
            ->assertJsonPath('data.0.subject.type', 'Agency')
            ->assertJsonPath('data.0.subject.name', 'Dakar Immo Sarl');

        // UNE seule requête sur `agencies` pour un dossier — le `morphTo` groupé.
        $this->assertSame(1, $requetesAgences);

        $this->submittedDossierWithDocuments(Agency::factory()->create());
        $this->submittedDossierWithDocuments(Agency::factory()->create());

        $requetesAgences = 0;
        $this->getJson('/api/admin/kyc?filter[status]=submitted&filter[subject_type]=Agency&per_page=10')
            ->assertOk()
            ->assertJsonCount(3, 'data');

        // Toujours UNE, pour trois dossiers : trois auraient trahi la lecture ligne à ligne.
        $this->assertSame(1, $requetesAgences);
    }

    private function submittedDossierWithDocuments(Agency $agency, mixed $submittedAt = null): KycDossier
    {
        $dossier = KycDossier::query()->create([
            'subject_type' => Agency::class,
            'subject_id' => $agency->id,
            'status' => KycDossierStatus::Submitted,
            'submitted_at' => $submittedAt ?? now(),
        ]);

        foreach (['rccm', 'ninea', 'director_id'] as $type) {
            $file = UploadedFile::fake()->create("{$type}.pdf", 10, 'application/pdf');
            $dossier->addMedia($file)
                ->usingFileName("{$type}.pdf")
                ->withCustomProperties(['document_type' => $type])
                ->toMediaCollection('documents');
        }

        return $dossier->refresh();
    }
}
