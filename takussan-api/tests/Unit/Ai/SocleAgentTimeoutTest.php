<?php

namespace Tests\Unit\Ai;

use ReflectionMethod;
use Tests\Support\Ai\AgentDEssai;
use Tests\TestCase;

/**
 * Le SDK pose 60 s à tout agent qui ne dit rien (`Promptable::getTimeout()`) : trop court pour une
 * extraction longue. `SocleAgent::timeout()` lit `ai.timeout_seconds`.
 */
class SocleAgentTimeoutTest extends TestCase
{
    private function delaiDuSdk(AgentDEssai $agent): int
    {
        return (new ReflectionMethod($agent, 'getTimeout'))->invoke($agent, null);
    }

    public function test_a_socle_agent_reports_the_configured_timeout_to_the_sdk(): void
    {
        config(['ai.timeout_seconds' => 420]);

        $this->assertSame(420, $this->delaiDuSdk(new AgentDEssai));
    }

    public function test_the_default_is_five_minutes_not_the_sdk_sixty_seconds(): void
    {
        $this->assertSame(300, $this->delaiDuSdk(new AgentDEssai));
    }

    public function test_an_unusable_value_never_disarms_the_timeout(): void
    {
        config(['ai.timeout_seconds' => 0]);

        $this->assertSame(300, $this->delaiDuSdk(new AgentDEssai));
    }

    public function test_an_explicit_timeout_still_wins(): void
    {
        $agent = new AgentDEssai;

        $this->assertSame(15, (new ReflectionMethod($agent, 'getTimeout'))->invoke($agent, 15));
    }
}
