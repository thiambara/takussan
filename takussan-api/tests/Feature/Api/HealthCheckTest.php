<?php

namespace Tests\Feature\Api;

use App\Services\Media\Cdn\CdnProviderContract;
use Tests\TestCase;

class HealthCheckTest extends TestCase
{
    public function test_health_returns_ok_when_cdn_healthy(): void
    {
        $cdn = $this->mock(CdnProviderContract::class);
        $cdn->shouldReceive('healthCheck')->once()->andReturn(true);

        config(['cdn.enabled' => true]);

        $this->getJson('/api/health')
            ->assertOk()
            ->assertJsonPath('checks.cdn', 'ok');
    }

    public function test_health_returns_degraded_when_cdn_fails(): void
    {
        $cdn = $this->mock(CdnProviderContract::class);
        $cdn->shouldReceive('healthCheck')->once()->andReturn(false);

        config(['cdn.enabled' => true]);

        $this->getJson('/api/health')
            ->assertOk()
            ->assertJsonPath('checks.cdn', 'degraded');
    }
}
