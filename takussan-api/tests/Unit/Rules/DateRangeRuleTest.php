<?php

namespace Tests\Unit\Rules;

use App\Rules\DateRangeRule;
use Illuminate\Support\Facades\Validator;
use Tests\TestCase;

class DateRangeRuleTest extends TestCase
{
    public function test_passes_when_end_is_after_start(): void
    {
        $validator = Validator::make(
            ['start_date' => '2026-04-01', 'end_date' => '2026-04-10'],
            ['end_date' => [new DateRangeRule('start_date')]],
        );

        $this->assertTrue($validator->passes());
    }

    public function test_passes_when_dates_are_equal(): void
    {
        $validator = Validator::make(
            ['start_date' => '2026-04-01', 'end_date' => '2026-04-01'],
            ['end_date' => [new DateRangeRule('start_date')]],
        );

        $this->assertTrue($validator->passes());
    }

    public function test_fails_when_end_is_before_start(): void
    {
        $validator = Validator::make(
            ['start_date' => '2026-04-10', 'end_date' => '2026-04-01'],
            ['end_date' => [new DateRangeRule('start_date')]],
        );

        $this->assertTrue($validator->fails());
    }

    public function test_passes_when_start_is_missing(): void
    {
        $validator = Validator::make(
            ['end_date' => '2026-04-01'],
            ['end_date' => [new DateRangeRule('start_date')]],
        );

        $this->assertTrue($validator->passes());
    }
}
