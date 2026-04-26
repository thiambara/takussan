<?php

namespace Tests\Unit\Services\Sms;

use App\Services\Notifications\Sms\QuietHoursGuard;
use Carbon\CarbonImmutable;
use Illuminate\Config\Repository;
use PHPUnit\Framework\TestCase;

class QuietHoursGuardTest extends TestCase
{
    private function makeGuard(bool $enabled = true): QuietHoursGuard
    {
        $config = new Repository([
            'sms' => [
                'quiet_hours' => [
                    'enabled' => $enabled,
                    'timezone' => 'Africa/Dakar',
                    'start_hour' => 22,
                    'end_hour' => 6,
                ],
            ],
        ]);

        return new QuietHoursGuard($config);
    }

    public function test_inside_window_returns_true(): void
    {
        $guard = $this->makeGuard();
        // 23h00 Africa/Dakar
        $this->assertTrue($guard->isQuietNow(CarbonImmutable::parse('2026-04-26 23:00:00', 'Africa/Dakar')));
        // 02h30 Africa/Dakar
        $this->assertTrue($guard->isQuietNow(CarbonImmutable::parse('2026-04-26 02:30:00', 'Africa/Dakar')));
        // 05h59 Africa/Dakar
        $this->assertTrue($guard->isQuietNow(CarbonImmutable::parse('2026-04-26 05:59:00', 'Africa/Dakar')));
    }

    public function test_outside_window_returns_false(): void
    {
        $guard = $this->makeGuard();
        $this->assertFalse($guard->isQuietNow(CarbonImmutable::parse('2026-04-26 06:00:00', 'Africa/Dakar')));
        $this->assertFalse($guard->isQuietNow(CarbonImmutable::parse('2026-04-26 14:00:00', 'Africa/Dakar')));
        $this->assertFalse($guard->isQuietNow(CarbonImmutable::parse('2026-04-26 21:59:00', 'Africa/Dakar')));
    }

    public function test_critical_messages_are_never_deferred(): void
    {
        $guard = $this->makeGuard();
        $now = CarbonImmutable::parse('2026-04-26 23:30:00', 'Africa/Dakar');
        $this->assertFalse($guard->shouldDefer(true, $now));
        $this->assertTrue($guard->shouldDefer(false, $now));
    }

    public function test_disabling_returns_false(): void
    {
        $guard = $this->makeGuard(enabled: false);
        $this->assertFalse($guard->isQuietNow(CarbonImmutable::parse('2026-04-26 23:30:00', 'Africa/Dakar')));
    }

    public function test_next_window_end_returns_following_06h(): void
    {
        $guard = $this->makeGuard();
        $now = CarbonImmutable::parse('2026-04-26 23:30:00', 'Africa/Dakar');
        $end = $guard->nextWindowEnd($now);
        $this->assertSame('06', $end->format('H'));
        $this->assertSame('27', $end->format('d'));
    }
}
