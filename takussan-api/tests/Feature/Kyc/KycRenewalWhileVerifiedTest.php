<?php

namespace Tests\Feature\Kyc;

use App\Domain\Notifications\NotificationCode;
use App\Models\Activity;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\KycDossierStatus;
use App\Models\KycDossier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;

/**
 * TCK-2669 (ADR-0104 § 7) — sur un dossier vérifié, la pièce du dirigeant expirée ou expirant sous
 * 30 jours se remplace : le dossier passe `submitted`, l'agence reste vérifiée jusqu'à l'échéance de
 * l'ancienne pièce, et ce jour-là `kyc:expire-dossiers` lui retire `is_verified` sans repasser le
 * dossier en `pending`.
 */
class KycRenewalWhileVerifiedTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake();
        $this->travelTo(Carbon::parse('2026-11-10 09:00:00'));
        $this->agency = Agency::factory()->create(['status' => AgencyStatus::Active, 'is_verified' => true]);
        $this->admin = $this->apiActingAsRole('agency_admin', ['agency' => $this->agency]);
    }

    private function verifiedDossier(int $daysLeft): KycDossier
    {
        return KycDossier::query()->create([
            'subject_type' => Agency::class,
            'subject_id' => $this->agency->id,
            'status' => KycDossierStatus::Verified,
            'submitted_at' => now()->subYear(),
            'reviewed_at' => now()->subYear(),
            'expires_at' => now()->startOfDay()->addDays($daysLeft),
            'metadata' => ['expiry_reminders' => [30]],
        ]);
    }

    private function upload(string $type = 'director_id', ?string $expiresAt = '2031-01-01'): TestResponse
    {
        return $this->post("/api/agencies/{$this->agency->id}/kyc/documents", array_filter([
            'document_type' => $type,
            'document' => UploadedFile::fake()->create("{$type}.pdf", 20, 'application/pdf'),
            'expires_at' => $type === 'director_id' ? $expiresAt : null,
        ]), ['Accept' => 'application/json']);
    }

    public function test_ac2_la_piece_qui_expire_sous_30_jours_se_remplace(): void
    {
        $dossier = $this->verifiedDossier(20);
        $previous = $dossier->expires_at;

        $this->upload()->assertCreated()->assertJsonPath('data.status', 'submitted');

        $dossier->refresh();
        $this->assertSame(KycDossierStatus::Submitted, $dossier->status);
        $this->assertTrue($dossier->submitted_at->equalTo(now()));
        // L'échéance du dossier reste celle de l'ancienne pièce jusqu'à la vérification.
        $this->assertTrue($dossier->expires_at->equalTo($previous));
        $this->assertTrue($this->agency->fresh()->is_verified);
        $this->assertSame(1, $dossier->getMedia('documents')->count());

        $log = Activity::query()->where('event', 'kyc_submitted')->sole();
        $this->assertTrue($log->properties['renewal']);
        $this->assertSame((int) $this->admin->id, (int) $log->causer_id);
    }

    public function test_ac2_une_piece_expiree_mais_pas_encore_balayee_se_remplace_aussi(): void
    {
        $dossier = $this->verifiedDossier(0);

        $this->upload()->assertCreated();

        $this->assertSame(KycDossierStatus::Submitted, $dossier->fresh()->status);
    }

    public function test_ac2_une_piece_qui_expire_dans_90_jours_reste_verrouillee(): void
    {
        $dossier = $this->verifiedDossier(90);

        $this->upload()->assertStatus(422)->assertJsonPath('code', 'kyc.locked');

        $this->assertSame(KycDossierStatus::Verified, $dossier->fresh()->status);
        $this->assertSame(0, $dossier->fresh()->getMedia('documents')->count());
    }

    public function test_la_borne_des_30_jours(): void
    {
        $this->verifiedDossier(30);
        $this->upload()->assertCreated();

        KycDossier::query()->delete();
        $this->verifiedDossier(31);
        $this->upload()->assertStatus(422)->assertJsonPath('code', 'kyc.locked');
    }

    /**
     * TCK-2671 — le dossier SERT le jour d'ouverture du renouvellement (`renewal.opens_on`), et c'est
     * le jour même où l'API accepte la pièce : la veille, `kyc.locked`. Le front n'en recopie rien.
     */
    public function test_le_dossier_dit_le_jour_ou_le_renouvellement_s_ouvre_et_l_api_le_tient(): void
    {
        $this->verifiedDossier(45);

        $this->getJson("/api/agencies/{$this->agency->id}/kyc")->assertOk()
            ->assertJsonPath('data.renewal.document_type', 'director_id')
            ->assertJsonPath('data.renewal.opens_on', '2026-11-25');

        $this->travelTo(Carbon::parse('2026-11-24 23:59:00'));
        $this->upload()->assertStatus(422)->assertJsonPath('code', 'kyc.locked');

        $this->travelTo(Carbon::parse('2026-11-25 00:01:00'));
        $this->upload()->assertCreated();
    }

    /** Une échéance en cours de journée : la fenêtre s'ouvre au minuit SUIVANT le jour « J − 30 ». */
    public function test_une_echeance_en_cours_de_journee_ouvre_le_lendemain_de_j_moins_30(): void
    {
        KycDossier::query()->create([
            'subject_type' => Agency::class, 'subject_id' => $this->agency->id,
            'status' => KycDossierStatus::Verified, 'expires_at' => Carbon::parse('2026-12-20 10:00:00'), 'metadata' => [],
        ]);

        $this->getJson("/api/agencies/{$this->agency->id}/kyc")->assertOk()->assertJsonPath('data.renewal.opens_on', '2026-11-21');

        $this->travelTo(Carbon::parse('2026-11-20 12:00:00'));
        $this->upload()->assertStatus(422)->assertJsonPath('code', 'kyc.locked');

        $this->travelTo(Carbon::parse('2026-11-21 00:01:00'));
        $this->upload()->assertCreated();
    }

    public function test_sans_verification_ou_sans_echeance_le_dossier_n_annonce_aucun_renouvellement(): void
    {
        $dossier = KycDossier::query()->create([
            'subject_type' => Agency::class, 'subject_id' => $this->agency->id,
            'status' => KycDossierStatus::Verified, 'expires_at' => null, 'metadata' => [],
        ]);
        $this->getJson("/api/agencies/{$this->agency->id}/kyc")->assertOk()->assertJsonPath('data.renewal', null);

        $dossier->update(['status' => KycDossierStatus::Pending, 'expires_at' => now()->addDays(10)]);
        $this->getJson("/api/agencies/{$this->agency->id}/kyc")->assertOk()->assertJsonPath('data.renewal', null);
    }

    public function test_seule_la_piece_du_dirigeant_se_renouvelle(): void
    {
        $dossier = $this->verifiedDossier(20);

        $this->upload('rccm')->assertStatus(422)->assertJsonPath('code', 'kyc.locked');

        $this->assertSame(KycDossierStatus::Verified, $dossier->fresh()->status);
    }

    public function test_un_dossier_verifie_sans_echeance_reste_verrouille(): void
    {
        KycDossier::query()->create([
            'subject_type' => Agency::class, 'subject_id' => $this->agency->id,
            'status' => KycDossierStatus::Verified, 'expires_at' => null, 'metadata' => [],
        ]);

        $this->upload()->assertStatus(422)->assertJsonPath('code', 'kyc.locked');
    }

    public function test_le_renouvellement_previent_les_super_admins(): void
    {
        $this->verifiedDossier(20);
        $superAdmin = User::factory()->create();
        $this->materializeRoleProfile($superAdmin, 'super_admin');

        $this->upload()->assertCreated();

        $this->assertSame(1, AppNotification::query()->where('user_id', $superAdmin->id)->where('code', NotificationCode::KycSubmitted->value)->count());
    }

    public function test_ac3_a_l_echeance_le_dossier_reste_soumis_et_l_agence_perd_la_verification(): void
    {
        $dossier = $this->verifiedDossier(20);
        $this->upload()->assertCreated();

        // La veille : rien ne change.
        $this->travelTo(now()->startOfDay()->addDays(19)->setTime(6, 0));
        $this->artisan('kyc:expire-dossiers')->assertSuccessful();
        $this->assertTrue($this->agency->fresh()->is_verified);

        // Le jour de l'échéance de l'ancienne pièce.
        $this->travelTo(now()->addDay());
        $this->artisan('kyc:expire-dossiers')->assertSuccessful();

        $dossier->refresh();
        $this->assertSame(KycDossierStatus::Submitted, $dossier->status);
        $this->assertFalse($this->agency->fresh()->is_verified);
        $this->assertSame(AgencyStatus::Active, $this->agency->fresh()->status);
        $this->assertNotNull($dossier->metadata['expired_at'] ?? null);
        $this->assertSame(1, Activity::query()->where('event', 'kyc_expired')->count());

        // Idempotent : un second passage n'écrit rien de plus.
        $this->artisan('kyc:expire-dossiers')->assertSuccessful();
        $this->assertSame(1, Activity::query()->where('event', 'kyc_expired')->count());
    }

    public function test_un_renouvellement_refuse_perd_aussi_la_verification_a_l_echeance(): void
    {
        $dossier = $this->verifiedDossier(20);
        $this->upload()->assertCreated();
        $this->apiActingAsRole('super_admin');
        $this->apiPost("/api/admin/kyc/{$dossier->id}/reject", ['reason' => 'Pièce illisible'])->assertOk();
        $this->assertTrue($this->agency->fresh()->is_verified);

        $this->travelTo(now()->startOfDay()->addDays(20)->setTime(6, 0));
        $this->artisan('kyc:expire-dossiers')->assertSuccessful();

        $this->assertSame(KycDossierStatus::Rejected, $dossier->fresh()->status);
        $this->assertFalse($this->agency->fresh()->is_verified);
    }

    /**
     * Un dossier déjà passé par l'échéance (`metadata.expired_at`) puis renvoyé garde une
     * `expires_at` révolue : si la modération vérifie l'agence à la main entre-temps, le balayage
     * ne doit pas la lui retirer chaque nuit. Seul le renouvellement d'un dossier vérifié l'est.
     */
    public function test_un_dossier_deja_echu_ne_retire_pas_une_verification_posee_a_la_main(): void
    {
        $dossier = KycDossier::query()->create([
            'subject_type' => Agency::class, 'subject_id' => $this->agency->id,
            'status' => KycDossierStatus::Submitted,
            'submitted_at' => now()->subDays(2),
            'expires_at' => now()->subMonth(),
            'metadata' => ['expired_at' => now()->subMonth()->toIso8601String()],
        ]);

        $this->artisan('kyc:expire-dossiers')->assertSuccessful();

        $this->assertTrue($this->agency->fresh()->is_verified);
        $this->assertSame(KycDossierStatus::Submitted, $dossier->fresh()->status);
        $this->assertSame(0, Activity::query()->where('event', 'kyc_expired')->count());
    }

    public function test_verifier_le_renouvellement_ouvre_la_nouvelle_echeance(): void
    {
        $dossier = $this->verifiedDossier(20);
        foreach (['rccm', 'ninea'] as $type) {
            $dossier->addMedia(UploadedFile::fake()->create("{$type}.pdf", 20, 'application/pdf'))
                ->withCustomProperties(['document_type' => $type])->toMediaCollection('documents');
        }
        $this->upload(expiresAt: '2031-01-01')->assertCreated();

        $this->apiActingAsRole('super_admin');
        $this->apiPost("/api/admin/kyc/{$dossier->id}/verify")->assertOk();

        $dossier->refresh();
        $this->assertSame(KycDossierStatus::Verified, $dossier->status);
        $this->assertTrue($dossier->expires_at->equalTo(Carbon::parse('2031-01-01')->startOfDay()));
        $this->assertTrue($this->agency->fresh()->is_verified);
    }
}
