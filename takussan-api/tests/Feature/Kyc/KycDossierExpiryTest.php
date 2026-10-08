<?php

namespace Tests\Feature\Kyc;

use App\Domain\Notifications\NotificationCode;
use App\Models\Activity;
use App\Models\Agency;
use App\Models\AppNotification;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\KycDossierStatus;
use App\Models\KycDossier;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\TestResponse;
use Tests\ApiTestCase;

/**
 * TCK-601 (AC7, AC8, ADR-0044 §5) — la pièce du dirigeant porte une échéance, le dossier vérifié
 * prend la plus proche des pièces les plus récentes, et `kyc:expire-dossiers` relance à J-30 et J-7
 * puis remet le dossier à `pending` le jour venu, sans toucher au statut de l'agence.
 */
class KycDossierExpiryTest extends ApiTestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake();
        Notification::fake();
    }

    private function upload(Agency $agency, string $type, ?string $expiresAt = null): TestResponse
    {
        return $this->post("/api/agencies/{$agency->id}/kyc/documents", array_filter([
            'document_type' => $type,
            'document' => UploadedFile::fake()->create("{$type}.pdf", 20, 'application/pdf'),
            'expires_at' => $expiresAt,
        ]), ['Accept' => 'application/json']);
    }

    /** AC7 — sans échéance ou avec une date passée : 422 ; après vérification, l'échéance la plus récente. */
    public function test_l_echeance_de_la_piece_du_dirigeant(): void
    {
        $this->freezeSecond();
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $this->upload($agency, 'director_id')->assertStatus(422)->assertJsonValidationErrors('expires_at');
        $this->upload($agency, 'director_id', now()->subDay()->toDateString())->assertStatus(422)->assertJsonValidationErrors('expires_at');
        $this->upload($agency, 'director_id', now()->toDateString())->assertStatus(422)->assertJsonValidationErrors('expires_at');

        $this->upload($agency, 'rccm')->assertCreated();
        $this->upload($agency, 'ninea')->assertCreated();
        // Une première pièce qui expire bientôt, remplacée par une plus récente : seule la seconde compte.
        $this->upload($agency, 'director_id', now()->addDays(10)->toDateString())->assertCreated();
        $this->travel(1)->seconds();
        $response = $this->upload($agency, 'director_id', now()->addYears(2)->toDateString())->assertCreated();
        $this->assertContains(now()->addYears(2)->toDateString(), array_column($response->json('data.documents'), 'document_expires_at'));

        $this->apiPost("/api/agencies/{$agency->id}/kyc/submit")->assertOk();
        $dossier = KycDossier::query()->where('subject_id', $agency->id)->sole();

        $this->apiActingAsRole('super_admin');
        $this->apiPost("/api/admin/kyc/{$dossier->id}/verify")->assertOk()
            ->assertJsonPath('data.expires_at', now()->addYears(2)->startOfDay()->utc()->format(DATE_ATOM));
        $this->assertTrue($dossier->fresh()->expires_at->equalTo(now()->addYears(2)->startOfDay()));
    }

    private function verifiedDossier(Agency $agency, string $expiresAt): KycDossier
    {
        return KycDossier::query()->create([
            'subject_type' => Agency::class,
            'subject_id' => $agency->id,
            'status' => KycDossierStatus::Verified,
            'reviewed_at' => now(),
            'expires_at' => $expiresAt,
            'metadata' => [],
        ]);
    }

    private function remindersFor(User $user): int
    {
        return AppNotification::query()->where('user_id', $user->id)->where('code', NotificationCode::KycExpiringSoon->value)->count();
    }

    /** AC8 — J-30 puis J-7, une notification par admin actif, jamais deux fois ; l'échéance expire. */
    public function test_relances_puis_expiration(): void
    {
        $this->travelTo(now()->setDate(2026, 10, 1)->setTime(6, 0));
        $agency = Agency::factory()->create(['status' => AgencyStatus::Active, 'is_verified' => true]);
        [$admin1, $admin2, $suspended] = [User::factory()->create(), User::factory()->create(), User::factory()->create()];
        AgencyAdminProfile::factory()->create(['user_id' => $admin1->id, 'agency_id' => $agency->id]);
        AgencyAdminProfile::factory()->create(['user_id' => $admin2->id, 'agency_id' => $agency->id]);
        AgencyAdminProfile::factory()->suspended()->create(['user_id' => $suspended->id, 'agency_id' => $agency->id]);
        $dossier = $this->verifiedDossier($agency, '2026-11-15 00:00:00');

        // J-45 : rien.
        $this->artisan('kyc:expire-dossiers')->assertSuccessful();
        $this->assertSame(0, $this->remindersFor($admin1));

        // J-30 : une relance par admin actif, et pas deux le lendemain.
        $this->travelTo(now()->setDate(2026, 10, 16));
        $this->artisan('kyc:expire-dossiers')->assertSuccessful();
        $this->travelTo(now()->setDate(2026, 10, 17));
        $this->artisan('kyc:expire-dossiers')->assertSuccessful();
        $this->assertSame(1, $this->remindersFor($admin1));
        $this->assertSame(1, $this->remindersFor($admin2));
        $this->assertSame(0, $this->remindersFor($suspended));

        // J-7 : la seconde, une seule fois.
        $this->travelTo(now()->setDate(2026, 11, 8));
        $this->artisan('kyc:expire-dossiers')->assertSuccessful();
        $this->artisan('kyc:expire-dossiers')->assertSuccessful();
        $this->assertSame(2, $this->remindersFor($admin1));

        // Le jour d'échéance.
        $this->travelTo(now()->setDate(2026, 11, 15)->setTime(6, 0));
        $this->artisan('kyc:expire-dossiers')->assertSuccessful();

        $dossier->refresh();
        $agency->refresh();
        $this->assertSame(KycDossierStatus::Pending, $dossier->status);
        $this->assertNotNull($dossier->metadata['expired_at'] ?? null);
        $this->assertFalse($agency->is_verified);
        $this->assertSame(AgencyStatus::Active, $agency->status);
        $activity = Activity::query()->where('event', 'kyc_expired')->sole();
        $this->assertSame($agency->id, $activity->agency_id);

        // Repasser la commande ne relance plus rien.
        $this->artisan('kyc:expire-dossiers')->assertSuccessful();
        $this->assertSame(2, $this->remindersFor($admin1));
    }

    /** Un passage manqué à J-30 rattrape au jalon atteint, sans envoyer deux relances d'un coup. */
    public function test_un_passage_manque_ne_double_pas(): void
    {
        $this->travelTo(now()->setDate(2026, 11, 10));
        $agency = Agency::factory()->create(['is_verified' => true]);
        $admin = User::factory()->create();
        AgencyAdminProfile::factory()->create(['user_id' => $admin->id, 'agency_id' => $agency->id]);
        $this->verifiedDossier($agency, '2026-11-15 00:00:00');

        $this->artisan('kyc:expire-dossiers')->assertSuccessful();
        $this->artisan('kyc:expire-dossiers')->assertSuccessful();

        $this->assertSame(1, $this->remindersFor($admin));
    }
}
