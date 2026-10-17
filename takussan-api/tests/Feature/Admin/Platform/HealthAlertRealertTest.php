<?php

namespace Tests\Feature\Admin\Platform;

use App\Jobs\SendAdminAlert;
use App\Models\AlertRule;
use App\Services\Admin\HealthcheckService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Cache;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * TCK-769 (P14.05) — l'alerte de santé se taisait après le premier « dégradé » : la transition
 * reposait sur un booléen, et un passage de `degraded` à `failed`, ou une sonde de plus en échec,
 * ne disait rien. Le message ne nommait pas la sonde.
 */
class HealthAlertRealertTest extends TestCase
{
    use RefreshDatabase;

    public function test_un_passage_de_degrade_a_echec_realerte(): void
    {
        $this->sante('degraded', ['mail' => 'degraded']);
        $this->sante('failed', ['mail' => 'failed']);

        $this->assertSame(2, $this->compte());
    }

    public function test_une_sonde_de_plus_en_echec_realerte(): void
    {
        $this->sante('degraded', ['mail' => 'degraded']);
        $this->sante('degraded', ['mail' => 'degraded', 'search' => 'degraded']);

        $this->assertSame(2, $this->compte());
    }

    /** Le verrou tient tant que rien ne change, même si l'ordre des sondes varie. */
    public function test_le_meme_ensemble_au_meme_niveau_ne_realerte_pas(): void
    {
        $this->sante('degraded', ['mail' => 'degraded', 'search' => 'degraded']);
        $this->sante('degraded', ['search' => 'degraded', 'mail' => 'degraded']);
        $this->sante('degraded', ['mail' => 'degraded', 'search' => 'degraded']);

        $this->assertSame(1, $this->compte());
    }

    public function test_un_retour_a_ok_puis_le_meme_echec_realerte(): void
    {
        $this->sante('degraded', ['mail' => 'degraded']);
        $this->sante('ok', []);
        $this->sante('degraded', ['mail' => 'degraded']);

        $this->assertSame(2, $this->compte());
    }

    public function test_le_message_nomme_les_sondes_en_echec(): void
    {
        Bus::fake([SendAdminAlert::class]);
        AlertRule::create(['event' => 'ops_health_degraded', 'channels_json' => ['email'], 'recipients_json' => ['emails' => ['ops@example.test']], 'is_active' => true]);

        $this->sante('failed', ['mail' => 'degraded', 'database' => 'failed']);

        Bus::assertDispatchedSync(SendAdminAlert::class, function (SendAdminAlert $job): bool {
            return str_contains($job->alert['message'], 'mail (degraded)')
                && str_contains($job->alert['message'], 'database (failed)');
        });
    }

    /**
     * @param  array<string,string>  $failing
     */
    private function sante(string $status, array $failing): void
    {
        $snapshot = ['status' => $status, 'queue' => ['status' => 'ok'], 'workers' => ['status' => 'ok']];
        foreach ($failing as $sonde => $niveau) {
            $snapshot[$sonde] = ['status' => $niveau];
        }
        Cache::put(HealthcheckService::SNAPSHOT_KEY, $snapshot, 60);

        $this->artisan('alerts:evaluate')->assertSuccessful();
    }

    private function compte(): int
    {
        return Activity::query()->where('event', 'ops_health_degraded')->count();
    }
}
