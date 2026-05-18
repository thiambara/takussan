<?php

namespace Tests\Feature\Public;

use App\Models\Enums\VisitStatus;
use App\Models\Enums\VisitType;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PropertyVisitRequestTest extends TestCase
{
    use RefreshDatabase;

    public function test_anonymous_visit_request_with_contact_triplet_returns_201(): void
    {
        $property = Property::factory()->published()->create();

        $response = $this->postJson("/api/public/properties/{$property->slug}/visit-request", [
            'scheduled_at' => now()->addDays(2)->toIso8601String(),
            'visitor_name' => 'Awa Ndiaye',
            'visitor_email' => 'awa@example.com',
            'visitor_phone' => '+221770000000',
        ]);

        $response->assertCreated()->assertJsonStructure([
            'data' => ['id', 'property_id', 'status', 'type', 'scheduled_at'],
        ]);

        $this->assertDatabaseHas('property_visits', [
            'property_id' => $property->id,
            'visitor_id' => null,
            'visitor_email' => 'awa@example.com',
            'visitor_phone' => '+221770000000',
            'status' => VisitStatus::Scheduled->value,
            'type' => VisitType::InPerson->value,
        ]);
    }

    public function test_authenticated_visit_request_returns_201_and_uses_user(): void
    {
        $property = Property::factory()->published()->create();
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $response = $this->postJson("/api/public/properties/{$property->slug}/visit-request", [
            'scheduled_at' => now()->addDays(3)->toIso8601String(),
            'duration_minutes' => 45,
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('property_visits', [
            'property_id' => $property->id,
            'visitor_id' => $user->id,
            'duration_minutes' => 45,
            'status' => VisitStatus::Scheduled->value,
        ]);
    }

    /**
     * Real Bearer token flow (no Sanctum::actingAs): the route lives outside
     * `auth:sanctum`, so the `ResolveActiveProfile` middleware must resolve
     * the user from the token and propagate it to the default guard so
     * `$request->user()` works in the controller. Without this, anonymous
     * validation rules kick in and the request 422s on `visitor_name`.
     */
    public function test_authenticated_visit_request_with_bearer_token_recognises_user(): void
    {
        $property = Property::factory()->published()->create();
        $user = User::factory()->create();
        $token = $user->createToken('test-visit')->plainTextToken;

        $response = $this->postJson(
            "/api/public/properties/{$property->slug}/visit-request",
            [
                'scheduled_at' => now()->addDays(2)->toIso8601String(),
                'type' => VisitType::InPerson->value,
            ],
            ['Authorization' => "Bearer {$token}"],
        );

        $response->assertCreated();
        $this->assertDatabaseHas('property_visits', [
            'property_id' => $property->id,
            'visitor_id' => $user->id,
            'status' => VisitStatus::Scheduled->value,
        ]);
    }

    public function test_anonymous_missing_contact_returns_422(): void
    {
        $property = Property::factory()->published()->create();

        $this->postJson("/api/public/properties/{$property->slug}/visit-request", [
            'scheduled_at' => now()->addDays(1)->toIso8601String(),
        ])->assertUnprocessable();
    }

    public function test_scheduled_in_past_returns_422(): void
    {
        $property = Property::factory()->published()->create();

        $this->postJson("/api/public/properties/{$property->slug}/visit-request", [
            'scheduled_at' => now()->subDay()->toIso8601String(),
            'visitor_name' => 'A',
            'visitor_email' => 'a@b.com',
            'visitor_phone' => '+221770000000',
        ])->assertUnprocessable();
    }

    public function test_authenticated_throttle_keyed_per_user_so_shared_ip_does_not_block_others(): void
    {
        // Two authenticated visitors share the same forwarded IP. User A
        // burning the 10/hour quota must not lock user B out — the named
        // limiter keys on `user:<id>` when a valid Sanctum token is present.
        $property = Property::factory()->published()->create();
        $userA = User::factory()->create();
        $userB = User::factory()->create();
        $tokenA = $userA->createToken('test-visit')->plainTextToken;
        $tokenB = $userB->createToken('test-visit')->plainTextToken;
        $payload = [
            'scheduled_at' => now()->addDays(2)->toIso8601String(),
            'type' => VisitType::InPerson->value,
        ];

        for ($i = 0; $i < 10; $i++) {
            $this->withHeaders([
                'X-Forwarded-For' => '203.0.113.88',
                'Authorization' => "Bearer {$tokenA}",
            ])
                ->postJson("/api/public/properties/{$property->slug}/visit-request", $payload)
                ->assertCreated();
        }
        $this->withHeaders([
            'X-Forwarded-For' => '203.0.113.88',
            'Authorization' => "Bearer {$tokenA}",
        ])
            ->postJson("/api/public/properties/{$property->slug}/visit-request", $payload)
            ->assertStatus(429);

        $this->withHeaders([
            'X-Forwarded-For' => '203.0.113.88',
            'Authorization' => "Bearer {$tokenB}",
        ])
            ->postJson("/api/public/properties/{$property->slug}/visit-request", $payload)
            ->assertCreated();
    }

    public function test_unknown_slug_returns_404(): void
    {
        $this->postJson('/api/public/properties/unknown-slug/visit-request', [
            'scheduled_at' => now()->addDay()->toIso8601String(),
        ])->assertNotFound();
    }
}
