<?php

namespace Tests\Feature\Services\Sms;

use App\Services\Notifications\Sms\OrangeDailyCapTracker;
use Tests\TestCase;

class OrangeDailyCapTrackerTest extends TestCase
{
    public function test_increments_tracks_capacity_per_msisdn(): void
    {
        $tracker = $this->app->make(OrangeDailyCapTracker::class);
        $msisdn = '+221771234567';
        $this->assertTrue($tracker->hasCapacity($msisdn));

        $tracker->increment($msisdn);
        $tracker->increment($msisdn);
        $this->assertTrue($tracker->hasCapacity($msisdn));
        $this->assertSame(2, $tracker->used($msisdn));

        $tracker->increment($msisdn);
        $this->assertFalse($tracker->hasCapacity($msisdn));
        $this->assertSame(3, $tracker->used($msisdn));
    }

    public function test_reset_clears_counter(): void
    {
        $tracker = $this->app->make(OrangeDailyCapTracker::class);
        $msisdn = '+221781111111';
        $tracker->increment($msisdn);
        $tracker->increment($msisdn);
        $tracker->reset($msisdn);
        $this->assertSame(0, $tracker->used($msisdn));
    }

    public function test_other_msisdn_unaffected(): void
    {
        $tracker = $this->app->make(OrangeDailyCapTracker::class);
        $tracker->increment('+221771111111');
        $tracker->increment('+221771111111');
        $tracker->increment('+221771111111');
        $this->assertFalse($tracker->hasCapacity('+221771111111'));
        $this->assertTrue($tracker->hasCapacity('+221772222222'));
    }
}
