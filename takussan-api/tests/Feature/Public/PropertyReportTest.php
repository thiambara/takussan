<?php

namespace Tests\Feature\Public;

use App\Models\Property;
use App\Models\PropertyReport;
use App\Models\User;
use App\Support\VisitorFingerprint;
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
        // TCK-597 — l'IP n'est plus conservée en clair : une empreinte HMAC la remplace.
        $this->assertNull($report?->reporter_ip);
        $this->assertSame(VisitorFingerprint::ofIp('127.0.0.1'), $report?->reporter_fingerprint);
        $this->assertNull($report?->reporter_user_id);
    }

    /** TCK-597 (AC6) — le même visiteur, deux fois en 24 h : UNE ligne. Un autre visiteur : une autre. */
    public function test_the_same_visitor_reporting_twice_within_a_day_creates_one_row(): void
    {
        $property = Property::factory()->published()->create();
        $url = "/api/public/properties/{$property->slug}/report";

        $this->withHeader('X-Forwarded-For', '203.0.113.5')->postJson($url, ['reason' => 'spam'])->assertNoContent();
        $this->withHeader('X-Forwarded-For', '203.0.113.5')->postJson($url, ['reason' => 'fraud'])->assertNoContent();
        $this->assertSame(1, PropertyReport::where('property_id', $property->id)->count());

        $this->withHeader('X-Forwarded-For', '203.0.113.6')->postJson($url, ['reason' => 'spam'])->assertNoContent();
        $this->assertSame(2, PropertyReport::where('property_id', $property->id)->count());

        $this->travel(25)->hours();
        RateLimiter::clear('public:report:203.0.113.5');
        $this->withHeader('X-Forwarded-For', '203.0.113.5')->postJson($url, ['reason' => 'spam'])->assertNoContent();
        $this->assertSame(3, PropertyReport::where('property_id', $property->id)->count());
    }

    public function test_a_filled_honeypot_answers_204_and_records_nothing(): void
    {
        $property = Property::factory()->published()->create();

        $this->postJson("/api/public/properties/{$property->slug}/report", ['reason' => 'spam', 'company' => 'Bot SARL'])
            ->assertNoContent();

        $this->assertSame(0, PropertyReport::where('property_id', $property->id)->count());
    }

    public function test_a_bearer_token_attaches_the_reporter_account(): void
    {
        $property = Property::factory()->published()->create();
        $user = User::factory()->create();
        $token = $user->createToken('test-report')->plainTextToken;

        $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson("/api/public/properties/{$property->slug}/report", ['reason' => 'fraud'])
            ->assertNoContent();

        $this->assertSame($user->id, PropertyReport::firstWhere('property_id', $property->id)?->reporter_user_id);
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
        $this->assertSame(VisitorFingerprint::ofIp('198.51.100.42'), $report?->reporter_fingerprint);
    }
}
