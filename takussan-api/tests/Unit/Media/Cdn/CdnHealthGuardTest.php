<?php

namespace Tests\Unit\Media\Cdn;

use App\Services\Media\Cdn\CdnHealthGuard;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class CdnHealthGuardTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config([
            'cdn.health.threshold' => 3,
            'cdn.health.cooldown' => 300,
            'cdn.health.window' => 60,
        ]);

        Cache::flush();
    }

    public function test_circuit_closed_when_threshold_not_reached(): void
    {
        $guard = new CdnHealthGuard;

        $guard->recordFailure();
        $guard->recordFailure();

        $this->assertFalse($guard->isOpen());
    }

    public function test_circuit_opens_after_threshold_exceeded(): void
    {
        $guard = new CdnHealthGuard;

        $guard->recordFailure();
        $guard->recordFailure();
        $guard->recordFailure();

        $this->assertTrue($guard->isOpen());
    }

    public function test_circuit_resets_after_cooldown_expires(): void
    {
        $guard = new CdnHealthGuard;

        $guard->recordFailure();
        $guard->recordFailure();
        $guard->recordFailure();

        $this->assertTrue($guard->isOpen());

        Cache::forget(CdnHealthGuard::BREAKER_KEY);

        $this->assertFalse($guard->isOpen());
    }
}
