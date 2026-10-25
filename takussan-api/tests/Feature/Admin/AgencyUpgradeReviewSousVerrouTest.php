<?php

namespace Tests\Feature\Admin;

use App\Models\Agency;
use App\Models\AgencyUpgradeRequest;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyUpgradeRequestStatus;
use App\Models\Enums\KycDossierStatus;
use App\Models\KycDossier;
use App\Models\User;
use App\Notifications\AgencyUpgradeApprovedNotification;
use App\Notifications\AgencyUpgradeRejectedNotification;
use App\Services\Agency\AgencyUpgradeReviewService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

/**
 * P211.02 (TCK-2107) — `approve` et `reject` jugent `pending` sur la demande relue sous verrou
 * dans leur transaction. Ils le jugeaient sur le modèle lié, avant la transaction : un rejet sur
 * une copie périmée après une approbation passait, et laissait une demande `rejected` derrière une
 * agence passée en `standard`.
 *
 * La course se rejoue sans concurrence : le second appel reçoit un modèle chargé avant le premier.
 */
class AgencyUpgradeReviewSousVerrouTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: AgencyUpgradeRequest, 1: Agency, 2: User} */
    private function demandeEnAttente(): array
    {
        $agency = Agency::factory()->create(['kind' => AgencyKind::Individual]);
        $submitter = User::factory()->create();
        KycDossier::query()->create([
            'subject_type' => Agency::class,
            'subject_id' => $agency->id,
            'status' => KycDossierStatus::Verified,
            'metadata' => [],
        ]);
        $demande = AgencyUpgradeRequest::factory()->pending()->create([
            'agency_id' => $agency->id,
            'submitted_by' => $submitter->id,
        ]);

        return [$demande, $agency, $submitter];
    }

    private function assertNonEnAttente(callable $geste): void
    {
        try {
            $geste();
            $this->fail('La seconde décision aurait dû être refusée.');
        } catch (HttpException $e) {
            $this->assertSame(422, $e->getStatusCode());
            $this->assertSame(__('agency_upgrade.review.errors.not_pending'), $e->getMessage());
        }
    }

    public function test_un_rejet_sur_une_demande_perimee_apres_une_approbation_est_refuse(): void
    {
        Notification::fake();
        [$demande, $agency, $submitter] = $this->demandeEnAttente();
        $perimee = AgencyUpgradeRequest::query()->findOrFail($demande->id);
        $service = app(AgencyUpgradeReviewService::class);

        $service->approve($demande, User::factory()->create());
        $this->assertNonEnAttente(fn () => $service->reject($perimee, User::factory()->create(), 'dossier incomplet'));

        $this->assertSame(AgencyUpgradeRequestStatus::Approved, $demande->refresh()->status);
        $this->assertSame(AgencyKind::Standard, $agency->refresh()->kind);
        Notification::assertSentToTimes($submitter, AgencyUpgradeApprovedNotification::class, 1);
        Notification::assertNotSentTo($submitter, AgencyUpgradeRejectedNotification::class);
    }

    public function test_une_approbation_sur_une_demande_perimee_apres_un_rejet_est_refusee(): void
    {
        Notification::fake();
        [$demande, $agency, $submitter] = $this->demandeEnAttente();
        $perimee = AgencyUpgradeRequest::query()->findOrFail($demande->id);
        $service = app(AgencyUpgradeReviewService::class);

        $service->reject($demande, User::factory()->create(), 'dossier incomplet');
        $this->assertNonEnAttente(fn () => $service->approve($perimee, User::factory()->create()));

        $this->assertSame(AgencyUpgradeRequestStatus::Rejected, $demande->refresh()->status);
        $this->assertSame(AgencyKind::Individual, $agency->refresh()->kind);
        Notification::assertNotSentTo($submitter, AgencyUpgradeApprovedNotification::class);
    }

    public function test_une_demande_en_attente_s_approuve_toujours(): void
    {
        Notification::fake();
        [$demande, $agency] = $this->demandeEnAttente();

        $rendue = app(AgencyUpgradeReviewService::class)->approve($demande, User::factory()->create());

        $this->assertSame(AgencyUpgradeRequestStatus::Approved, $rendue->status);
        $this->assertSame(AgencyKind::Standard, $agency->refresh()->kind);
    }
}
