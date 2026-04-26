<?php

namespace Tests\Unit\Services\Sms;

use App\Services\Notifications\Sms\OperatorResolver;
use Illuminate\Config\Repository;
use PHPUnit\Framework\TestCase;

class OperatorResolverTest extends TestCase
{
    private function makeResolver(): OperatorResolver
    {
        $config = new Repository([
            'sms' => [
                'operator_prefixes' => [
                    '+221' => [
                        '77' => 'orange',
                        '78' => 'orange',
                        '76' => 'free',
                        '70' => 'expresso',
                        '75' => 'expresso',
                    ],
                ],
            ],
        ]);

        return new OperatorResolver($config);
    }

    public function test_resolves_each_senegal_operator_prefix(): void
    {
        $r = $this->makeResolver();
        $this->assertSame('orange', $r->resolve('+221771234567'));
        $this->assertSame('orange', $r->resolve('+221781234567'));
        $this->assertSame('free', $r->resolve('+221761234567'));
        $this->assertSame('expresso', $r->resolve('+221701234567'));
        $this->assertSame('expresso', $r->resolve('+221751234567'));
    }

    public function test_unknown_prefix_resolves_to_null(): void
    {
        $r = $this->makeResolver();
        $this->assertNull($r->resolve('+447911123456'));
        $this->assertNull($r->resolve('+221331234567'));
        $this->assertNull($r->resolve('not-a-phone'));
    }

    public function test_group_by_operator_returns_buckets(): void
    {
        $groups = $this->makeResolver()->groupByOperator([
            '+221771111111',
            '+221761111111',
            '+221701111111',
            '+447911123456',
        ]);

        $this->assertSame(['+221771111111'], $groups['orange']);
        $this->assertSame(['+221761111111'], $groups['free']);
        $this->assertSame(['+221701111111'], $groups['expresso']);
        $this->assertSame(['+447911123456'], $groups['default']);
    }
}
