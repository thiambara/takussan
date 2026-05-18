<?php

namespace Tests\Feature\Public;

use App\Models\Property;
use App\Models\PropertyReport;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

class PropertyReportTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        RateLimiter::clear('public:report:127.0.0.1');
    }

    public function test_authenticated_or_anonymous_report_returns_204_and_persists(): void
    {
        $property = Property::factory()->published()->create();

        $response = $this->postJson("/api/public/properties/{$property->slug}/report", [
            'reason' => 'spam',
            'details' => 'Listing suspicious',
        ]);

        $response->assertNoContent();
        $this->assertDatabaseHas('property_reports', [
            'property_id' => $property->id,
            'reason' => 'spam',
            'details' => 'Listing suspicious',
        ]);
        $report = PropertyReport::firstWhere('property_id', $property->id);
        $this->assertNotNull($report?->reporter_ip);
        $this->assertNull($report?->reporter_user_id);
    }

    public function test_invalid_reason_returns_422(): void
    {
        $property = Property::factory()->published()->create();

        $this->postJson("/api/public/properties/{$property->slug}/report", [
            'reason' => 'invalid_reason',
        ])->assertUnprocessable();
    }

    public function test_unknown_slug_returns_404(): void
    {
        $this->postJson('/api/public/properties/unknown-slug/report', [
            'reason' => 'spam',
        ])->assertNotFound();
    }

    public function test_throttles_after_five_requests_per_hour(): void
    {
        $property = Property::factory()->published()->create();
        $payload = ['reason' => 'spam'];

        for ($i = 0; $i < 5; $i++) {
            $this->postJson("/api/public/properties/{$property->slug}/report", $payload)
                ->assertNoContent();
        }

        $this->postJson("/api/public/properties/{$property->slug}/report", $payload)
            ->assertStatus(429);
    }

    public function test_throttle_keyed_per_visitor_ip_via_x_forwarded_for(): void
    {
        // When the API sits behind a Next.js server action proxy, every
        // visitor's request originates from the same Next.js IP. Without
        // TrustProxies + X-Forwarded-For, all anonymous visitors share the
        // same throttle bucket — one user's 5 reports lock everyone out.
        // This test asserts the throttle is keyed on the *visitor* IP.
        $property = Property::factory()->published()->create();
        $payload = ['reason' => 'spam'];

        // Visitor A exhausts their personal budget.
        for ($i = 0; $i < 5; $i++) {
            $this->withHeader('X-Forwarded-For', '203.0.113.10')
                ->postJson("/api/public/properties/{$property->slug}/report", $payload)
                ->assertNoContent();
        }
        $this->withHeader('X-Forwarded-For', '203.0.113.10')
            ->postJson("/api/public/properties/{$property->slug}/report", $payload)
            ->assertStatus(429);

        // Visitor B — different IP, must not be impacted.
        $this->withHeader('X-Forwarded-For', '203.0.113.20')
            ->postJson("/api/public/properties/{$property->slug}/report", $payload)
            ->assertNoContent();
    }

    public function test_authenticated_throttle_keyed_per_user_so_shared_ip_does_not_block_others(): void
    {
        // Two authenticated visitors share the same forwarded IP (corporate
        // NAT, public WiFi). User A burning their hourly quota must not lock
        // user B out — the named limiter keys on `user:<id>` when a valid
        // Sanctum token is present and only falls back to the IP otherwise.
        $property = Property::factory()->published()->create();
        $userA = User::factory()->create();
        $userB = User::factory()->create();
        $tokenA = $userA->createToken('test-report')->plainTextToken;
        $tokenB = $userB->createToken('test-report')->plainTextToken;
        $payload = ['reason' => 'spam'];

        for ($i = 0; $i < 5; $i++) {
            $this->withHeaders([
                'X-Forwarded-For' => '203.0.113.77',
                'Authorization' => "Bearer {$tokenA}",
            ])
                ->postJson("/api/public/properties/{$property->slug}/report", $payload)
                ->assertNoContent();
        }
        $this->withHeaders([
            'X-Forwarded-For' => '203.0.113.77',
            'Authorization' => "Bearer {$tokenA}",
        ])
            ->postJson("/api/public/properties/{$property->slug}/report", $payload)
            ->assertStatus(429);

        $this->withHeaders([
            'X-Forwarded-For' => '203.0.113.77',
            'Authorization' => "Bearer {$tokenB}",
        ])
            ->postJson("/api/public/properties/{$property->slug}/report", $payload)
            ->assertNoContent();
    }

    public function test_reporter_ip_records_visitor_ip_when_behind_trusted_proxy(): void
    {
        $property = Property::factory()->published()->create();

        $this->withHeader('X-Forwarded-For', '198.51.100.42')
            ->postJson("/api/public/properties/{$property->slug}/report", [
                'reason' => 'spam',
            ])
            ->assertNoContent();

        $report = PropertyReport::firstWhere('property_id', $property->id);
        $this->assertSame('198.51.100.42', $report?->reporter_ip);
    }
}
