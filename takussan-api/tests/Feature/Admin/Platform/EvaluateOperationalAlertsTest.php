<?php

namespace Tests\Feature\Admin\Platform;

use App\Jobs\RecordQueueHeartbeat;
use App\Jobs\SendAdminAlert;
use App\Models\AlertRule;
use App\Services\Admin\HealthcheckService;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-600 — AC18 : les alertes d'exploitation, écrites à leur transition seulement.
 */
class EvaluateOperationalAlertsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        Storage::fake('public');
        config(['media-library.public_disk_name' => 'public', 'media-library.disk_name' => 'local']);
        Queue::fake();
    }

    public function test_une_rafale_d_echecs_alerte_une_fois_par_fenetre(): void
    {
        AlertRule::create(['event' => 'ops_failed_jobs_spike', 'channels_json' => ['email'], 'recipients_json' => ['emails' => ['ops@example.test']], 'is_active' => true]);
        $this->echecs(25);

        $this->evaluer();
        $this->assertSame(1, $this->compte('ops_failed_jobs_spike'));
        $this->assertSame(25, Activity::query()->where('event', 'ops_failed_jobs_spike')->sole()->properties['failed_jobs_1h']);
        Queue::assertPushed(SendAdminAlert::class, 1);

        $this->evaluer();
        $this->assertSame(1, $this->compte('ops_failed_jobs_spike'));
        Queue::assertPushed(SendAdminAlert::class, 1);
    }

    /** Second chemin : la condition retombe, puis revient — une nouvelle alerte. */
    public function test_la_rafale_suivante_alerte_de_nouveau(): void
    {
        $this->echecs(25);
        $this->evaluer();

        DB::table('failed_jobs')->delete();
        $this->evaluer();
        $this->assertSame(1, $this->compte('ops_failed_jobs_spike'));

        $this->echecs(21);
        $this->evaluer();
        $this->assertSame(2, $this->compte('ops_failed_jobs_spike'));
    }

    public function test_des_echecs_anciens_ou_trop_peu_nombreux_ne_font_pas_de_rafale(): void
    {
        $this->echecs(25, now()->subHours(2));
        $this->echecs(5);

        $this->evaluer();

        $this->assertSame(0, $this->compte('ops_failed_jobs_spike'));
    }

    public function test_une_file_a_l_arret_alerte_a_la_transition(): void
    {
        foreach (RecordQueueHeartbeat::QUEUES as $file) {
            (new RecordQueueHeartbeat($file))->handle();
        }
        $this->evaluer();
        $this->assertSame(0, $this->compte('ops_queue_stalled'));

        $quand = now()->subMinutes(15)->getTimestamp();
        DB::table('jobs')->insert(['queue' => 'default', 'payload' => '{}', 'attempts' => 0, 'available_at' => $quand, 'created_at' => $quand]);
        Cache::forget(HealthcheckService::SNAPSHOT_KEY);
        $this->evaluer();
        $this->evaluer();

        $this->assertSame(1, $this->compte('ops_queue_stalled'));
    }

    /** `degraded` — pas seulement `failed` — alerte : courriel en `log`, recherche hors Meilisearch. */
    public function test_une_sante_degradee_alerte_une_seule_fois(): void
    {
        config(['mail.default' => 'log', 'scout.driver' => 'collection']);
        foreach (RecordQueueHeartbeat::QUEUES as $file) {
            (new RecordQueueHeartbeat($file))->handle();
        }
        $this->assertSame('degraded', app(HealthcheckService::class)->snapshot()['status']);

        $this->evaluer();
        $this->evaluer();

        $this->assertSame(1, $this->compte('ops_health_degraded'));
        $this->assertNull(Activity::query()->where('event', 'ops_health_degraded')->sole()->causer_id);
    }

    public function test_la_commande_est_planifiee_toutes_les_cinq_minutes(): void
    {
        $this->assertTrue(collect(app(Schedule::class)->events())->contains(
            fn ($e) => str_contains((string) $e->command, 'alerts:evaluate') && $e->expression === '*/5 * * * *',
        ));
    }

    private function evaluer(): void
    {
        $this->artisan('alerts:evaluate')->assertSuccessful();
    }

    private function compte(string $event): int
    {
        return Activity::query()->where('event', $event)->count();
    }

    private function echecs(int $combien, $quand = null): void
    {
        $lignes = [];
        for ($i = 0; $i < $combien; $i++) {
            $lignes[] = ['uuid' => (string) str()->uuid(), 'connection' => 'database', 'queue' => 'default', 'payload' => '{}', 'exception' => 'x', 'failed_at' => $quand ?? now()];
        }
        DB::table('failed_jobs')->insert($lignes);
    }
}
