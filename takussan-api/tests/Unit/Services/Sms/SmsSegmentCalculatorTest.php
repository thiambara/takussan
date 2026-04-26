<?php

namespace Tests\Unit\Services\Sms;

use App\Services\Notifications\Sms\SmsSegmentCalculator;
use PHPUnit\Framework\TestCase;

class SmsSegmentCalculatorTest extends TestCase
{
    public function test_short_ascii_message_is_one_segment(): void
    {
        $this->assertSame(1, SmsSegmentCalculator::segmentsCount('hello'));
    }

    public function test_ascii_at_160_chars_is_one_segment(): void
    {
        $this->assertSame(1, SmsSegmentCalculator::segmentsCount(str_repeat('a', 160)));
    }

    public function test_ascii_above_160_breaks_at_153_per_segment(): void
    {
        $this->assertSame(2, SmsSegmentCalculator::segmentsCount(str_repeat('a', 161)));
        $this->assertSame(2, SmsSegmentCalculator::segmentsCount(str_repeat('a', 306)));
        $this->assertSame(3, SmsSegmentCalculator::segmentsCount(str_repeat('a', 307)));
    }

    public function test_unicode_short_is_one_segment(): void
    {
        $this->assertTrue(SmsSegmentCalculator::isUnicode('Bonsoir é'));
        $this->assertSame(1, SmsSegmentCalculator::segmentsCount('Bonsoir é'));
    }

    public function test_unicode_above_70_breaks_at_67_per_segment(): void
    {
        $this->assertSame(2, SmsSegmentCalculator::segmentsCount('é'.str_repeat('a', 70)));
    }
}
