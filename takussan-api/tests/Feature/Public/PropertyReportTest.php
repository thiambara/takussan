<?php

namespace Tests\Feature\Public;

use App\Models\Property;
use App\Models\PropertyReport;
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
}
