<?php

namespace Tests\Feature\Public;

use App\Models\Property;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PropertyContactTest extends TestCase
{
    use RefreshDatabase;

    public function test_returns_phone_and_prefilled_message(): void
    {
        $property = Property::factory()->published()->create([
            'owner_phone' => '+221771234567',
            'title' => 'Appartement Almadies',
            'price' => 350_000,
            'location_quarter' => 'Almadies',
            'location_city' => 'Dakar',
        ]);

        $response = $this->getJson("/api/public/properties/{$property->slug}/contact");

        $response->assertOk()
            ->assertJsonStructure(['phone', 'message'])
            ->assertJsonPath('phone', '+221771234567');

        $this->assertStringContainsString('Takussan.sn', $response->json('message'));
        $this->assertStringContainsString('Appartement Almadies', $response->json('message'));
    }

    public function test_contact_returns_404_for_draft(): void
    {
        $property = Property::factory()->create(); // draft
        $response = $this->getJson("/api/public/properties/{$property->slug}/contact");
        $response->assertNotFound();
    }
}
