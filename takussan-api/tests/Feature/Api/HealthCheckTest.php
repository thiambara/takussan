<?php

namespace Tests\Feature\Api;

use App\Services\Admin\HealthcheckService;
use App\Services\Media\Cdn\CdnProviderContract;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

/**
 * TCK-600 — `/api/health` ne sonde plus rien : il rend le statut agrégé que `health:probe` a laissé
 * en cache, sans détail. Le CDN se sonde dans la console (`/api/admin/health`, sonde `cdn`).
 */
class HealthCheckTest extends TestCase
{
    use RefreshDatabase;

    public function test_health_exposes_only_the_cached_aggregate_status(): void
    {
        Cache::put(HealthcheckService::STATUS_KEY, ['status' => 'ok', 'checked_at' => '2026-10-08T10:00:00.000000Z'], 600);

        $this->getJson('/api/health')
            ->assertOk()
            ->assertExactJson(['status' => 'ok', 'checked_at' => '2026-10-08T10:00:00.000000Z']);
    }

    public function test_admin_health_reports_a_degraded_cdn(): void
    {
        $cdn = $this->mock(CdnProviderContract::class);
        $cdn->shouldReceive('healthCheck')->once()->andReturn(false);
        config(['cdn.enabled' => true]);
        $this->actingAsRole('super_admin');

        $this->getJson('/api/admin/health')
            ->assertOk()
            ->assertJsonPath('data.cdn.status', 'degraded');
    }
}
