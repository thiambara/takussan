<?php

namespace Tests\Feature\Privacy;

use App\Jobs\Privacy\ProcessDataExport;
use App\Models\AccountDeletionRequest;
use App\Models\Activity;
use App\Models\DataExport;
use App\Models\Enums\DataExportStatus;
use App\Models\PrivacyRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\ApiTestCase;

/**
 * TCK-601 (AC18, ADR-0044 §4) — le registre des demandes de droits : alimenté par l'application
 * (export → portabilité, effacement → effacement, annulation → retirée, jamais effacée), saisi à la
 * main par le super-admin, exportable ; fermé à tout autre lecteur.
 */
class PrivacyRequestRegistryTest extends ApiTestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->freezeSecond();
        config(['privacy.rights_request_deadline_days' => 30]);
    }

    public function test_une_demande_d_export_par_l_utilisateur_ouvre_une_portabilite(): void
    {
        Queue::fake([ProcessDataExport::class]);
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/me/data-exports')->assertStatus(202);

        $entry = PrivacyRequest::query()->sole();
        $this->assertSame('portability', $entry->type->value);
        $this->assertSame($user->id, $entry->user_id);
        $this->assertTrue($entry->due_at->equalTo(now()->addDays(30)));
        $this->assertSame('in_progress', $entry->status->value);

        // L'export prêt répond à la demande.
        DataExport::query()->findOrFail($entry->data_export_id)->update(['status' => DataExportStatus::Ready]);
        $this->assertSame('answered', $entry->fresh()->status->value);
        $this->assertNotNull($entry->fresh()->answered_at);
    }

    public function test_un_export_lance_par_la_plateforme_n_ouvre_pas_de_seconde_demande(): void
    {
        Queue::fake([ProcessDataExport::class]);
        $user = User::factory()->create();
        $this->apiActingAsRole('super_admin');

        $this->apiPost("/api/admin/users/{$user->id}/data-exports", ['reason' => 'legal_request'])->assertStatus(202);

        $this->assertSame(0, PrivacyRequest::query()->count());
    }

    public function test_annuler_un_effacement_retire_l_entree_sans_l_effacer(): void
    {
        Notification::fake();
        $user = User::factory()->create(['password' => bcrypt('correct-horse')]);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/me/deletion-request', ['password' => 'correct-horse', 'reason_code' => 'privacy'])->assertStatus(202);
        $entry = PrivacyRequest::query()->sole();
        $this->assertSame('erasure', $entry->type->value);
        $this->assertNotNull($entry->account_deletion_request_id);
        $this->assertTrue($entry->due_at->equalTo(now()->addDays(30)));

        $this->deleteJson('/api/auth/me/deletion-request')->assertStatus(204);

        $this->assertSame(0, AccountDeletionRequest::query()->count());
        $entry = PrivacyRequest::query()->sole();
        $this->assertSame('withdrawn', $entry->status->value);
        $this->assertNull($entry->account_deletion_request_id);
    }

    public function test_une_demande_saisie_a_la_main_repondue_avec_preuve_figure_dans_l_export(): void
    {
        Storage::fake();
        $admin = $this->apiActingAsRole('super_admin');

        $created = $this->apiPost('/api/admin/privacy-requests', [
            'type' => 'access',
            'channel' => 'email',
            'requester_name' => 'Awa Témoin',
            'requester_contact' => 'awa@example.test',
            'received_at' => now()->subDays(40)->toDateString(),
        ])->assertCreated()
            ->assertJsonPath('data.status', 'received')
            ->assertJsonPath('data.is_overdue', true);
        $id = $created->json('data.id');
        $this->assertSame(now()->subDays(40)->startOfDay()->addDays(30)->toIso8601String(), PrivacyRequest::query()->findOrFail($id)->due_at->toIso8601String());

        // La liste se lit par échéance, et le retard se filtre.
        $this->apiGet('/api/admin/privacy-requests?filter[overdue]=1')->assertOk()->assertJsonPath('data.0.id', $id);

        $this->post("/api/admin/privacy-requests/{$id}", [
            '_method' => 'PATCH',
            'status' => 'answered',
            'response_summary' => 'Copie des données envoyée.',
            'proof' => UploadedFile::fake()->create('reponse.pdf', 20, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertOk()
            ->assertJsonPath('data.status', 'answered')
            ->assertJsonPath('data.is_overdue', false)
            ->assertJsonPath('data.proof.file_name', 'reponse.pdf')
            ->assertJsonPath('data.handled_by.id', $admin->id);

        // Une demande close ne se rouvre pas.
        $this->apiPatch("/api/admin/privacy-requests/{$id}", ['status' => 'in_progress'])
            ->assertStatus(422)->assertJsonPath('code', 'privacy.request_closed');

        $csv = $this->get('/api/admin/privacy-requests/export')->assertOk()->streamedContent();
        $this->assertStringContainsString('Awa Témoin', $csv);
        $this->assertStringContainsString('answered', $csv);
        $this->assertStringContainsString('reponse.pdf', $csv);

        // Le journal `Privacy` ne porte ni le nom ni le contact du demandeur.
        $journal = Activity::query()->where('log_name', PrivacyRequest::LOG_NAME)->get()->toJson();
        $this->assertStringNotContainsString('Awa', $journal);
        $this->assertStringNotContainsString('awa@example.test', $journal);
    }

    public function test_une_preuve_html_est_refusee(): void
    {
        Storage::fake();
        $this->apiActingAsRole('super_admin');
        $entry = PrivacyRequest::query()->create(['type' => 'access', 'channel' => 'email', 'requester_name' => 'X', 'received_at' => now()]);

        $this->post("/api/admin/privacy-requests/{$entry->id}", [
            '_method' => 'PATCH',
            'proof' => UploadedFile::fake()->createWithContent('reponse.html', '<script>alert(1)</script>'),
        ], ['Accept' => 'application/json'])->assertStatus(422)->assertJsonValidationErrors('proof');
    }

    public function test_tout_non_super_admin_est_refuse(): void
    {
        $entry = PrivacyRequest::query()->create(['type' => 'access', 'channel' => 'email', 'requester_name' => 'X', 'received_at' => now()]);

        foreach (['agency_admin', 'agent', 'owner'] as $role) {
            $this->apiActingAsRole($role);
            $this->apiGet('/api/admin/privacy-requests')->assertForbidden();
            $this->apiPost('/api/admin/privacy-requests', ['type' => 'access', 'channel' => 'email', 'requester_name' => 'X'])->assertForbidden();
            $this->apiPatch("/api/admin/privacy-requests/{$entry->id}", ['status' => 'rejected'])->assertForbidden();
            $this->apiGet('/api/admin/privacy-requests/export')->assertForbidden();
        }

        $this->assertSame('received', $entry->fresh()->status->value);
    }
}
