<?php

namespace Tests\Feature\Kyc;

use App\Domain\Notifications\NotificationCode;
use App\Exceptions\ApiError;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\KycDossierStatus;
use App\Models\KycDossier;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\User;
use App\Services\Kyc\KycWorkflowService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

/**
 * P211.01 (TCK-2105) — `submit`, `verify` et `reject` jugent le statut du dossier sur la ligne
 * relue sous verrou. Ils le jugeaient sur le modèle lié à la route : deux super-admins qui
 * tranchaient ensemble laissaient un dossier `rejected` et une agence vérifiée, et les admins de
 * l'agence recevaient les deux verdicts.
 *
 * La course se rejoue sans concurrence : le second appel reçoit un modèle chargé avant le premier.
 */
class KycVerdictSousVerrouTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: KycDossier, 1: Agency, 2: User} */
    private function dossierSoumis(): array
    {
        $agency = Agency::factory()->create(['is_verified' => false]);
        $admin = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $admin->id, 'agency_id' => $agency->id]);
        $agency->update(['primary_admin_id' => $admin->id]);

        $dossier = KycDossier::query()->create([
            'subject_type' => Agency::class,
            'subject_id' => $agency->id,
            'status' => KycDossierStatus::Submitted,
            'submitted_at' => now(),
        ]);
        foreach (KycWorkflowService::AGENCY_REQUIRED_DOCUMENTS as $type) {
            $dossier->addMedia(UploadedFile::fake()->create("{$type}.pdf", 10, 'application/pdf'))
                ->usingFileName("{$type}.pdf")
                ->withCustomProperties(['document_type' => $type])
                ->toMediaCollection('documents');
        }
        AppNotification::query()->delete();

        return [$dossier->refresh(), $agency, $admin];
    }

    private function verdicts(User $admin): int
    {
        return AppNotification::query()
            ->where('user_id', $admin->id)
            ->whereIn('code', [NotificationCode::KycVerified->value, NotificationCode::KycRejected->value])
            ->count();
    }

    private function assertRefus(callable $geste, string $code): void
    {
        try {
            $geste();
            $this->fail("Le geste aurait dû être refusé par {$code}.");
        } catch (ApiError $e) {
            $this->assertSame(422, $e->getStatusCode());
            $this->assertSame($code, $e->errorCode);
        }
    }

    public function test_un_rejet_sur_un_dossier_perime_apres_une_verification_est_refuse(): void
    {
        [$dossier, $agency, $admin] = $this->dossierSoumis();
        $perime = KycDossier::query()->findOrFail($dossier->id);
        $service = app(KycWorkflowService::class);

        $service->verify($dossier, User::factory()->create());
        $this->assertRefus(
            fn () => $service->reject($perime, User::factory()->create(), 'pièces illisibles'),
            KycWorkflowService::CODE_NOT_TRANSITIONABLE,
        );

        $this->assertSame(KycDossierStatus::Verified, $dossier->refresh()->status);
        $this->assertNull($dossier->rejection_reason);
        $agency->refresh();
        $this->assertTrue((bool) $agency->is_verified);
        $this->assertSame(AgencyStatus::Active, $agency->status);
        $this->assertSame(1, $this->verdicts($admin));
    }

    public function test_une_verification_sur_un_dossier_perime_apres_un_rejet_est_refusee(): void
    {
        [$dossier, $agency, $admin] = $this->dossierSoumis();
        $perime = KycDossier::query()->findOrFail($dossier->id);
        $service = app(KycWorkflowService::class);

        $service->reject($dossier, User::factory()->create(), 'pièces illisibles');
        $this->assertRefus(
            fn () => $service->verify($perime, User::factory()->create()),
            KycWorkflowService::CODE_NOT_TRANSITIONABLE,
        );

        $this->assertSame(KycDossierStatus::Rejected, $dossier->refresh()->status);
        $this->assertFalse((bool) $agency->refresh()->is_verified);
        $this->assertSame(1, $this->verdicts($admin));
    }

    public function test_une_soumission_sur_un_dossier_perime_apres_sa_verification_est_refusee(): void
    {
        [$dossier] = $this->dossierSoumis();
        $dossier->update(['status' => KycDossierStatus::Pending]);
        $perime = KycDossier::query()->findOrFail($dossier->id);
        $service = app(KycWorkflowService::class);
        KycDossier::query()->whereKey($dossier->id)->update(['status' => KycDossierStatus::Verified->value]);

        $this->assertRefus(
            fn () => $service->submit($perime, User::factory()->create()),
            KycWorkflowService::CODE_LOCKED,
        );

        $this->assertSame(KycDossierStatus::Verified, $dossier->refresh()->status);
    }

    public function test_un_dossier_soumis_se_verifie_toujours(): void
    {
        [$dossier, $agency, $admin] = $this->dossierSoumis();

        $rendu = app(KycWorkflowService::class)->verify($dossier, User::factory()->create());

        $this->assertSame(KycDossierStatus::Verified, $rendu->status);
        $this->assertTrue((bool) $agency->refresh()->is_verified);
        $this->assertSame(1, $this->verdicts($admin));
    }
}
