<?php

namespace Tests\Feature\Public;

use App\Models\Address;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PropertyContactTest extends TestCase
{
    use RefreshDatabase;

    public function test_returns_phone_and_prefilled_message(): void
    {
        $owner = User::factory()->create(['phone' => '+221771234567']);
        $property = Property::factory()->published()->create([
            'user_id' => $owner->id,
            'title' => 'Appartement Almadies',
            'price' => 350_000,
        ]);
        Address::create([
            'addressable_type' => Property::class,
            'addressable_id' => $property->id,
            'neighborhood' => 'Almadies',
            'city' => 'Dakar',
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
        $property = Property::factory()->draft()->create();
        $response = $this->getJson("/api/public/properties/{$property->slug}/contact");
        $response->assertNotFound();
    }
}
