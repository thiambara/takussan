<?php

namespace Tests\Feature\Privacy;

use App\Models\AccountDeletionRequest;
use App\Models\DataExport;
use App\Models\Enums\DataExportStatus;
use App\Models\Enums\PrivacyRequestStatus;
use App\Models\PrivacyRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;

/**
 * P147.08 (TCK-1435) — une entrée du registre liée à une demande de l'application (effacement,
 * export) ne se clôt pas à la main tant que sa demande vit : c'est l'application qui la répond
 * (ADR-0044 §4). Avant, le super-admin la passait `rejected` pendant que l'effacement attendait ;
 * l'effacement s'exécutait ensuite, et le registre gardait `rejected` sans date de réponse.
 */
class PrivacyRegistreEntreeLieeTest extends ApiTestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->apiActingAsRole('super_admin');
    }

    /** @return array<string, array{string}> */
    public static function clotures(): array
    {
        return [
            'answered' => ['answered'],
            'rejected' => ['rejected'],
            'withdrawn' => ['withdrawn'],
        ];
    }

    private function entreeDEffacement(AccountDeletionRequest $effacement): PrivacyRequest
    {
        return PrivacyRequest::query()->where('account_deletion_request_id', $effacement->id)->sole();
    }

    private function export(DataExportStatus $status): DataExport
    {
        $user = User::factory()->create();

        return DataExport::query()->create([
            'user_id' => $user->id,
            'requested_by' => $user->id,
            'status' => $status,
            'requested_at' => now(),
        ]);
    }

    #[DataProvider('clotures')]
    public function test_l_entree_d_un_effacement_en_attente_ne_se_clot_pas_a_la_main(string $status): void
    {
        $entree = $this->entreeDEffacement(AccountDeletionRequest::factory()->create());

        $this->patchJson("/api/admin/privacy-requests/{$entree->id}", ['status' => $status])
            ->assertStatus(422)
            ->assertJsonPath('code', 'privacy.request_linked_pending');

        $this->assertSame(PrivacyRequestStatus::InProgress, $entree->fresh()->status);
        $this->assertNull($entree->fresh()->answered_at);
    }

    public function test_l_entree_d_un_export_en_preparation_ne_se_clot_pas_a_la_main(): void
    {
        $export = $this->export(DataExportStatus::Queued);
        $entree = PrivacyRequest::query()->where('data_export_id', $export->id)->sole();

        $this->patchJson("/api/admin/privacy-requests/{$entree->id}", ['status' => 'rejected'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'privacy.request_linked_pending');
        $this->assertSame(PrivacyRequestStatus::InProgress, $entree->fresh()->status);
    }

    public function test_l_entree_d_un_export_en_echec_se_clot_a_la_main(): void
    {
        $export = $this->export(DataExportStatus::Queued);
        $export->update(['status' => DataExportStatus::Failed]);
        $entree = PrivacyRequest::query()->where('data_export_id', $export->id)->sole();

        $this->patchJson("/api/admin/privacy-requests/{$entree->id}", ['status' => 'rejected'])->assertOk();
        $this->assertSame(PrivacyRequestStatus::Rejected, $entree->fresh()->status);
    }

    public function test_l_entree_liee_se_commente_et_reste_ouverte_sans_refus(): void
    {
        $entree = $this->entreeDEffacement(AccountDeletionRequest::factory()->create());

        $this->patchJson("/api/admin/privacy-requests/{$entree->id}", [
            'status' => 'received',
            'response_summary' => 'Effacement programmé, délai de grâce en cours.',
        ])->assertOk();

        $this->assertSame(PrivacyRequestStatus::Received, $entree->fresh()->status);
    }
}
