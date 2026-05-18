<?php

namespace Tests\Feature\Public;

use App\Models\AppNotification;
use App\Models\Enums\CollaboratorRole;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\PropertyContactLead;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

class PropertyContactLeadTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        RateLimiter::clear('throttle:5,10|127.0.0.1');
    }

    public function test_anonymous_visitor_can_send_contact_lead(): void
    {
        $owner = User::factory()->create();
        $property = Property::factory()->published()->create(['user_id' => $owner->id]);

        $response = $this->postJson("/api/public/properties/{$property->slug}/contact-lead", [
            'name' => 'Awa Diop',
            'email' => 'awa@example.com',
            'phone' => '+221 77 123 45 67',
            'message' => 'Bonjour, je suis intéressée par ce bien — disponibilité ?',
        ]);

        $response->assertCreated()->assertJson(['data' => ['accepted' => true]]);

        $this->assertDatabaseHas('property_contact_leads', [
            'property_id' => $property->id,
            'recipient_user_id' => $owner->id,
            'name' => 'Awa Diop',
            'email' => 'awa@example.com',
        ]);
    }

    public function test_lead_routes_to_primary_agent_when_collaborator_exists(): void
    {
        $owner = User::factory()->create();
        $agent = User::factory()->create();
        $property = Property::factory()->published()->create(['user_id' => $owner->id]);
        PropertyCollaborator::create([
            'property_id' => $property->id,
            'user_id' => $agent->id,
            'role' => CollaboratorRole::Agent->value,
            'accepted_at' => now(),
        ]);

        $this->postJson("/api/public/properties/{$property->slug}/contact-lead", [
            'name' => 'Mamadou Sarr',
            'email' => 'mamadou@example.com',
            'message' => 'Je veux visiter ce week-end.',
        ])->assertCreated();

        $this->assertDatabaseHas('property_contact_leads', [
            'property_id' => $property->id,
            'recipient_user_id' => $agent->id,
        ]);

        $this->assertDatabaseHas(AppNotification::class, [
            'user_id' => $agent->id,
            'title' => 'Nouveau lead anonyme',
        ]);
    }

    public function test_invalid_email_returns_422(): void
    {
        $property = Property::factory()->published()->create();

        $this->postJson("/api/public/properties/{$property->slug}/contact-lead", [
            'name' => 'Test',
            'email' => 'not-an-email',
            'message' => 'Message valide ici.',
        ])->assertStatus(422)->assertJsonValidationErrors(['email']);
    }

    public function test_honeypot_silently_accepts_without_persisting(): void
    {
        $property = Property::factory()->published()->create();

        $this->postJson("/api/public/properties/{$property->slug}/contact-lead", [
            'name' => 'Spammer',
            'email' => 'spam@example.com',
            'message' => 'spam content here',
            'company' => 'evil-corp',
        ])->assertCreated();

        $this->assertDatabaseMissing('property_contact_leads', [
            'property_id' => $property->id,
        ]);
    }

    public function test_rate_limits_per_ip(): void
    {
        $property = Property::factory()->published()->create();
        $payload = [
            'name' => 'Loop',
            'email' => 'loop@example.com',
            'message' => 'Message valide ici.',
        ];

        for ($i = 0; $i < 5; $i++) {
            $this->postJson("/api/public/properties/{$property->slug}/contact-lead", $payload)
                ->assertCreated();
        }

        $this->postJson("/api/public/properties/{$property->slug}/contact-lead", $payload)
            ->assertStatus(429);

        $this->assertSame(5, PropertyContactLead::query()->count());
    }
}
