<?php

namespace Tests\Feature\Jobs;

use App\Jobs\Lease\ExpireEndedLeasesJob;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use Illuminate\Console\Scheduling\Event;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-1153 (P81.02) — rien n'écrivait `expired` : un bail allé à son terme restait `active`, et
 * la restitution de sa caution (qui exige `terminated` ou `expired`) rendait 422
 * `deposit_refund.lease_not_ended`. Une tâche quotidienne passe `expired` les baux `active` dont
 * la date de fin est passée et qu'aucun renouvellement en vigueur ne relève.
 */
class ExpireEndedLeasesJobTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake(config('media-library.disk_name'));
        Storage::fake(config('media-library.public_disk_name'));
        Carbon::setTestNow('2026-11-02 04:00:00');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_un_bail_echu_passe_expired_puis_sa_caution_se_restitue(): void
    {
        $admin = $this->actingAsRole('agency_admin');
        $lease = Lease::factory()->active()->create([
            'landlord_id' => $admin->id,
            'agency_id' => $admin->agency_id,
            'start_date' => '2025-11-02',
            'end_date' => '2026-11-01',
            'deposit_amount' => 200_000,
        ]);

        Sanctum::actingAs($admin);
        $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 200_000])
            ->assertStatus(422)
            ->assertJsonPath('code', 'deposit_refund.lease_not_ended');

        $this->assertSame(1, (new ExpireEndedLeasesJob)->handle());

        $this->assertSame(LeaseStatus::Expired, $lease->fresh()->status);
        $log = Activity::query()->where('event', 'lease_expired')->sole();
        $this->assertSame($lease->id, $log->subject_id);

        $this->postJson("/api/leases/{$lease->id}/deposit-refund", ['amount' => 200_000])
            ->assertCreated()
            ->assertJsonPath('data.lease.status', 'expired');
    }

    public function test_seuls_les_baux_actifs_dont_la_fin_est_passee_expirent(): void
    {
        $endsToday = Lease::factory()->active()->create(['end_date' => '2026-11-02']);
        $noEnd = Lease::factory()->active()->create(['end_date' => null]);
        $terminating = Lease::factory()->create(['status' => LeaseStatus::Terminating, 'end_date' => '2026-10-01']);
        $terminated = Lease::factory()->create(['status' => LeaseStatus::Terminated, 'end_date' => '2026-10-01']);

        $this->assertSame(0, (new ExpireEndedLeasesJob)->handle());

        $this->assertSame(LeaseStatus::Active, $endsToday->fresh()->status);
        $this->assertSame(LeaseStatus::Active, $noEnd->fresh()->status);
        $this->assertSame(LeaseStatus::Terminating, $terminating->fresh()->status);
        $this->assertSame(LeaseStatus::Terminated, $terminated->fresh()->status);
    }

    public function test_un_bail_releve_par_un_renouvellement_en_vigueur_n_expire_pas(): void
    {
        $parent = Lease::factory()->active()->create(['end_date' => '2026-10-31']);
        Lease::factory()->active()->create([
            'renewed_from_lease_id' => $parent->id,
            'start_date' => '2026-11-01',
            'end_date' => '2027-10-31',
        ]);

        (new ExpireEndedLeasesJob)->handle();

        $this->assertSame(LeaseStatus::Active, $parent->fresh()->status);
    }

    public function test_la_tache_est_planifiee_chaque_jour(): void
    {
        $event = collect(app(Schedule::class)->events())
            ->first(fn (Event $e) => str_contains((string) $e->description, ExpireEndedLeasesJob::class));

        $this->assertNotNull($event, 'ExpireEndedLeasesJob absente du planificateur');
        $this->assertSame('15 3 * * *', $event->expression);
        $this->assertTrue($event->withoutOverlapping);
    }
}
