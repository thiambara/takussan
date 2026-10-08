<?php

namespace Tests\Feature\Admin\Platform;

use App\Jobs\RecordQueueHeartbeat;
use App\Models\AppNotification;
use App\Models\NotificationDeliveryAttempt;
use App\Models\User;
use App\Services\Admin\HealthcheckService;
use App\Services\Media\Cdn\CdnProviderContract;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * TCK-600 — AC17 : la page Santé mesure ce qu'elle affiche.
 *
 * Chaque sonde rendait `ok` sans rien sonder (courriel en `log`, SMS hors driver `broken`, médias
 * sondés sur `local`) ; la route publique appelait le CDN à chaque requête anonyme.
 */
class HealthcheckProbesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        Storage::fake('public');
        config(['media-library.public_disk_name' => 'public', 'media-library.disk_name' => 'local']);
    }

    private function sonder(): array
    {
        return app(HealthcheckService::class)->refresh();
    }

    public function test_un_courriel_en_log_est_degrade_pas_ok(): void
    {
        config(['mail.default' => 'log']);

        $this->assertSame('degraded', $this->sonder()['mail']['status']);
    }

    public function test_trente_pour_cent_d_echecs_sms_sur_l_heure_degradent_la_sonde(): void
    {
        $this->tentativesSms(7, 3);
        $sonde = $this->sonder()['sms'];

        $this->assertSame('degraded', $sonde['status']);
        $this->assertSame(10, $sonde['attempts_1h']);
        $this->assertEqualsWithDelta(0.3, $sonde['failure_rate_1h'], 0.001);
    }

    /** Second chemin : les mêmes échecs, mais vieux de deux heures ou côté WhatsApp, ne comptent pas. */
    public function test_les_echecs_hors_heure_ou_whatsapp_ne_comptent_pas(): void
    {
        $this->tentativesSms(7, 3, now()->subHours(2));
        $this->tentativesSms(7, 3, now(), 'whatsapp_cloud');

        $this->assertSame('ok', $this->sonder()['sms']['status']);
    }

    public function test_un_disque_prive_de_medias_qui_leve_echoue_alors_que_local_repond(): void
    {
        $prive = $this->mock(Filesystem::class);
        $prive->shouldReceive('put')->andThrow(new \RuntimeException('R2 injoignable'));
        Storage::extend('explose', fn () => $prive);
        config(['filesystems.disks.prive' => ['driver' => 'explose'], 'media-library.disk_name' => 'prive']);

        $instantane = $this->sonder();

        $this->assertSame('ok', $instantane['storage']['status']);
        $this->assertSame('failed', $instantane['media_storage']['status']);
        $this->assertSame('failed', $instantane['status']);
    }

    public function test_meilisearch_injoignable_echoue(): void
    {
        config(['scout.driver' => 'meilisearch', 'scout.meilisearch.host' => 'http://127.0.0.1:9']);

        $this->assertSame('failed', $this->sonder()['search']['status']);
    }

    public function test_un_job_en_attente_depuis_quinze_minutes_degrade_sa_file(): void
    {
        $this->jobEnAttente('default', 900);
        $this->jobEnAttente('media', 30);
        // Un job différé n'attend pas encore : il ne vieillit pas la file.
        DB::table('jobs')->insert(['queue' => 'reconciliation', 'payload' => '{}', 'attempts' => 0, 'available_at' => now()->addHour()->getTimestamp(), 'created_at' => now()->subDay()->getTimestamp()]);

        $file = $this->sonder()['queue'];

        $this->assertSame('degraded', $file['status']);
        $this->assertSame('degraded', $file['queues']['default']['status']);
        $this->assertSame('ok', $file['queues']['media']['status']);
        $this->assertArrayNotHasKey('reconciliation', $file['queues']);
        $this->assertGreaterThanOrEqual(900, $file['oldest_pending_seconds']);
    }

    public function test_aucun_battement_depuis_cinq_minutes_fait_echouer_les_workers(): void
    {
        foreach (RecordQueueHeartbeat::QUEUES as $file) {
            Cache::put(RecordQueueHeartbeat::cacheKey($file), now()->subSeconds(301)->getTimestamp());
        }
        $this->assertSame('failed', $this->sonder()['workers']['status']);

        foreach (RecordQueueHeartbeat::QUEUES as $file) {
            (new RecordQueueHeartbeat($file))->handle();
        }
        $this->assertSame('ok', $this->sonder()['workers']['status']);
    }

    public function test_une_seule_file_muette_suffit(): void
    {
        foreach (RecordQueueHeartbeat::QUEUES as $file) {
            (new RecordQueueHeartbeat($file))->handle();
        }
        Cache::forget(RecordQueueHeartbeat::cacheKey('reconciliation'));

        $workers = $this->sonder()['workers'];
        $this->assertSame('failed', $workers['status']);
        $this->assertSame('ok', $workers['queues']['media']['status']);
    }

    public function test_le_statut_global_est_la_pire_sonde_et_chaque_sonde_est_datee(): void
    {
        $this->assertSame('ok', HealthcheckService::worst(['ok', 'ok']));
        $this->assertSame('degraded', HealthcheckService::worst(['ok', 'degraded', 'ok']));
        $this->assertSame('failed', HealthcheckService::worst(['degraded', 'failed', 'ok']));

        config(['mail.default' => 'log', 'scout.driver' => 'meilisearch', 'scout.meilisearch.host' => 'http://127.0.0.1:9']);
        $instantane = $this->sonder();

        $this->assertSame('failed', $instantane['status']);
        foreach (['db', 'cache', 'storage', 'media_storage', 'mail', 'sms', 'search', 'queue', 'workers'] as $sonde) {
            $this->assertNotNull($instantane[$sonde]['checked_at'] ?? null, $sonde);
        }
    }

    public function test_la_route_publique_lit_le_cache_et_n_appelle_pas_le_cdn(): void
    {
        config(['cdn.enabled' => true]);
        $cdn = $this->mock(CdnProviderContract::class);
        $cdn->shouldNotReceive('healthCheck');

        $this->getJson('/api/health')->assertOk()->assertExactJson(['status' => 'unknown', 'checked_at' => null]);

        Cache::put(HealthcheckService::STATUS_KEY, ['status' => 'degraded', 'checked_at' => '2026-10-08T10:00:00.000000Z'], 600);
        $this->getJson('/api/health')
            ->assertOk()
            ->assertExactJson(['status' => 'degraded', 'checked_at' => '2026-10-08T10:00:00.000000Z']);
    }

    public function test_la_commande_de_sonde_remplit_le_statut_public(): void
    {
        config(['cdn.enabled' => false]);

        $this->artisan('health:probe')->assertSuccessful();

        $this->assertContains($this->getJson('/api/health')->json('status'), ['ok', 'degraded', 'failed']);
        $this->assertNotNull($this->getJson('/api/health')->json('checked_at'));
    }

    public function test_le_battement_et_la_sonde_sont_planifies_chaque_minute_sur_les_quatre_files(): void
    {
        $evenements = collect(app(Schedule::class)->events());

        $battements = $evenements->filter(fn ($e) => $e->description === RecordQueueHeartbeat::class);
        $this->assertCount(4, $battements);
        $battements->each(fn ($e) => $this->assertSame('* * * * *', $e->expression));
        $this->assertTrue($evenements->contains(fn ($e) => str_contains((string) $e->command, 'health:probe') && $e->expression === '* * * * *'));
    }

    private function tentativesSms(int $reussies, int $echouees, $quand = null, string $fournisseur = 'mtarget'): void
    {
        $notification = AppNotification::factory()->create(['user_id' => User::factory()->create()->id]);
        $n = 0;
        foreach ([['sent', $reussies], ['failed', $echouees]] as [$statut, $combien]) {
            for ($i = 0; $i < $combien; $i++) {
                $tentative = NotificationDeliveryAttempt::query()->create([
                    'app_notification_id' => $notification->id,
                    'attempt' => ++$n,
                    'provider' => $fournisseur,
                    'status' => $statut,
                ]);
                if ($quand !== null) {
                    $tentative->forceFill(['created_at' => $quand])->saveQuietly();
                }
            }
        }
    }

    private function jobEnAttente(string $file, int $depuis): void
    {
        $quand = now()->subSeconds($depuis)->getTimestamp();
        DB::table('jobs')->insert(['queue' => $file, 'payload' => '{}', 'attempts' => 0, 'available_at' => $quand, 'created_at' => $quand]);
    }
}
